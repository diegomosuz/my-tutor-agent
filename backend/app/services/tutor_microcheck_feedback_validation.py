"""Validación de grounding de un `TutorMicroCheckFeedbackBody` (v1.8.0,
Bloque 4). Espejo directo de `checkpoint_validation.py`, adaptado a un
único `feedback: GroundedText` (en vez de una lista) -- `verdict` nunca
se valida acá (es una clasificación cerrada del LLM, no un dato
citable)."""
from __future__ import annotations

from app.models.schemas import CanonicalTopicContent
from app.models.tutor import TutorMicroCheckFeedbackBody
from app.services.canonical import validate_source_refs
from app.services.llm_retry import ValidationFailure


def validate_microcheck_feedback(
    body: TutorMicroCheckFeedbackBody, canonical: CanonicalTopicContent
) -> None:
    if not body.feedback.source_refs:
        raise ValidationFailure(["feedback: source_refs vacío."])

    result = validate_source_refs(body.feedback.source_refs, canonical)
    if result.invalid_refs:
        raise ValidationFailure([f"feedback: source_refs inexistentes {result.invalid_refs}."])
