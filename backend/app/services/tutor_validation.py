"""Validación de grounding de una respuesta del tutor (Fase 5, extendida en
v1.3.0 con el modo ampliado y en v1.4.0 Bloque 2 con evidencia course-wide).

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
citar una referencia porque el tipo no tiene dónde ponerla).

v1.4.0 (Bloque 2): `course_answer_chunks` se valida de la misma forma,
pero contra los `CourseSourceBinding` de ESTA consulta puntual
(`app/services/course_grounding.py::validate_course_source_refs`), nunca
contra `CanonicalTopicContent` -- un namespace `COURSE-SRC-XXX` nunca
existe ahí, así que una ref cruzada entre namespaces (un `SRC-XXX` del
tópico actual usado como course ref, o viceversa) se rechaza por
construcción, sin necesitar un chequeo de formato aparte."""
from __future__ import annotations

from app.models.schemas import CanonicalTopicContent
from app.models.tutor import CourseGroundedText, GroundedText
from app.services.canonical import validate_source_refs
from app.services.course_grounding import CourseSourceBinding, validate_course_source_refs
from app.services.llm_retry import ValidationFailure


def validate_tutor_reply(
    *,
    answer_chunks: list[GroundedText],
    course_answer_chunks: list[CourseGroundedText],
    canonical: CanonicalTopicContent,
    course_bindings: list[CourseSourceBinding],
) -> None:
    problems: list[str] = []

    for i, chunk in enumerate(answer_chunks):
        result = validate_source_refs(chunk.source_refs, canonical)
        if result.invalid_refs:
            problems.append(f"answer_chunks[{i}]: source_refs inexistentes {result.invalid_refs}.")

    for i, chunk in enumerate(course_answer_chunks):
        invalid = validate_course_source_refs(chunk.source_refs, course_bindings)
        if invalid:
            problems.append(f"course_answer_chunks[{i}]: source_refs inexistentes {invalid}.")

    if problems:
        raise ValidationFailure(problems)
