"""Tests HTTP de POST /api/speech (Fase 7). Monkeypatchea el cliente
interno de OpenAI TTS: ningún test hace llamadas de red."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


class FakeSpeechClient:
    def __init__(self, *, audio: bytes = b"FAKE_MP3"):
        self._audio = audio
        self.calls: list[dict] = []

    def create_speech(self, *, model, voice, instructions, speed, text):
        self.calls.append({"model": model, "voice": voice, "speed": speed, "text": text})
        return self._audio


def _client(tmp_path, **settings_kwargs):
    def _override_settings() -> Settings:
        return Settings(
            content_dir=str(tmp_path / "content"),
            speech_cache_dir=str(tmp_path / "speech-cache"),
            **settings_kwargs,
        )

    app.dependency_overrides[get_settings] = _override_settings
    return TestClient(app)


def test_speech_without_credential_returns_503(tmp_path):
    client = _client(tmp_path, openai_api_key="")
    response = client.post("/api/speech", json={"text": "hola"})
    assert response.status_code == 503
    app.dependency_overrides.clear()


def test_speech_returns_audio_mpeg(tmp_path, monkeypatch):
    fake = FakeSpeechClient()
    monkeypatch.setattr(
        "app.services.speech_service._OpenAISpeechClient", lambda api_key: fake
    )
    client = _client(tmp_path, openai_api_key="sk-fake")
    response = client.post("/api/speech", json={"text": "Bienvenido a esta clase."})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"FAKE_MP3"
    app.dependency_overrides.clear()


def test_speech_empty_text_returns_422(tmp_path):
    client = _client(tmp_path, openai_api_key="sk-fake")
    response = client.post("/api/speech", json={"text": ""})
    assert response.status_code == 422
    app.dependency_overrides.clear()


def test_speech_too_long_returns_422(tmp_path):
    client = _client(tmp_path, openai_api_key="sk-fake")
    response = client.post("/api/speech", json={"text": "x" * 5001})
    assert response.status_code == 422
    app.dependency_overrides.clear()


def test_speech_rejects_extra_fields_like_api_key(tmp_path, monkeypatch):
    """El frontend nunca puede enviar api_key/model/voice/instructions —
    Pydantic (extra='ignore' por default de FastAPI/BaseModel estricto en
    este proyecto) simplemente los ignora si se envían; lo importante es
    que NUNCA se usan para la síntesis."""
    fake = FakeSpeechClient()
    monkeypatch.setattr(
        "app.services.speech_service._OpenAISpeechClient", lambda api_key: fake
    )
    client = _client(tmp_path, openai_api_key="sk-real-backend-key")
    response = client.post(
        "/api/speech",
        json={"text": "hola", "api_key": "sk-attacker-supplied", "model": "other-model"},
    )
    assert response.status_code == 200
    assert fake.calls[0]["model"] != "other-model"
    app.dependency_overrides.clear()


def test_speech_response_never_contains_api_key(tmp_path):
    client = _client(tmp_path, openai_api_key="")
    response = client.post("/api/speech", json={"text": "hola"})
    assert "sk-" not in response.text
    app.dependency_overrides.clear()


def test_speech_response_includes_request_id_header(tmp_path, monkeypatch):
    fake = FakeSpeechClient()
    monkeypatch.setattr(
        "app.services.speech_service._OpenAISpeechClient", lambda api_key: fake
    )
    client = _client(tmp_path, openai_api_key="sk-fake")
    response = client.post("/api/speech", json={"text": "hola"})
    assert "x-request-id" in response.headers
    app.dependency_overrides.clear()
