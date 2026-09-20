"""Orquestador del tutor interactivo grounded (Fase 5).

Pipeline:

    CanonicalTopicContent + Grounding Packet (Fase 2, vía app/services/courses.py)
        -> contexto de escena (opcional, vía lesson_generator.get_cached_lesson_plan)
        -> Prompt Builder (app/prompts/tutor.py)
        -> LLMProvider.generate_structured (Fase 3, reutilizado tal cual)
        -> TutorReplyBody (validación Pydantic automática)
        -> validación de grounding (app/services/tutor_validation.py)
        -> TutorReplyBody final (se devuelve tal cual; no se cachea, ver Fase 5 sección 18)

Regla de fuente de verdad: el Grounding Packet es la ÚNICA fuente
autorizada. `recent_history` y el contexto de escena (GENERATED CLASS
CONTEXT) son exclusivamente contexto conversacional/generado NO confiable
— nunca se usan como fuente de verdad, y nunca se envían al LLM como si lo
fueran (ver `app/prompts/tutor.py`).

Diseñado para inyección de dependencias simple, igual que
`lesson_generator.py`: `ask_tutor` acepta un `provider: LLMProvider | None`
opcional para que los tests inyecten un `FakeLLMProvider` sin tocar
Internet.
"""
from __future__ import annotations

import logging
import time

from app.config import Settings
from app.models.schemas import CanonicalTopicContent
from app.models.tutor import TutorMessage, TutorReplyBody, TutorResponseType
from app.prompts.tutor import SceneContext, build_tutor_correction_message, build_tutor_messages
from app.services import courses as course_service
from app.services import lesson_generator
from app.services.llm_provider import LLMConfigurationError, LLMProvider, get_llm_provider
from app.services.llm_retry import GenerationFailedError, ValidationFailure, generate_with_retries
from app.services.service_logging import log_event
from app.services.tutor_validation import validate_tutor_reply

logger = logging.getLogger("pwc_tutor.tutor")

# Re-exportado para quien quiera capturarlo explícitamente (routers/tests).
__all__ = ["ask_tutor", "GenerationFailedError"]


def _resolve_scene_context(
    *,
    settings: Settings,
    provider: LLMProvider,
    canonical: CanonicalTopicContent,
    scene_id: str | None,
) -> SceneContext | None:
    """Busca la escena `scene_id` dentro de la LessonPlan actualmente
    cacheada para este tópico/provider/modelo (si existe alguna). Nunca
    genera una LessonPlan nueva. Si no hay cache, o `scene_id` no existe en
    ella, devuelve `None` sin lanzar — un `scene_id` inválido nunca debe
    producir un 500 (sección 8 de la especificación de Fase 5)."""
    if not scene_id:
        return None
    try:
        cached_plan = lesson_generator.get_cached_lesson_plan(settings, provider, canonical)
    except Exception:
        return None
    if cached_plan is None:
        return None
    scene = next((s for s in cached_plan.scenes if s.scene_id == scene_id), None)
    if scene is None:
        return None

    refs: set[str] = set()
    refs.update(scene.title.source_refs)
    for kp in scene.key_points:
        refs.update(kp.source_refs)
    refs.update(scene.visual.source_refs)
    # Deliberadamente NO se incluye narration: la narración generada no es
    # una fuente de conocimiento nueva (sección 8 de la especificación).

    return SceneContext(scene_id=scene.scene_id, title=scene.title.text, source_refs=sorted(refs))


def ask_tutor(
    *,
    settings: Settings,
    course_id: str,
    module_id: str,
    topic_id: str,
    message: str,
    scene_id: str | None,
    recent_history: list[TutorMessage],
    allow_general_knowledge: bool = False,
    provider: LLMProvider | None = None,
) -> TutorReplyBody:
    """Genera la respuesta grounded del tutor a una pregunta del alumno.

    Lanza `course_service.CourseNotFoundError` / `ModuleNotFoundError` /
    `TopicNotFoundError` si el tópico no existe (resuelto siempre por el
    repositorio seguro). Lanza `LLMConfigurationError` si el provider no
    está configurado. Lanza `GenerationFailedError` si no se pudo producir
    una respuesta válida tras los reintentos permitidos.

    `allow_general_knowledge` (v1.3.0, default False -- PARTE 22/25):
    en False, comportamiento IDÉNTICO a antes de este bloque. En True,
    permite -- únicamente para esta consulta puntual -- que el tutor use
    conocimiento general del modelo para preguntas relacionadas con el
    tema pero no cubiertas por AUTHORIZED SOURCE (ver
    app/prompts/tutor.py REGLA 20/21). Nunca se persiste entre preguntas:
    el frontend lo reenvía en cada request (PARTE 24).
    """
    llm_provider = provider or get_llm_provider(settings)

    # Resolver el tópico ANTES de exigir credencial: un tópico inexistente
    # debe dar 404 incluso sin ninguna API key configurada.
    canonical, grounding_packet = course_service.get_grounding_packet(
        settings.content_path, course_id, module_id, topic_id
    )

    if not llm_provider.is_configured():
        raise LLMConfigurationError(
            f"El proveedor LLM configurado ('{llm_provider.name}') no tiene credencial disponible."
        )

    scene_context = _resolve_scene_context(
        settings=settings, provider=llm_provider, canonical=canonical, scene_id=scene_id
    )

    log_context = {
        "course_id": course_id,
        "module_id": module_id,
        "topic_id": topic_id,
        "scene_id": scene_id or "-",
        "provider": llm_provider.name,
        "model": llm_provider.model,
        "allow_general_knowledge": allow_general_knowledge,
    }
    log_event(logger, "tutor_query_started", **log_context)
    started_at = time.monotonic()

    messages = build_tutor_messages(
        message=message,
        recent_history=recent_history,
        scene_context=scene_context,
        grounding_packet=grounding_packet,
        allow_general_knowledge=allow_general_knowledge,
    )

    def _validate(body: TutorReplyBody) -> None:
        validate_tutor_reply(body, canonical)
        # Defensa en profundidad (v1.3.0): en modo estricto el prompt
        # nunca menciona "unrelated" como opción (REGLA 20/21 ni siquiera
        # se incluyen) -- si de todos modos apareciera, es una
        # inconsistencia real del modelo, se rechaza y se reintenta igual
        # que cualquier otro problema de contrato.
        if body.response_type == TutorResponseType.unrelated and not allow_general_knowledge:
            raise ValidationFailure(
                [
                    "response_type='unrelated' solo es válido cuando el request permite "
                    "conocimiento general (allow_general_knowledge=true); en modo estricto "
                    "usá 'not_covered' si la fuente no alcanza para responder."
                ]
            )
        # v1.3.0 (cierre del gap funcional del modo ampliado): QA real
        # mostró que el proveedor configurado (gpt-4o-mini) seguía
        # devolviendo "not_covered" para preguntas relacionadas pero no
        # cubiertas por la fuente, incluso con REGLA 20/21 explícitas en
        # el prompt (ver tutor-v3.1 en app/prompts/tutor.py). Reforzar
        # solo el prompt no alcanza: acá se rechaza estructuralmente esa
        # combinación inválida y se fuerza un reintento con corrección,
        # igual que cualquier otro problema de contrato -- nunca se
        # normaliza/reescribe la respuesta del lado del backend, el LLM
        # es quien tiene que corregir su propio structured output.
        if body.response_type == TutorResponseType.not_covered and allow_general_knowledge:
            raise ValidationFailure(
                [
                    "response_type='not_covered' no es una respuesta válida en modo ampliado "
                    "(allow_general_knowledge=true). Si la pregunta no está relacionada con el "
                    "tema, usá response_type='unrelated'. Si está relacionada pero AUTHORIZED "
                    "SOURCE no alcanza, respondé con response_type='answer' usando "
                    "general_knowledge_chunks para la parte no cubierta por la fuente -- nunca "
                    "'not_covered' para una pregunta relevante en este modo."
                ]
            )

    def _on_retry(attempt: int, reason: str) -> None:
        # Observabilidad segura (nunca pregunta/respuesta/texto libre):
        # solo ids ya presentes en log_context + el intento + una
        # categoría fija de motivo (vocabulario cerrado de llm_retry.py:
        # "upstream_error"/"invalid_contract"/"grounding_invalid" -- esta
        # última cubre tanto validate_tutor_reply como las dos
        # ValidationFailure explícitas de acá arriba).
        log_event(logger, "tutor_query_retry", **log_context, attempt=attempt, reason=reason)

    try:
        body = generate_with_retries(
            provider=llm_provider,
            messages=messages,
            response_model=TutorReplyBody,
            validate=_validate,
            build_correction_message=build_tutor_correction_message,
            on_retry=_on_retry,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        log_event(
            logger,
            "tutor_query_failed",
            **log_context,
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        raise

    duration_ms = int((time.monotonic() - started_at) * 1000)
    log_event(
        logger,
        "tutor_query_completed",
        **log_context,
        duration_ms=duration_ms,
        response_type=body.response_type.value,
        general_knowledge_used=body.general_knowledge_used,
    )
    return body
