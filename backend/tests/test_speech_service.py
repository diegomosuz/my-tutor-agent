"""Tests de SpeechService (Fase 7, sección 35). Mockea el cliente TTS
(nunca el SDK real ni Internet). Cubre: configured true/false, cache
hit/miss, texto vacío/máximo, errores auth/upstream, y que la cache key
cambie por voice/text/instructions/speed."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.config import Settings
from app.services import speech_service
from app.services.speech_service import (
    SpeechAuthError,
    SpeechConfigurationError,
    SpeechUpstreamError,
    is_speech_configured,
    synthesize_speech,
)


class FakeSpeechClient:
    def __init__(self, *, audio: bytes | Exception = b"FAKE_MP3_BYTES"):
        self._audio = audio
        self.calls: list[dict] = []

    def create_speech(self, *, model, voice, instructions, speed, text):
        self.calls.append(
            {"model": model, "voice": voice, "instructions": instructions, "speed": speed, "text": text}
        )
        if isinstance(self._audio, Exception):
            raise self._audio
        return self._audio


def _settings(tmp_path: Path, **overrides) -> Settings:
    return Settings(
        speech_cache_dir=str(tmp_path / "speech-cache"),
        openai_api_key=overrides.pop("openai_api_key", "sk-fake"),
        voice_provider=overrides.pop("voice_provider", "auto"),
        **overrides,
    )


def test_is_speech_configured_true_when_key_present_and_not_browser(tmp_path):
    settings = _settings(tmp_path)
    assert is_speech_configured(settings) is True


def test_is_speech_configured_false_without_key(tmp_path):
    settings = _settings(tmp_path, openai_api_key="")
    assert is_speech_configured(settings) is False


def test_is_speech_configured_false_when_voice_provider_is_browser(tmp_path):
    settings = _settings(tmp_path, voice_provider="browser")
    assert is_speech_configured(settings) is False


def test_synthesize_raises_configuration_error_without_key(tmp_path):
    settings = _settings(tmp_path, openai_api_key="")
    with pytest.raises(SpeechConfigurationError):
        synthesize_speech(settings=settings, text="hola", client=FakeSpeechClient())


def test_synthesize_uses_configured_model_and_voice(tmp_path):
    settings = _settings(tmp_path)
    settings.openai_tts_model = "gpt-4o-mini-tts"
    settings.openai_tts_voice = "marin"
    client = FakeSpeechClient()
    synthesize_speech(settings=settings, text="Bienvenido a la clase.", client=client)
    assert client.calls[0]["model"] == "gpt-4o-mini-tts"
    assert client.calls[0]["voice"] == "marin"
    assert client.calls[0]["text"] == "Bienvenido a la clase."


def test_empty_text_rejected(tmp_path):
    settings = _settings(tmp_path)
    with pytest.raises(ValueError):
        synthesize_speech(settings=settings, text="   ", client=FakeSpeechClient())


def test_text_over_max_length_rejected(tmp_path):
    settings = _settings(tmp_path)
    with pytest.raises(ValueError):
        synthesize_speech(settings=settings, text="x" * 5001, client=FakeSpeechClient())


def test_no_api_key_ever_appears_in_error_message(tmp_path):
    settings = _settings(tmp_path, openai_api_key="")
    try:
        synthesize_speech(settings=settings, text="hola", client=FakeSpeechClient())
    except SpeechConfigurationError as exc:
        assert "sk-" not in str(exc)


def test_cache_miss_calls_client(tmp_path):
    settings = _settings(tmp_path)
    client = FakeSpeechClient()
    synthesize_speech(settings=settings, text="hola", client=client)
    assert len(client.calls) == 1


def test_cache_hit_does_not_call_client_again(tmp_path):
    settings = _settings(tmp_path)
    client = FakeSpeechClient()
    audio1 = synthesize_speech(settings=settings, text="hola", client=client)
    audio2 = synthesize_speech(settings=settings, text="hola", client=client)
    assert audio1 == audio2
    assert len(client.calls) == 1  # segunda vez fue cache hit


def test_cache_key_changes_by_text(tmp_path):
    settings = _settings(tmp_path)
    client = FakeSpeechClient()
    synthesize_speech(settings=settings, text="hola", client=client)
    synthesize_speech(settings=settings, text="chau", client=client)
    assert len(client.calls) == 2


def test_cache_key_changes_by_voice(tmp_path):
    settings_a = _settings(tmp_path)
    settings_a.openai_tts_voice = "marin"
    client = FakeSpeechClient()
    synthesize_speech(settings=settings_a, text="hola", client=client)

    settings_b = _settings(tmp_path)
    settings_b.speech_cache_dir = settings_a.speech_cache_dir
    settings_b.openai_tts_voice = "cedar"
    synthesize_speech(settings=settings_b, text="hola", client=client)
    assert len(client.calls) == 2


def test_cache_key_changes_by_instructions(tmp_path):
    settings_a = _settings(tmp_path)
    settings_a.openai_tts_instructions = "Instrucción A."
    client = FakeSpeechClient()
    synthesize_speech(settings=settings_a, text="hola", client=client)

    settings_b = _settings(tmp_path)
    settings_b.speech_cache_dir = settings_a.speech_cache_dir
    settings_b.openai_tts_instructions = "Instrucción B."
    synthesize_speech(settings=settings_b, text="hola", client=client)
    assert len(client.calls) == 2


def test_cache_key_changes_by_speed(tmp_path):
    settings = _settings(tmp_path)
    client = FakeSpeechClient()
    synthesize_speech(settings=settings, text="hola", speed=1.0, client=client)
    synthesize_speech(settings=settings, text="hola", speed=1.3, client=client)
    assert len(client.calls) == 2


def test_auth_error_propagates(tmp_path):
    settings = _settings(tmp_path)
    client = FakeSpeechClient(audio=SpeechAuthError("credencial rechazada"))
    with pytest.raises(SpeechAuthError):
        synthesize_speech(settings=settings, text="hola", client=client)


def test_upstream_error_propagates(tmp_path):
    settings = _settings(tmp_path)
    client = FakeSpeechClient(audio=SpeechUpstreamError("timeout"))
    with pytest.raises(SpeechUpstreamError):
        synthesize_speech(settings=settings, text="hola", client=client)


def test_failed_generation_is_never_cached(tmp_path):
    settings = _settings(tmp_path)
    failing_client = FakeSpeechClient(audio=SpeechUpstreamError("timeout"))
    with pytest.raises(SpeechUpstreamError):
        synthesize_speech(settings=settings, text="hola", client=failing_client)

    working_client = FakeSpeechClient()
    synthesize_speech(settings=settings, text="hola", client=working_client)
    assert len(working_client.calls) == 1  # no fue cache hit de un error previo
