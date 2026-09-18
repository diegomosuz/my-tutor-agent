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
