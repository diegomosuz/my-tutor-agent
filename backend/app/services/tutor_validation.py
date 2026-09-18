"""Validación de grounding de una `TutorReplyBody` (Fase 5).

Complementa la validación Pydantic (forma del contrato): garantiza que
toda `source_ref` citada en `answer_chunks` exista realmente en el
`CanonicalTopicContent` del tópico actual, reutilizando la utilidad de
Fase 2 (`validate_source_refs`) — misma garantía y mismo límite que en
Fase 3: trazabilidad estructural, no prueba semántica de entailment.
`clarification_question` no requiere grounding: no debe contener ninguna
afirmación pedagógica nueva (así lo exige el system prompt del tutor).
"""
from __future__ import annotations

from app.models.schemas import CanonicalTopicContent
from app.models.tutor import TutorReplyBody
from app.services.canonical import validate_source_refs
from app.services.llm_retry import ValidationFailure


def validate_tutor_reply(body: TutorReplyBody, canonical: CanonicalTopicContent) -> None:
    problems: list[str] = []

    for i, chunk in enumerate(body.answer_chunks):
        if not chunk.source_refs:
            problems.append(f"answer_chunks[{i}]: source_refs vacío.")
            continue
        result = validate_source_refs(chunk.source_refs, canonical)
        if result.invalid_refs:
            problems.append(f"answer_chunks[{i}]: source_refs inexistentes {result.invalid_refs}.")

    if problems:
        raise ValidationFailure(problems)
