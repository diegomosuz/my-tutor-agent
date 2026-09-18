"""Evaluador determinístico de preguntas objetivas (Fase 6).

Deliberadamente SIN LLM: corregir single_choice/multiple_choice es una
comparación de conjuntos, no una tarea que necesite un modelo de lenguaje.
Mantenerlo aparte de `certification_service.py` lo hace trivial de testear
en aislamiento (ver `tests/test_certification_evaluator.py`).
"""
from __future__ import annotations

from app.models.certification import QuestionType, QuestionVerdict


def evaluate_answer(
    *,
    question_type: QuestionType,
    correct_option_ids: list[str],
    selected_option_ids: list[str],
) -> QuestionVerdict:
    """Reglas (documentadas explícitamente, sección 26 de la especificación
    de Fase 6):

    - single_choice: `selected == correct` -> correct; cualquier otro caso
      -> incorrect (incluye selección vacía, de más de una opción, o de
      una opción distinta).
    - multiple_choice: `selected == correct` (como conjuntos) -> correct;
      si la intersección con `correct` no está vacía pero no coincide
      exactamente -> partially_correct; si no comparte ninguna opción
      correcta (incluida una selección vacía) -> incorrect.

    No se usan porcentajes de similaridad ni ningún otro criterio difuso.
    """
    correct_set = set(correct_option_ids)
    selected_set = set(selected_option_ids)

    if question_type == QuestionType.single_choice:
        if selected_set == correct_set:
            return QuestionVerdict.correct
        return QuestionVerdict.incorrect

    # multiple_choice
    if selected_set == correct_set:
        return QuestionVerdict.correct
    if selected_set & correct_set:
        return QuestionVerdict.partially_correct
    return QuestionVerdict.incorrect


# Puntaje por verdict, usado para practice_score_percent (sección 31 de la
# especificación de Fase 6). Documentado explícitamente: crédito parcial de
# 0.5 para partially_correct; unanswered/incorrect no suman puntos.
VERDICT_POINTS: dict[QuestionVerdict, float] = {
    QuestionVerdict.correct: 1.0,
    QuestionVerdict.partially_correct: 0.5,
    QuestionVerdict.incorrect: 0.0,
}
