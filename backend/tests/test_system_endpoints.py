"""Tests HTTP de /api/system/status, /api/system/course-diagnostics,
/api/ready y el middleware de X-Request-ID (Fase 7)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


def _client(tmp_path, **settings_kwargs):
    content_dir = tmp_path / "content"
    module = content_dir / "curso-demo" / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-topico.md").write_text("# Tema\n\nContenido.\n", encoding="utf-8")

    def _override_settings() -> Settings:
        return Settings(
            content_dir=str(content_dir),
            lesson_cache_dir=str(tmp_path / "lesson-cache"),
            certification_cache_dir=str(tmp_path / "cert-cache"),
            speech_cache_dir=str(tmp_path / "speech-cache"),
            **settings_kwargs,
        )

    app.dependency_overrides[get_settings] = _override_settings
    return TestClient(app)


def test_system_status_never_exposes_api_keys(tmp_path):
    client = _client(tmp_path, openai_api_key="sk-super-secret-value", pwc_genai_api_key="pwc-secret")
    response = client.get("/api/system/status")
    assert response.status_code == 200
    body_text = response.text
    assert "sk-super-secret-value" not in body_text
    assert "pwc-secret" not in body_text
    app.dependency_overrides.clear()


def test_system_status_reports_course_count(tmp_path):
    client = _client(tmp_path)
    response = client.get("/api/system/status")
    body = response.json()
    assert body["courses"]["count"] == 1
    assert body["app_version"]
    assert body["backend"] == "ok"
    app.dependency_overrides.clear()


def test_system_status_works_without_any_credential(tmp_path):
    client = _client(tmp_path, openai_api_key="", pwc_genai_api_key="", gen_ai_api_key="")
    response = client.get("/api/system/status")
    assert response.status_code == 200
    assert response.json()["llm"]["configured"] is False
    app.dependency_overrides.clear()


def test_course_diagnostics_endpoint_reports_ok_course(tmp_path):
    client = _client(tmp_path)
    response = client.get("/api/system/course-diagnostics")
    assert response.status_code == 200
    body = response.json()
    assert body["course_count"] == 1
    assert body["reports"][0]["status"] == "ok"
    app.dependency_overrides.clear()


def test_ready_endpoint_true_when_content_and_data_ok(tmp_path):
    client = _client(tmp_path)
    response = client.get("/api/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["content_readable"] is True
    assert body["data_writable"] is True
    app.dependency_overrides.clear()


def test_ready_never_requires_llm_credential(tmp_path):
    client = _client(tmp_path, openai_api_key="", pwc_genai_api_key="")
    response = client.get("/api/ready")
    assert response.json()["status"] == "ready"
    app.dependency_overrides.clear()


def test_health_endpoint_still_works(tmp_path):
    client = _client(tmp_path)
    response = client.get("/api/health")
    assert response.status_code == 200
    app.dependency_overrides.clear()


def test_request_id_generated_when_not_provided(tmp_path):
    client = _client(tmp_path)
    response = client.get("/api/health")
    assert "x-request-id" in response.headers
    assert len(response.headers["x-request-id"]) > 0
    app.dependency_overrides.clear()


def test_request_id_echoed_back_when_provided(tmp_path):
    client = _client(tmp_path)
    response = client.get("/api/health", headers={"X-Request-ID": "my-custom-id-123"})
    assert response.headers["x-request-id"] == "my-custom-id-123"
    app.dependency_overrides.clear()


def test_request_id_replaced_when_malformed(tmp_path):
    client = _client(tmp_path)
    response = client.get("/api/health", headers={"X-Request-ID": "bad id with spaces!"})
    assert response.headers["x-request-id"] != "bad id with spaces!"
    app.dependency_overrides.clear()


def test_request_id_replaced_when_excessively_long(tmp_path):
    """Fase 8, sección 19: un X-Request-ID desproporcionadamente largo
    (potencial vector de log flooding / header abuse) nunca debe romper el
    middleware ni propagarse tal cual — se reemplaza por un UUID nuevo,
    igual que cualquier otro formato inválido."""
    client = _client(tmp_path)
    too_long = "a" * 5000
    response = client.get("/api/health", headers={"X-Request-ID": too_long})
    assert response.status_code == 200
    assert response.headers["x-request-id"] != too_long
    assert len(response.headers["x-request-id"]) < 200
    app.dependency_overrides.clear()


def test_security_headers_present(tmp_path):
    client = _client(tmp_path)
    response = client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "referrer-policy" in response.headers
    app.dependency_overrides.clear()


def test_llm_provider_never_coupled_to_voice_provider_both_configured(tmp_path):
    """LLM_PROVIDER=pwc + VOICE_PROVIDER=openai es válido si ambas
    credenciales existen (sección 38 de la Fase 7): son configuraciones
    independientes, nunca acopladas entre sí."""
    client = _client(
        tmp_path,
        llm_provider="pwc",
        pwc_genai_api_key="pwc-secret",
        voice_provider="openai",
        openai_api_key="sk-real-key",
    )
    response = client.get("/api/system/status")
    body = response.json()
    assert body["llm"]["provider"] == "pwc"
    assert body["llm"]["configured"] is True
    assert body["voice"]["provider"] == "openai"
    assert body["voice"]["neural_configured"] is True
    app.dependency_overrides.clear()


def test_llm_provider_never_coupled_to_voice_provider_only_llm_configured(tmp_path):
    """LLM_PROVIDER=pwc + VOICE_PROVIDER=browser sin credencial de OpenAI
    también es válido: la app sigue funcionando con voz del navegador."""
    client = _client(
        tmp_path,
        llm_provider="pwc",
        pwc_genai_api_key="pwc-secret",
        voice_provider="browser",
        openai_api_key="",
    )
    response = client.get("/api/system/status")
    body = response.json()
    assert body["llm"]["configured"] is True
    assert body["voice"]["provider"] == "browser"
    assert body["voice"]["neural_configured"] is False
    app.dependency_overrides.clear()
