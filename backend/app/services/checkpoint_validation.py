"""Validación de grounding de una `CheckpointEvaluationBody` (Fase 5).

Recorre `feedback` (obligatorio) e `ideal_answer` (opcional) validando sus
`source_refs` contra el `CanonicalTopicContent` real del tópico, con la
misma utilidad de Fase 2. `scene.interaction.expected_answer` NUNCA se usa
acá como autoridad: solo se pasa al LLM como contexto generado (ver
`app/prompts/checkpoint.py` y `app/services/checkpoint_service.py`); si
contradijera o sobreextendiera el material autorizado, la fuente gana —
este módulo solo confirma que la evaluación devuelta por el LLM cita
`SourceBlock` reales, nunca valida contra `expected_answer`.
"""
from __future__ import annotations

from app.models.schemas import CanonicalTopicContent
from app.models.tutor import CheckpointEvaluationBody
from app.services.canonical import validate_source_refs
from app.services.llm_retry import ValidationFailure


def validate_checkpoint_evaluation(
    body: CheckpointEvaluationBody, canonical: CanonicalTopicContent
) -> None:
    problems: list[str] = []

    for i, chunk in enumerate(body.feedback):
        if not chunk.source_refs:
            problems.append(f"feedback[{i}]: source_refs vacío.")
            continue
        result = validate_source_refs(chunk.source_refs, canonical)
        if result.invalid_refs:
            problems.append(f"feedback[{i}]: source_refs inexistentes {result.invalid_refs}.")

    if body.ideal_answer is not None:
        if not body.ideal_answer.source_refs:
            problems.append("ideal_answer: source_refs vacío.")
        else:
            result = validate_source_refs(body.ideal_answer.source_refs, canonical)
            if result.invalid_refs:
                problems.append(f"ideal_answer: source_refs inexistentes {result.invalid_refs}.")

    if problems:
        raise ValidationFailure(problems)
