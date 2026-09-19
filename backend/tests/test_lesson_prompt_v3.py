"""Tests del prompt de LessonGenerator: comprehension_check (Fase 6) +
guías de rendering pedagógico v1.1.0 (lesson-v3): scene_type ampliado,
elección de visual_type por estructura, densidad, narración≠slide, política
de imágenes/código. LESSON_PROMPT_VERSION avanzó a "lesson-v3" (invalida la
cache de "lesson-v2")."""
from __future__ import annotations

from app.prompts.lesson import LESSON_PROMPT_VERSION, SYSTEM_PROMPT


def test_lesson_prompt_version_is_v3():
    assert LESSON_PROMPT_VERSION == "lesson-v3"


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


# --------------------------------------------------------------------------
# v1.1.0 — bloque de rendering pedagógico (PARTE 26.A de la especificación)
# --------------------------------------------------------------------------


def test_system_prompt_guides_visual_type_choice_by_structure_not_variety():
    assert "REGLA 14" in SYSTEM_PROMPT
    assert "nunca para" in SYSTEM_PROMPT.lower() or "NUNCA POR VARIAR" in SYSTEM_PROMPT


def test_system_prompt_forbids_inventing_images():
    assert "REGLA 17" in SYSTEM_PROMPT
    assert "Nunca generes ni sugieras una URL de imagen" in SYSTEM_PROMPT


def test_system_prompt_forbids_inventing_code():
    assert "REGLA 18" in SYSTEM_PROMPT
    assert "Nunca inventes un fragmento de código nuevo" in SYSTEM_PROMPT


def test_system_prompt_narration_is_never_verbatim_slide_reading():
    assert "REGLA 16" in SYSTEM_PROMPT
    assert "no debe limitarse a leer palabra por palabra" in SYSTEM_PROMPT


def test_system_prompt_mentions_density_limits():
    assert "REGLA 15" in SYSTEM_PROMPT
    assert "3 a 5" in SYSTEM_PROMPT


def test_system_prompt_mentions_architecture_never_invents_connections():
    assert "NUNCA inventes una conexión entre dos componentes" in SYSTEM_PROMPT
