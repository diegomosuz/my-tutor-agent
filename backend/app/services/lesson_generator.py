"""Orquestador de generación de LessonPlans (Fase 3).

Pipeline:

    CanonicalTopicContent (Fase 2, vía app/services/courses.py)
        -> Grounding Packet (Fase 2)
        -> Prompt Builder (app/prompts/lesson.py)
        -> LLMProvider.generate_structured (app/services/llm_provider.py)
        -> GeneratedLessonBody (validación Pydantic, automática)
        -> validación de grounding (app/services/lesson_validation.py)
        -> LessonPlan (ensamblada acá, NUNCA por el LLM)
        -> cache en filesystem (JSON)

Diseñado para inyección de dependencias simple (sin framework de DI): la
función pública `generate_lesson` acepta un `provider: LLMProvider | None`
opcional, así los tests pueden inyectar un `FakeLLMProvider` sin tocar
Internet y sin mocking frameworks adicionales a `unittest.mock`.
"""
from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

from app.config import Settings
from app.models.lesson import GeneratedLessonBody, LessonPlan
from app.models.schemas import CanonicalTopicContent
from app.prompts.lesson import build_correction_message, build_messages
from app.services import courses as course_service
from app.services.llm_provider import (
    LLMAuthError,
    LLMConfigurationError,
    LLMProvider,
    LLMResponseError,
    LLMUpstreamError,
    get_llm_provider,
)
from app.services.cache_schema import CACHE_SCHEMA_VERSION
from app.services.lesson_validation import LessonValidationError, validate_lesson_body
from app.services.service_logging import log_event as shared_log_event

logger = logging.getLogger("pwc_tutor.lesson")

# 1 respuesta inicial + hasta 2 correcciones. Acotado a propósito: nunca un
# loop infinito (ver Fase 3, sección "Retries").
MAX_GENERATION_ATTEMPTS = 3


class LessonGenerationError(Exception):
    """La lección no pudo generarse tras agotar los reintentos permitidos
    (JSON/contrato inválido o grounding inválido de forma persistente)."""


def _log_event(event: str, **fields: object) -> None:
    """Log de una sola línea, sin secretos: nunca se pasan acá API keys,
    Authorization, el prompt completo, el Grounding Packet completo ni la
    respuesta cruda del LLM — solo ids, provider/model, hash abreviado,
    duración y booleanos. Delega en el helper compartido
    (`app/services/service_logging.py`) para incluir automáticamente
    `request_id` cuando el log ocurre dentro de un request HTTP (Fase 7)."""
    shared_log_event(logger, event, **fields)


def _cache_key(
    *,
    course_id: str,
    module_id: str,
    topic_id: str,
    content_sha256: str,
    provider_name: str,
    model: str,
    prompt_version: str,
) -> str:
    """La cache key depende de la identidad contextual COMPLETA del tópico
    (course_id + module_id + topic_id) + content_sha256 + provider + model
    + prompt_version + CACHE_SCHEMA_VERSION.

    Fase 7, sección 2 — bug real encontrado y corregido: antes la key
    dependía solo de content_sha256 + provider + model + prompt_version.
    Dos tópicos DISTINTOS con exactamente el mismo Markdown (mismo
    content_sha256) colisionaban en la misma cache key, y el segundo
    tópico en pedir su LessonPlan recibía un cache HIT que en realidad era
    el documento del PRIMER tópico — con su course_id/module_id/topic_id/
    lesson_id todavía adentro (leak de identidad real, no solo teórico;
    ver `backend/tests/test_cache_isolation.py`). Incluir la identidad
    contextual en la key evita la colisión por diseño: cambiar cualquiera
    de estos siete valores produce un cache miss."""
    raw = (
        f"{CACHE_SCHEMA_VERSION}:{course_id}:{module_id}:{topic_id}:"
        f"{content_sha256}:{provider_name}:{model}:{prompt_version}"
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_file_path(cache_dir: Path, key: str) -> Path:
    return cache_dir / f"{key}.json"


def _read_cache(cache_dir: Path, key: str) -> LessonPlan | None:
    path = _cache_file_path(cache_dir, key)
    if not path.is_file():
        return None
    try:
        raw = path.read_text(encoding="utf-8")
        return LessonPlan.model_validate_json(raw)
    except (OSError, ValidationError, ValueError):
        # Cache corrupta o de un esquema viejo: se trata como miss, nunca
        # rompe la aplicación.
        return None


def get_cached_lesson_plan(
    settings: Settings, provider: LLMProvider, canonical: CanonicalTopicContent
) -> LessonPlan | None:
    """Lee (sin generar) la `LessonPlan` cacheada para este
    content_sha256/provider/modelo/prompt_version, si existe. Usado por
    `TutorService` y `CheckpointService` (Fase 5) para resolver contexto de
    escena / preguntas de checkpoint sin duplicar la lógica de cache y sin
    disparar una generación nueva. Nunca llama al LLM."""
    key = _cache_key(
        course_id=canonical.course_id,
        module_id=canonical.module_id,
        topic_id=canonical.topic_id,
        content_sha256=canonical.content_sha256,
        provider_name=provider.name,
        model=provider.model,
        prompt_version=settings.lesson_prompt_version,
    )
    return _read_cache(settings.lesson_cache_path, key)


def _write_cache(cache_dir: Path, key: str, plan: LessonPlan) -> None:
    """Escritura atómica simple: escribe a un archivo temporal y hace
    replace (rename atómico en el mismo filesystem)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    final_path = _cache_file_path(cache_dir, key)
    tmp_path = final_path.with_name(final_path.name + ".tmp")
    tmp_path.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    tmp_path.replace(final_path)


def _assemble_lesson_plan(
    *,
    body: GeneratedLessonBody,
    canonical: CanonicalTopicContent,
    provider_name: str,
    model: str,
    prompt_version: str,
    cache_key: str,
) -> LessonPlan:
    """Ensambla el LessonPlan final. Todo campo determinístico (ids, hash,
    provider, model) se agrega ACÁ, nunca lo produce el LLM (invariantes
    F/G/H de Fase 3)."""
    lesson_id = (
        f"lesson-{canonical.course_id}-{canonical.module_id}-{canonical.topic_id}-{cache_key[:16]}"
    )
    return LessonPlan(
        lesson_id=lesson_id,
        course_id=canonical.course_id,
        module_id=canonical.module_id,
        topic_id=canonical.topic_id,
        content_sha256=canonical.content_sha256,
        prompt_version=prompt_version,
        provider=provider_name,
        model=model,
        lesson_title=body.lesson_title,
        learning_objectives=body.learning_objectives,
        scenes=body.scenes,
        recap=body.recap,
        cached=False,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


def _generate_validated_body(
    provider: LLMProvider,
    messages: list[dict[str, str]],
    canonical: CanonicalTopicContent,
) -> GeneratedLessonBody:
    """Bucle de generación + validación con reintentos acotados.

    - `LLMAuthError` / `LLMConfigurationError`: nunca se reintenta.
    - `LLMUpstreamError` (timeout/5xx/conexión): reintento limitado,
      reenviando exactamente los mismos mensajes.
    - `LLMResponseError` / `pydantic.ValidationError` (JSON o contrato
      inválido) / `LessonValidationError` (grounding inválido): reintento
      limitado, agregando un mensaje de corrección con los problemas
      encontrados. El AUTHORIZED SOURCE ya enviado nunca se reemplaza ni se
      elimina de la conversación.
    """
    attempt_messages = list(messages)
    last_error: Exception | None = None

    for attempt in range(1, MAX_GENERATION_ATTEMPTS + 1):
        try:
            body = provider.generate_structured(
                messages=attempt_messages, response_model=GeneratedLessonBody
            )
        except (LLMAuthError, LLMConfigurationError):
            raise  # errores no recuperables: nunca reintentar
        except LLMUpstreamError as exc:
            last_error = exc
            if attempt >= MAX_GENERATION_ATTEMPTS:
                raise
            _log_event("lesson_generation_retry", attempt=attempt, reason="upstream_error")
            continue
        except (LLMResponseError, ValidationError) as exc:
            last_error = exc
            if attempt >= MAX_GENERATION_ATTEMPTS:
                raise LessonGenerationError(
                    f"El proveedor no devolvió una respuesta válida tras {attempt} intentos."
                ) from exc
            attempt_messages = attempt_messages + [build_correction_message([str(exc)])]
            _log_event("lesson_generation_retry", attempt=attempt, reason="invalid_contract")
            continue

        try:
            validate_lesson_body(body, canonical)
        except LessonValidationError as exc:
            last_error = exc
            if attempt >= MAX_GENERATION_ATTEMPTS:
                raise LessonGenerationError(
                    "La lección generada no pasó la validación de grounding tras "
                    f"{attempt} intentos: {exc.problems}"
                ) from exc
            attempt_messages = attempt_messages + [build_correction_message(exc.problems)]
            _log_event("lesson_generation_retry", attempt=attempt, reason="grounding_invalid")
            continue

        return body

    # No debería alcanzarse: el loop siempre retorna o lanza.
    raise LessonGenerationError(f"No se pudo generar una lección válida: {last_error}")


def generate_lesson(
    *,
    settings: Settings,
    course_id: str,
    module_id: str,
    topic_id: str,
    force_regenerate: bool = False,
    provider: LLMProvider | None = None,
) -> LessonPlan:
    """Genera (o recupera de cache) la LessonPlan de un tópico.

    Lanza `course_service.CourseNotFoundError` / `ModuleNotFoundError` /
    `TopicNotFoundError` si el tópico no existe (resuelto siempre a través
    del repositorio seguro de Fase 1/2, nunca con una ruta arbitraria).
    Lanza `LLMConfigurationError` si el provider no está configurado.
    Lanza `LessonGenerationError` si no se pudo producir una lección válida
    tras los reintentos permitidos.
    """
    llm_provider = provider or get_llm_provider(settings)

    # Resolver el tópico ANTES de exigir credencial: un tópico inexistente
    # debe dar 404 incluso sin ninguna API key configurada (el catálogo y
    # la lectura de contenido nunca dependen de la disponibilidad del LLM).
    canonical, grounding_packet = course_service.get_grounding_packet(
        settings.content_path, course_id, module_id, topic_id
    )

    if not llm_provider.is_configured():
        raise LLMConfigurationError(
            f"El proveedor LLM configurado ('{llm_provider.name}') no tiene credencial disponible."
        )

    cache_dir = settings.lesson_cache_path
    prompt_version = settings.lesson_prompt_version
    key = _cache_key(
        course_id=canonical.course_id,
        module_id=canonical.module_id,
        topic_id=canonical.topic_id,
        content_sha256=canonical.content_sha256,
        provider_name=llm_provider.name,
        model=llm_provider.model,
        prompt_version=prompt_version,
    )

    log_context = {
        "course_id": course_id,
        "module_id": module_id,
        "topic_id": topic_id,
        "provider": llm_provider.name,
        "model": llm_provider.model,
        "content_sha256": canonical.content_sha256[:12],
    }

    if not force_regenerate:
        cached_plan = _read_cache(cache_dir, key)
        if cached_plan is not None:
            _log_event("lesson_cache_hit", **log_context)
            return cached_plan.model_copy(update={"cached": True})

    _log_event("lesson_cache_miss", **log_context)
    _log_event("lesson_generation_started", **log_context)
    started_at = time.monotonic()

    messages = build_messages(grounding_packet)

    try:
        body = _generate_validated_body(llm_provider, messages, canonical)
    except Exception as exc:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        _log_event(
            "lesson_generation_failed",
            **log_context,
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        raise

    lesson_plan = _assemble_lesson_plan(
        body=body,
        canonical=canonical,
        provider_name=llm_provider.name,
        model=llm_provider.model,
        prompt_version=prompt_version,
        cache_key=key,
    )
    _write_cache(cache_dir, key, lesson_plan)

    duration_ms = int((time.monotonic() - started_at) * 1000)
    _log_event(
        "lesson_generation_completed",
        **log_context,
        duration_ms=duration_ms,
        cached=False,
        scene_count=len(lesson_plan.scenes),
    )
    return lesson_plan
