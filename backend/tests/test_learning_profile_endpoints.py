"""Tests HTTP de GET /api/courses/{course_id}/learning-profile (v1.7.0,
Bloque 4). Reutiliza el fixture `client` (Postgres real, ver
tests/conftest.py) sobre el curriculum de `content_dir`
(curso-de-prueba/fundamentos/{introduccion,componentes},
arquitecturas/arquitectura-empresarial), y el mismo patrón de
`test_certification_history_endpoints.py` para el caso Postgres-caído."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app

COURSE = "curso-de-prueba"
MODULE = "fundamentos"
TOPIC = "introduccion"
_URL = f"/api/courses/{COURSE}/learning-profile"


def test_new_user_gets_all_not_started(client):
    resp = client.get(_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["course_id"] == COURSE
    assert body["summary"] == {
        "total_topics": 3, "not_started": 3, "progressing": 0, "needs_review": 0, "mastered": 0,
    }
    assert len(body["topics"]) == 3
    assert all(t["curricular_status"] == "not_started" for t in body["topics"])
    assert all(t["learning_status"] == "not_started" for t in body["topics"])
    assert all(t["reason_code"] == "NOT_STARTED" for t in body["topics"])
    assert all(t["observation_count"] == 0 for t in body["topics"])
    assert all(t["recent_average"] is None for t in body["topics"])


def test_invalid_course_returns_404(client):
    resp = client.get("/api/courses/curso-que-no-existe/learning-profile")
    assert resp.status_code == 404


def test_topic_order_matches_curriculum_order(client):
    body = client.get(_URL).json()
    pairs = [(t["module_id"], t["topic_id"]) for t in body["topics"]]
    assert pairs == [
        ("fundamentos", "introduccion"),
        ("fundamentos", "componentes"),
        ("arquitecturas", "arquitectura-empresarial"),
    ]


def test_topics_carry_real_module_and_topic_titles(client):
    body = client.get(_URL).json()
    intro = next(t for t in body["topics"] if t["topic_id"] == TOPIC)
    assert intro["module_title"] == "Fundamentos"
    assert intro["topic_title"] == "Introducción"


def test_progress_reflected_in_profile(client):
    client.put(f"/api/progress/{COURSE}/{MODULE}/{TOPIC}", json={"action": "complete"})
    body = client.get(_URL).json()
    intro = next(t for t in body["topics"] if t["topic_id"] == TOPIC)
    assert intro["curricular_status"] == "completed"
    assert intro["learning_status"] == "progressing"
    assert intro["reason_code"] == "COMPLETED_NO_ASSESSMENT"
    assert body["summary"]["progressing"] == 1
    assert body["summary"]["not_started"] == 2


def test_two_dev_users_have_isolated_profiles(client):
    client.put(
        f"/api/progress/{COURSE}/{MODULE}/{TOPIC}",
        json={"action": "complete"},
        headers={"X-Dev-User": "student-a"},
    )
    a_view = client.get(_URL, headers={"X-Dev-User": "student-a"}).json()
    b_view = client.get(_URL, headers={"X-Dev-User": "student-b"}).json()
    assert a_view["summary"]["progressing"] == 1
    assert b_view["summary"]["not_started"] == 3


def test_get_is_read_only_never_mutates_progress(client):
    client.get(_URL)
    client.get(_URL)
    assert client.get(f"/api/progress/{COURSE}").json()["topics"] == []


def test_no_user_id_spoofing_via_query_or_body(client):
    """GET no acepta ningún override de identidad -- ni query param ni
    body (que de todos modos un GET nunca envía) pueden suplantar a otro
    usuario; la identidad siempre sale de `get_current_app_user`."""
    client.put(
        f"/api/progress/{COURSE}/{MODULE}/{TOPIC}",
        json={"action": "complete"},
        headers={"X-Dev-User": "student-a"},
    )
    spoofed = client.get(
        f"{_URL}?user_id=11111111-1111-1111-1111-111111111111",
        headers={"X-Dev-User": "student-b"},
    ).json()
    assert spoofed["summary"]["not_started"] == 3  # sigue viendo el perfil vacío de student-b


def test_profile_returns_503_never_500_when_postgres_unreachable(content_dir, tmp_path):
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
        response = TestClient(app).get(_URL)
        assert response.status_code == 503
        assert "no está disponible" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()
