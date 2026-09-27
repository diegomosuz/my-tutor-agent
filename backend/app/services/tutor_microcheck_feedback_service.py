"""Orquestador de feedback formativo de micro-checks (v1.8.0, Bloque 4:
"ADAPTIVE INTERACTION & FORMATIVE MICRO-CHECKS").

Pipeline:

    CanonicalTopicContent + Grounding Packet (Fase 2, tópico actual únicamente
        -- mismo alcance de grounding que checkpoint_service.py, deliberadamente
        sin COURSE EVIDENCE: el micro-check ya se restringió a SRC-XXX del
        tópico actual al generarse, ver app/models/tutor.py::TutorMicroCheck)
        -> TutorLearningContext + TutorTeachingPolicy (v1.8.0 Bloque 1/3,
           SIEMPRE que haya identidad resuelta -- solo para tono del feedback,
           NUNCA para decidir el veredicto)
        -> Prompt Builder (app/prompts/tutor_microcheck_feedback.py)
        -> LLMProvider.generate_structured (Fase 3, reutilizado tal cual)
        -> TutorMicroCheckFeedbackBody (validación Pydantic automática)
        -> validación de grounding (tutor_microcheck_feedback_validation.py)

Regla dura (idéntica en espíritu a checkpoint_service.py): la pregunta
del micro-check que llega en el request es DATO de interacción, nunca
autoridad -- el backend siempre reconstruye el Grounding Packet real del
tópico y valida `feedback.source_refs` contra ese material, sin confiar
en que el cliente envió una pregunta genuina (PARTE 33 de la
especificación).

Nunca se persiste nada: ni la pregunta, ni la respuesta del alumno, ni el
feedback, ni el veredicto (PARTE 39). Nunca contribuye a `LearningProfile`,
`TopicLearningSignal`, evidencia de Certification ni `LearningState`
(PARTE 40) -- esas piezas ni siquiera se importan acá."""
from __future__ import annotations

import logging
import time
import uuid

from sqlalchemy.orm import Session

from app.config import Settings
from app.models.tutor import TutorMicroCheckFeedbackBody
from app.prompts.tutor_microcheck_feedback import (
    build_microcheck_feedback_correction_message,
    build_microcheck_feedback_messages,
)
from app.services import courses as course_service
from app.services import tutor_learning_context_service
from app.services.llm_provider import LLMConfigurationError, LLMProvider, get_llm_provider
from app.services.llm_retry import GenerationFailedError, generate_with_retries
from app.services.service_logging import log_event
from app.services.tutor_microcheck_feedback_validation import validate_microcheck_feedback
from app.services.tutor_teaching_policy import build_tutor_teaching_policy

logger = logging.getLogger("pwc_tutor.tutor_microcheck")

__all__ = ["evaluate_microcheck_feedback", "GenerationFailedError"]


def _resolve_teaching_policy_for_tone(
    *,
    settings: Settings,
    session: Session | None,
    user_id: uuid.UUID | None,
    course_id: str,
    module_id: str,
    topic_id: str,
):
    """Igual criterio que `tutor_service._resolve_learning_context`: NO
    atrapa excepciones (un fallo real de Postgres debe propagarse, nunca
    disfrazarse de "sin política" -- PARTE 81/108 de la especificación).
    `session`/`user_id` opcionales por el mismo motivo que en
    `tutor_service.ask_tutor`: tests que ejercitan esta función de forma
    aislada, sin Postgres."""
    if session is None or user_id is None:
        return None
    learning_context = tutor_learning_context_service.build(
        settings=settings,
        session=session,
        user_id=user_id,
        course_id=course_id,
        module_id=module_id,
        topic_id=topic_id,
    )
    return build_tutor_teaching_policy(learning_context)


def evaluate_microcheck_feedback(
    *,
    settings: Settings,
    course_id: str,
    module_id: str,
    topic_id: str,
    micro_check_question: str,
    student_answer: str,
    session: Session | None = None,
    user_id: uuid.UUID | None = None,
    provider: LLMProvider | None = None,
) -> TutorMicroCheckFeedbackBody:
    """Genera feedback formativo grounded para la respuesta del alumno a
    un micro-check del tutor.

    Lanza `course_service.CourseNotFoundError`/`ModuleNotFoundError`/
    `TopicNotFoundError` si el tópico no existe. Lanza
    `LLMConfigurationError` si el provider no está configurado. Lanza
    `GenerationFailedError` si no se pudo producir una respuesta válida
    tras los reintentos permitidos."""
    llm_provider = provider or get_llm_provider(settings)

    # Resolver el tópico ANTES de exigir credencial (mismo criterio que
    # ask_tutor/evaluate_checkpoint): un tópico inexistente debe dar 404
    # incluso sin ninguna API key configurada.
    canonical, grounding_packet = course_service.get_grounding_packet(
        settings.content_path, course_id, module_id, topic_id
    )

    if not llm_provider.is_configured():
        raise LLMConfigurationError(
            f"El proveedor LLM configurado ('{llm_provider.name}') no tiene credencial disponible."
        )

    teaching_policy = _resolve_teaching_policy_for_tone(
        settings=settings,
        session=session,
        user_id=user_id,
        course_id=course_id,
        module_id=module_id,
        topic_id=topic_id,
    )

    log_context = {
        "course_id": course_id,
        "module_id": module_id,
        "topic_id": topic_id,
        "provider": llm_provider.name,
        "model": llm_provider.model,
    }
    log_event(logger, "microcheck_feedback_started", **log_context)
    started_at = time.monotonic()

    messages = build_microcheck_feedback_messages(
        micro_check_question=micro_check_question,
        student_answer=student_answer,
        grounding_packet=grounding_packet,
        teaching_policy=teaching_policy,
    )

    def _validate(body: TutorMicroCheckFeedbackBody) -> None:
        validate_microcheck_feedback(body, canonical)

    try:
        body = generate_with_retries(
            provider=llm_provider,
            messages=messages,
            response_model=TutorMicroCheckFeedbackBody,
            validate=_validate,
            build_correction_message=build_microcheck_feedback_correction_message,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        log_event(
            logger,
            "microcheck_feedback_failed",
            **log_context,
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        raise

    duration_ms = int((time.monotonic() - started_at) * 1000)
    log_event(
        logger,
        "microcheck_feedback_completed",
        **log_context,
        duration_ms=duration_ms,
        verdict=body.verdict.value,
    )
    return body
