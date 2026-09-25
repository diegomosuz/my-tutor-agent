"""Tests HTTP de GET /api/me (v1.7.0, Bloque 1) -- resolución de identidad
end-to-end vía DevIdentityProvider + Application User Resolver + Postgres
real (fixture `client`, ver tests/conftest.py)."""
from __future__ import annotations


def test_me_without_header_returns_stable_default_user(client):
    first = client.get("/api/me")
    assert first.status_code == 200
    body = first.json()
    assert body["provider"] == "dev"
    assert body["id"]

    second = client.get("/api/me")
    assert second.json()["id"] == body["id"]


def test_me_never_exposes_db_internals(client):
    response = client.get("/api/me")
    body = response.json()
    assert set(body.keys()) == {"id", "display_name", "email", "provider"}


def test_me_dev_user_header_creates_distinct_and_stable_users(client):
    default_id = client.get("/api/me").json()["id"]
    student_a = client.get("/api/me", headers={"X-Dev-User": "student-a"}).json()
    student_b = client.get("/api/me", headers={"X-Dev-User": "student-b"}).json()

    assert student_a["id"] != default_id
    assert student_b["id"] != default_id
    assert student_a["id"] != student_b["id"]

    student_a_again = client.get("/api/me", headers={"X-Dev-User": "student-a"}).json()
    assert student_a_again["id"] == student_a["id"]


def test_me_rejects_empty_dev_user_header(client):
    response = client.get("/api/me", headers={"X-Dev-User": ""})
    assert response.status_code == 400


def test_me_rejects_dev_user_header_over_length_limit(client):
    response = client.get("/api/me", headers={"X-Dev-User": "a" * 200})
    assert response.status_code == 400


def test_me_rejects_dev_user_header_with_unsafe_characters(client):
    response = client.get("/api/me", headers={"X-Dev-User": "student a"})
    assert response.status_code == 400


def test_me_returns_503_never_500_when_postgres_unreachable(tmp_path):
    """Regresión de un bug real de QA (v1.7.0, Bloque 1): con Postgres
    caído, GET /api/me devolvía un 500 crudo (sqlalchemy.exc.OperationalError
    sin capturar) en vez de un error claro -- ver app/dependencies.py."""
    from fastapi.testclient import TestClient

    from app.config import Settings, get_settings
    from app.main import app

    content_dir = tmp_path / "content"
    content_dir.mkdir()

    def _override_settings() -> Settings:
        return Settings(
            content_dir=str(content_dir),
            lesson_cache_dir=str(tmp_path / "lesson-cache"),
            certification_cache_dir=str(tmp_path / "cert-cache"),
            speech_cache_dir=str(tmp_path / "speech-cache"),
            database_url="postgresql+psycopg://baduser:badpass@nonexistent-host-pwc-tutor:5432/nodb",
        )

    app.dependency_overrides[get_settings] = _override_settings
    try:
        response = TestClient(app).get("/api/me")
        assert response.status_code == 503
        assert "no está disponible" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()
