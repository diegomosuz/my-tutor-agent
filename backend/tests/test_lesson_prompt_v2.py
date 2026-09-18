"""Tests del cierre de deuda de Fase 5 (Fase 6, punto 1.A): el prompt de
LessonGenerator ahora pide razonablemente `comprehension_check` cuando el
contenido lo justifica, sin convertirlo en obligación absoluta, y
LESSON_PROMPT_VERSION avanzó a "lesson-v2" (invalida la cache de
"lesson-v1")."""
from __future__ import annotations

from app.prompts.lesson import LESSON_PROMPT_VERSION, SYSTEM_PROMPT


def test_lesson_prompt_version_is_v2():
    assert LESSON_PROMPT_VERSION == "lesson-v2"


def test_system_prompt_mentions_comprehension_check_guidance():
    assert "comprehension_check" in SYSTEM_PROMPT
    assert "REGLA 13" in SYSTEM_PROMPT


def test_system_prompt_does_not_make_comprehension_check_mandatory():
    # No debe convertirse en una obligación absoluta: el texto debe dejar
    # explícito que un tópico breve puede no justificar ninguna.
    assert "NO es una obligación absoluta" in SYSTEM_PROMPT
    assert "puede no justificar ninguna" in SYSTEM_PROMPT


def test_system_prompt_requires_grounded_question_and_expected_answer():
    assert "source_refs válidos" in SYSTEM_PROMPT
    assert "expected_answer" in SYSTEM_PROMPT


def test_system_prompt_forbids_claiming_certification_origin_for_checks():
    assert "examen de certificación real" in SYSTEM_PROMPT
