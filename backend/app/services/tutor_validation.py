"""Validación de grounding de una `TutorReplyBody` (Fase 5, extendida en
v1.3.0 con el modo ampliado del tutor).

Complementa la validación Pydantic (forma del contrato): garantiza que
toda `source_ref` citada en `answer_chunks` exista realmente en el
`CanonicalTopicContent` del tópico actual, reutilizando la utilidad de
Fase 2 (`validate_source_refs`) — misma garantía y mismo límite que en
Fase 3: trazabilidad estructural, no prueba semántica de entailment.
`clarification_question` no requiere grounding: no debe contener ninguna
afirmación pedagógica nueva (así lo exige el system prompt del tutor).

v1.3.0 (bloque "Classroom UX", Tutor Expanded Mode): `answer_chunks` sigue
siendo siempre 100% grounded, sin excepciones -- `GroundedText` ya exige
`source_refs` no vacío a nivel de Pydantic (`app/models/lesson.py`), así
que esta función solo necesita verificar que esas referencias existan
realmente en el `CanonicalTopicContent`. El contenido de conocimiento
general vive en `general_knowledge_chunks` (`list[str]`,
`app/models/tutor.py`), un campo estructuralmente distinto que no tiene
ningún concepto de `source_refs` -- no hay nada que validar ahí (no puede
citar una referencia porque el tipo no tiene dónde ponerla)."""
from __future__ import annotations

from app.models.schemas import CanonicalTopicContent
from app.models.tutor import TutorReplyBody
from app.services.canonical import validate_source_refs
from app.services.llm_retry import ValidationFailure


def validate_tutor_reply(body: TutorReplyBody, canonical: CanonicalTopicContent) -> None:
    problems: list[str] = []

    for i, chunk in enumerate(body.answer_chunks):
        result = validate_source_refs(chunk.source_refs, canonical)
        if result.invalid_refs:
            problems.append(f"answer_chunks[{i}]: source_refs inexistentes {result.invalid_refs}.")

    if problems:
        raise ValidationFailure(problems)
