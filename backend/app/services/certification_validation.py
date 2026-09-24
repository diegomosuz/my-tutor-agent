"""Validación de un `GeneratedQuestionBankBody` (Fase 6).

La validación de forma del contrato (tipos, enums, mínimo de opciones,
unicidad de option_id, correct_option_ids válidos, cantidad de correctas
por tipo de pregunta) ya la hace Pydantic en `app/models/certification.py`
(igual que `GroundedText`/`VisualPlan` en Fase 3). Esta capa completa lo
que Pydantic no puede validar por sí solo porque necesita el
`CanonicalTopicContent` real del tópico (trazabilidad de `source_refs`/
`derivation_refs`) o el banco COMPLETO (detección de preguntas
duplicadas).
"""
from __future__ import annotations

import re

from app.models.certification import GeneratedQuestionBankBody
from app.models.schemas import CanonicalTopicContent
from app.services.canonical import validate_source_refs
from app.services.llm_retry import ValidationFailure

_EXECUTABLE_MARKERS = ("<script", "javascript:", "<iframe", "onerror=", "onclick=")

# v1.6.1 (PARTE 15 de la especificación, "capa 3" conservadora): patrones
# que detectan una pregunta META-PEDAGÓGICA (pregunta sobre la
# DESCRIPCIÓN del recorrido de aprendizaje -- objetivos, "qué vas a
# aprender", estructura del curso/módulo -- nunca sobre el contenido
# técnico en sí). Se validan contra el STEM GENERADO por el LLM (la
# pregunta real), nunca contra el material fuente: filtrar bloques fuente
# por keyword arriesgaría excluir contenido técnico legítimo que
# mencione "objetivo"/"aprender" de forma normal (ver PARTE 9 de la
# especificación); en cambio, un stem que LITERALMENTE pregunta "¿qué
# aprenderás en este módulo?" es una señal inequívoca sin importar el
# tema del curso. Deliberadamente pocos patrones, no una lista de 100
# keywords (PARTE 15) -- esta es una red de seguridad conservadora sobre
# REGLA 21 del prompt (`app/prompts/certification.py`), no el mecanismo
# principal.
_META_PEDAGOGICAL_STEM_PATTERNS = [
    re.compile(r"qu[eé]\s+(vas a |vamos a |podr[aá]s?\s+)?aprender", re.IGNORECASE),
    re.compile(
        r"(objetivo|prop[oó]sito)(s)?\s+(pedag[oó]gic[oa]\s+)?(de(l)?\s+)?(este\s+|el\s+)?"
        r"(m[oó]dulo|curso|t[oó]pico|unidad|lecci[oó]n|secci[oó]n)",
        re.IGNORECASE,
    ),
    re.compile(r"qu[eé]\s+(\w+\s+)?se\s+(abordar|ver|cubrir|tratar)([aá]|[aá]n|emos)", re.IGNORECASE),
    re.compile(
        r"al\s+finalizar\s+(este|el)\s+(m[oó]dulo|curso|t[oó]pico|unidad)", re.IGNORECASE
    ),
    re.compile(r"competencia(s)?\s+(que\s+)?se\s+espera(n)?\s+desarrollar", re.IGNORECASE),
    re.compile(r"qu[eé]\s+veremos", re.IGNORECASE),
    re.compile(r"qu[eé]\s+aprender[aá](s)?\s+el\s+(estudiante|alumno)", re.IGNORECASE),
]


def _is_meta_pedagogical_stem(text: str) -> bool:
    return any(pattern.search(text) for pattern in _META_PEDAGOGICAL_STEM_PATTERNS)


def _normalize_stem(text: str) -> str:
    normalized = text.strip().lower()
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _check_executable_content(problems: list[str], label: str, text: str) -> None:
    lowered = text.lower()
    for marker in _EXECUTABLE_MARKERS:
        if marker in lowered:
            problems.append(f"{label}: contiene contenido no permitido ('{marker}').")


def validate_question_bank(
    body: GeneratedQuestionBankBody, canonical: CanonicalTopicContent
) -> None:
    problems: list[str] = []
    seen_normalized_stems: dict[str, int] = {}

    for i, question in enumerate(body.questions):
        label = f"questions[{i}]"

        if not question.stem.source_refs:
            problems.append(f"{label}.stem: source_refs vacío.")
        else:
            result = validate_source_refs(question.stem.source_refs, canonical)
            if result.invalid_refs:
                problems.append(f"{label}.stem: source_refs inexistentes {result.invalid_refs}.")
        _check_executable_content(problems, f"{label}.stem", question.stem.text)
        if _is_meta_pedagogical_stem(question.stem.text):
            problems.append(
                f"{label}.stem: pregunta meta-pedagógica (evalúa la descripción del recorrido de "
                "aprendizaje -- objetivos/qué vas a aprender/estructura del curso -- en vez del "
                "contenido técnico real, ver REGLA 21)."
            )

        for j, option in enumerate(question.options):
            opt_label = f"{label}.options[{j}]"
            result = validate_source_refs(option.derivation_refs, canonical)
            if result.invalid_refs:
                problems.append(f"{opt_label}: derivation_refs inexistentes {result.invalid_refs}.")
            _check_executable_content(problems, opt_label, option.text)

        for k, chunk in enumerate(question.explanation):
            exp_label = f"{label}.explanation[{k}]"
            if not chunk.source_refs:
                problems.append(f"{exp_label}: source_refs vacío.")
                continue
            result = validate_source_refs(chunk.source_refs, canonical)
            if result.invalid_refs:
                problems.append(f"{exp_label}: source_refs inexistentes {result.invalid_refs}.")
            _check_executable_content(problems, exp_label, chunk.text)

        if not question.competency.source_refs:
            problems.append(f"{label}.competency: source_refs vacío.")
        else:
            result = validate_source_refs(question.competency.source_refs, canonical)
            if result.invalid_refs:
                problems.append(
                    f"{label}.competency: source_refs inexistentes {result.invalid_refs}."
                )

        normalized = _normalize_stem(question.stem.text)
        if normalized in seen_normalized_stems:
            first_index = seen_normalized_stems[normalized]
            problems.append(
                f"{label}.stem: duplicado (mismo enunciado normalizado que questions[{first_index}])."
            )
        else:
            seen_normalized_stems[normalized] = i

    if problems:
        raise ValidationFailure(problems)
