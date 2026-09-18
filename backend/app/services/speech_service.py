"""SpeechService: síntesis de voz neural opcional vía OpenAI TTS (Fase 7).

Responsabilidad única: saber si OpenAI TTS está configurado, sintetizar
texto ya validado (nunca reescribe ni agrega conocimiento — el texto que
llega acá ya pasó por todo el pipeline de grounding de fases anteriores),
cachear el resultado en filesystem, y traducir errores del SDK a una
jerarquía chica sin filtrar nunca la API key.

No hay una jerarquía de "providers" de TTS: PwC GenAI Shared Service NO
ofrece TTS (solo chat LLM) salvo que exista documentación corporativa
explícita en contrario; la Web Speech API del navegador (Fase 4) sigue
siendo el fallback sin credencial, manejada enteramente en el frontend.
Este módulo solo conoce OpenAI.
"""
from __future__ import annotations

import hashlib
import logging
import time
from pathlib import Path
from typing import Protocol

from app.config import Settings
from app.services.cache_schema import CACHE_SCHEMA_VERSION
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.speech")

MAX_TEXT_LENGTH = 5000
_OPENAI_TTS_TIMEOUT_SECONDS = 60.0


class SpeechConfigurationError(Exception):
    """No hay credencial de OpenAI disponible, o VOICE_PROVIDER=browser
    fuerza explícitamente no usar voz neural."""


class SpeechAuthError(Exception):
    """OpenAI rechazó la credencial configurada."""


class SpeechUpstreamError(Exception):
    """Timeout, error de conexión, o error 5xx del proveedor."""


class SpeechClient(Protocol):
    """Contrato mínimo que necesita `synthesize_speech`: permite inyectar
    un fake en tests sin tocar el SDK real ni la red."""

    def create_speech(
        self, *, model: str, voice: str, instructions: str, speed: float, text: str
    ) -> bytes: ...


def is_speech_configured(settings: Settings) -> bool:
    """`VOICE_PROVIDER=browser` fuerza no usar voz neural aunque haya una
    API key configurada (respeta la elección explícita del operador)."""
    if settings.voice_provider == "browser":
        return False
    return bool(settings.openai_api_key)


def _cache_key(*, model: str, voice: str, instructions: str, speed: float, text: str) -> str:
    """Sección 26 de la especificación de Fase 7: la key depende de model +
    voice + instructions + speed + text (nunca de la API key). `speed` se
    pasa directo al parámetro `speed` real del SDK de OpenAI (lo soporta
    nativamente desde audio.speech.create) — un speed distinto produce
    bytes de audio distintos, así que participa de la key por diseño."""
    raw = f"{CACHE_SCHEMA_VERSION}:{model}:{voice}:{instructions}:{speed}:{text}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_file_path(cache_dir: Path, key: str) -> Path:
    return cache_dir / f"{key}.mp3"


def _read_cache(cache_dir: Path, key: str) -> bytes | None:
    path = _cache_file_path(cache_dir, key)
    if not path.is_file():
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def _write_cache(cache_dir: Path, key: str, audio_bytes: bytes) -> None:
    """Escritura atómica simple (mismo patrón que LessonPlan/QuestionBank).
    Sin LRU/cleanup automático todavía — se documenta que se puede borrar
    manualmente (sección 26 de la especificación)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    final_path = _cache_file_path(cache_dir, key)
    tmp_path = final_path.with_name(final_path.name + ".tmp")
    tmp_path.write_bytes(audio_bytes)
    tmp_path.replace(final_path)


class _OpenAISpeechClient:
    """Adaptador real sobre el SDK `openai` (1.109.1, ya instalado — no se
    agregó ninguna dependencia nueva para esto: `client.audio.speech.create`
    ya está soportado por la versión existente)."""

    def __init__(self, api_key: str) -> None:
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key)

    def create_speech(
        self, *, model: str, voice: str, instructions: str, speed: float, text: str
    ) -> bytes:
        from openai import (
            APIConnectionError,
            APIStatusError,
            APITimeoutError,
            AuthenticationError,
        )

        try:
            response = self._client.audio.speech.create(
                model=model,
                voice=voice,
                input=text,
                instructions=instructions,
                response_format="mp3",
                speed=speed,
                timeout=_OPENAI_TTS_TIMEOUT_SECONDS,
            )
        except AuthenticationError as exc:
            raise SpeechAuthError("Proveedor 'openai' (TTS): credencial rechazada (401).") from exc
        except APITimeoutError as exc:
            raise SpeechUpstreamError("Proveedor 'openai' (TTS): timeout esperando respuesta.") from exc
        except APIConnectionError as exc:
            raise SpeechUpstreamError("Proveedor 'openai' (TTS): error de conexión.") from exc
        except APIStatusError as exc:
            status = exc.status_code
            if status in (401, 403):
                raise SpeechAuthError(
                    f"Proveedor 'openai' (TTS): credencial rechazada (HTTP {status})."
                ) from exc
            raise SpeechUpstreamError(
                f"Proveedor 'openai' (TTS): error del proveedor (HTTP {status})."
            ) from exc
        return response.read()


def synthesize_speech(
    *, settings: Settings, text: str, speed: float = 1.0, client: SpeechClient | None = None
) -> bytes:
    """Sintetiza `text` (ya validado/grounded por el llamador — este
    servicio NUNCA reescribe texto ni agrega conocimiento) a audio/mpeg.
    Cachea el resultado en filesystem; un cache hit nunca llama a OpenAI.

    Lanza `SpeechConfigurationError` si no hay credencial (o
    VOICE_PROVIDER=browser). Lanza `SpeechAuthError`/`SpeechUpstreamError`
    ante fallas del proveedor. Nunca loguea la API key ni el texto
    completo — solo char_count/model/voice/duration/cached.
    """
    if not text or not text.strip():
        raise ValueError("text no puede estar vacío.")
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError(f"text supera el máximo permitido ({MAX_TEXT_LENGTH} caracteres).")

    if not is_speech_configured(settings):
        raise SpeechConfigurationError(
            "El proveedor de voz neural (OpenAI TTS) no tiene credencial disponible."
        )

    model = settings.openai_tts_model
    voice = settings.openai_tts_voice
    instructions = settings.openai_tts_instructions

    key = _cache_key(model=model, voice=voice, instructions=instructions, speed=speed, text=text)
    cache_dir = settings.speech_cache_path
    log_context = {
        "model": model,
        "voice": voice,
        "char_count": len(text),
    }

    cached = _read_cache(cache_dir, key)
    if cached is not None:
        log_event(logger, "speech_cache_hit", **log_context, cached=True)
        return cached

    log_event(logger, "speech_cache_miss", **log_context)
    log_event(logger, "speech_generation_started", **log_context)
    started_at = time.monotonic()

    speech_client = client or _OpenAISpeechClient(settings.openai_api_key)
    try:
        audio_bytes = speech_client.create_speech(
            model=model, voice=voice, instructions=instructions, speed=speed, text=text
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        log_event(
            logger,
            "speech_generation_failed",
            **log_context,
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        raise

    _write_cache(cache_dir, key, audio_bytes)
    duration_ms = int((time.monotonic() - started_at) * 1000)
    log_event(
        logger,
        "speech_generation_completed",
        **log_context,
        duration_ms=duration_ms,
        cached=False,
    )
    return audio_bytes
