"""Orquestador de evaluación de checkpoints de comprensión (Fase 5).

Pipeline:

    CanonicalTopicContent + Grounding Packet (Fase 2)
        -> LessonPlan cacheada (lesson_generator.get_cached_lesson_plan, sin generar)
        -> localizar scene_id + validar que sea comprehension_check
        -> Prompt Builder (app/prompts/checkpoint.py)
        -> LLMProvider.generate_structured (Fase 3, reutilizado tal cual)
        -> CheckpointEvaluationBody (validación Pydantic automática)
        -> validación de grounding (app/services/checkpoint_validation.py)

`scene.interaction.expected_answer` (si existe) se pasa al LLM únicamente
como contexto generado, NUNCA como autoridad — la evaluación real se hace
siempre contra el Grounding Packet (ver `app/prompts/checkpoint.py`,
REGLA 2). Este servicio jamás compara la respuesta del alumno contra
`expected_answer` por su cuenta: esa decisión la toma el LLM, siguiendo el
system prompt, y el resultado se valida solo estructuralmente (grounding
de `feedback`/`ideal_answer`), nunca contra `expected_answer`.
"""
from __future__ import annotations

import logging
import time

from app.config import Settings
from app.models.lesson import InteractionType
from app.models.tutor import CheckpointEvaluationBody
from app.prompts.checkpoint import build_checkpoint_correction_message, build_checkpoint_messages
from app.services import courses as course_service
from app.services import lesson_generator
from app.services.checkpoint_validation import validate_checkpoint_evaluation
from app.services.llm_provider import LLMConfigurationError, LLMProvider, get_llm_provider
from app.services.llm_retry import GenerationFailedError, generate_with_retries
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.checkpoint")

__all__ = [
    "evaluate_checkpoint",
    "GenerationFailedError",
    "CheckpointLessonPlanNotFoundError",
    "CheckpointSceneNotFoundError",
    "CheckpointNotComprehensionCheckError",
]


class CheckpointLessonPlanNotFoundError(Exception):
    """No existe todavía una LessonPlan cacheada para este tópico con el
    provider/modelo configurado — no hay checkpoint que evaluar."""


class CheckpointSceneNotFoundError(Exception):
    """`scene_id` no existe dentro de la LessonPlan cacheada."""


class CheckpointNotComprehensionCheckError(Exception):
    """La escena existe pero no tiene una interacción
    `comprehension_check` (puede no tener interacción, o ser `reflection` —
    ese caso se conversa por `/tutor`, nunca se evalúa acá)."""


def evaluate_checkpoint(
    *,
    settings: Settings,
    course_id: str,
    module_id: str,
    topic_id: str,
    scene_id: str,
    answer: str,
    provider: LLMProvider | None = None,
) -> CheckpointEvaluationBody:
    llm_provider = provider or get_llm_provider(settings)

    # Resolver tópico, LessonPlan cacheada, escena y tipo de interacción
    # ANTES de exigir credencial (mismo criterio que /lesson y /tutor,
    # Fase 3/5): son todos chequeos de existencia/estado que no requieren
    # llamar al LLM, así que un 404/409 debe poder responderse incluso sin
    # ninguna API key configurada. La credencial solo hace falta para el
    # paso final (evaluar de verdad con el LLM).
    canonical, grounding_packet = course_service.get_grounding_packet(
        settings.content_path, course_id, module_id, topic_id
    )

    cached_plan = lesson_generator.get_cached_lesson_plan(settings, llm_provider, canonical)
    if cached_plan is None:
        raise CheckpointLessonPlanNotFoundError(
            "No existe una LessonPlan generada para este tópico con el proveedor configurado."
        )

    scene = next((s for s in cached_plan.scenes if s.scene_id == scene_id), None)
    if scene is None:
        raise CheckpointSceneNotFoundError(scene_id)

    if scene.interaction is None or scene.interaction.interaction_type != InteractionType.comprehension_check:
        raise CheckpointNotComprehensionCheckError(scene_id)

    if not llm_provider.is_configured():
        raise LLMConfigurationError(
            f"El proveedor LLM configurado ('{llm_provider.name}') no tiene credencial disponible."
        )

    log_context = {
        "course_id": course_id,
        "module_id": module_id,
        "topic_id": topic_id,
        "scene_id": scene_id,
        "provider": llm_provider.name,
        "model": llm_provider.model,
    }
    log_event(logger, "checkpoint_evaluation_started", **log_context)
    started_at = time.monotonic()

    expected_answer_text = (
        scene.interaction.expected_answer.text if scene.interaction.expected_answer else None
    )
    messages = build_checkpoint_messages(
        question=scene.interaction.question.text,
        expected_answer=expected_answer_text,
        student_answer=answer,
        grounding_packet=grounding_packet,
    )

    def _validate(body: CheckpointEvaluationBody) -> None:
        validate_checkpoint_evaluation(body, canonical)

    try:
        body = generate_with_retries(
            provider=llm_provider,
            messages=messages,
            response_model=CheckpointEvaluationBody,
            validate=_validate,
            build_correction_message=build_checkpoint_correction_message,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        log_event(
            logger,
            "checkpoint_evaluation_failed",
            **log_context,
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        raise

    duration_ms = int((time.monotonic() - started_at) * 1000)
    log_event(
        logger,
        "checkpoint_evaluation_completed",
        **log_context,
        duration_ms=duration_ms,
        verdict=body.verdict.value,
    )
    return body
