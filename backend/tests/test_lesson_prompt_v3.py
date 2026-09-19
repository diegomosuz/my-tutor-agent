"""Tests del prompt de LessonGenerator: comprehension_check (Fase 6) +
guías de rendering pedagógico v1.1.0 (lesson-v3): scene_type ampliado,
elección de visual_type por estructura, densidad, narración≠slide, política
de imágenes/código + ajuste quirúrgico v1.2.0 bloque "Visual Fidelity"
(lesson-v3.1): desambiguación process/hierarchy, detección de comparison,
densidad más estricta + bloque "Visual Selection Reliability"
(lesson-v3.2): matriz semántica explícita, consolidación de fragmentos
comparativos en una escena, distinción table-vs-comparison.
LESSON_PROMPT_VERSION avanzó a "lesson-v3.2" (invalida la cache de
"lesson-v3.1", que sigue existiendo intacta en el filesystem, igual que
"lesson-v3")."""
from __future__ import annotations

from app.prompts.lesson import LESSON_PROMPT_VERSION, SYSTEM_PROMPT


def test_lesson_prompt_version_is_v3_2():
    assert LESSON_PROMPT_VERSION == "lesson-v3.2"


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


# --------------------------------------------------------------------------
# v1.2.0 — bloque "Visual Fidelity": ajuste quirúrgico de REGLA 14/15
# (PARTE 13/14/17 de la especificación).
# --------------------------------------------------------------------------


def test_F_system_prompt_prefers_process_over_hierarchy_for_temporal_order():
    # F: guía de proceso/jerarquía presente — el criterio de desambiguación
    # explícito (orden temporal manda sobre composición) debe estar en el
    # texto real que ve el modelo, no solo en un comentario del código.
    assert "el orden temporal manda sobre la composición" in SYSTEM_PROMPT
    assert "Paso 1" in SYSTEM_PROMPT
    assert "sigue a" in SYSTEM_PROMPT or "flows_to" in SYSTEM_PROMPT


def test_hierarchy_guidance_defines_no_temporal_order():
    assert "SIN orden temporal" in SYSTEM_PROMPT
    assert "se compone de" in SYSTEM_PROMPT


def test_G_system_prompt_comparison_semantic_guidance_present():
    # G: detección de comparison sin exigir "vs"/"versus"/"comparación".
    assert "antes/después" in SYSTEM_PROMPT
    assert "incorrecto/correcto" in SYSTEM_PROMPT
    assert 'no hace falta que aparezca literalmente la palabra "vs"' in SYSTEM_PROMPT


def test_comparison_guidance_never_invents_missing_side():
    assert "Nunca inventes el lado que falta" in SYSTEM_PROMPT


def test_comparison_guidance_mentions_columns_field():
    assert '"columns"' in SYSTEM_PROMPT
    assert "nunca repitiendo entre columnas los mismos puntos" in SYSTEM_PROMPT


def test_system_prompt_tightens_density_guidance_short_phrases():
    # PARTE 17: preferir frases cortas de 3 a 7 palabras en vez de
    # oraciones completas de ~15 palabras.
    assert "3 a 7 palabras" in SYSTEM_PROMPT
    assert "nunca truncamiento" in SYSTEM_PROMPT.lower() or "no truncamiento" in SYSTEM_PROMPT.lower() or "guía de generación" in SYSTEM_PROMPT


def test_system_prompt_never_forces_diagrams_over_declarative_content():
    # PARTE 15: no forzar visuales — el prompt debe seguir permitiendo
    # bullets/hero/none para contenido genuinamente declarativo.
    assert "el objetivo NUNCA es forzar un diagrama" in SYSTEM_PROMPT


# --------------------------------------------------------------------------
# v1.2.0 — bloque "Visual Selection Reliability" (lesson-v3.2): matriz
# semántica explícita, prioridad process/hierarchy reforzada con la
# validación determinística, detección ampliada de comparison, y
# consolidación de fragmentos comparativos en una sola escena (PARTE
# 2/3/6/7/14.G-I de la especificación).
# --------------------------------------------------------------------------


def test_semantic_matrix_summary_present_at_top_of_regla_14():
    assert "Matriz semántica de referencia rápida" in SYSTEM_PROMPT
    assert "secuencia temporal / pasos ordenados" in SYSTEM_PROMPT
    assert "componentes técnicos con conexiones reales entre ellos (sistema)" in SYSTEM_PROMPT
    assert "relaciones conceptuales (no técnicas) entre ideas" in SYSTEM_PROMPT


def test_visual_selection_process_hierarchy_priority_guidance_present():
    # PARTE 14.H: la prioridad process > hierarchy ante orden temporal ya
    # existía en v3.1 (test_F_system_prompt_prefers_process_over_hierarchy);
    # v3.2 la refuerza prohibiendo explícitamente "flows_to" en hierarchy y
    # documentando la validación determinística asociada.
    assert "NUNCA uses \"flows_to\" en una escena \"hierarchy\"" in SYSTEM_PROMPT
    assert "se valida automáticamente" in SYSTEM_PROMPT
    assert "es en realidad \"process\", no \"concept_map\"" in SYSTEM_PROMPT


def test_visual_selection_comparison_before_after_guidance_present():
    # PARTE 14.G: ejemplos de contraste ampliados más allá de v3.1
    # (antes/después, incorrecto/correcto ya existían) — v3.2 agrega
    # actual/futuro, alternativa 1/alternativa 2, modelo A/modelo B.
    assert "actual/futuro" in SYSTEM_PROMPT
    assert "alternativa 1/alternativa 2" in SYSTEM_PROMPT
    assert "modelo A/modelo B" in SYSTEM_PROMPT


def test_visual_selection_table_vs_comparison_distinction_present():
    assert "CONSULTAR filas/columnas" in SYSTEM_PROMPT or "CONSULTE la información" in SYSTEM_PROMPT
    assert "comparison\" en modo tabla" in SYSTEM_PROMPT


def test_visual_selection_scene_consolidation_guidance_present():
    # PARTE 14.I: REGLA 20 pide consolidar fragmentos comparativos
    # inseparables en una única escena en vez de partirlos en dos.
    assert "REGLA 20" in SYSTEM_PROMPT
    assert "CONSOLIDAR FRAGMENTOS COMPARATIVOS EN UNA SOLA ESCENA" in SYSTEM_PROMPT
    assert "nunca en dos escenas separadas consecutivas" in SYSTEM_PROMPT
    assert "NO es una regla general de fusionar escenas parecidas" in SYSTEM_PROMPT


def test_visual_selection_scene_type_visual_type_coherence_guidance_present():
    # PARTE 9: guía de coherencia, deliberadamente SIN validación rígida en
    # código (ver lesson_validation.py — no hay ningún chequeo de
    # scene_type vs visual_type ahí).
    assert "Coherencia entre scene_type y visual_type" in SYSTEM_PROMPT
    assert "nunca por conveniencia ni por default" in SYSTEM_PROMPT


def test_correction_message_strips_reason_code_marker_before_reaching_llm():
    # PARTE 10: el marcador [visual_semantic_mismatch_process] es solo
    # para clasificación interna de logs (lesson_generator.py) — nunca
    # debe llegar al mensaje que efectivamente se envía al LLM.
    from app.prompts.lesson import build_correction_message

    problems = [
        "SCENE-002.visual: declarado como 'hierarchy' pero TODAS sus edges "
        "son 'flows_to' (relación de secuencia temporal), no de composición "
        "jerárquica. [visual_semantic_mismatch_process] Si el contenido "
        "citado en source_refs realmente describe una secuencia ordenada, "
        "usá visual_type='process' con 'process_steps' en su lugar."
    ]
    message = build_correction_message(problems)
    assert "[visual_semantic_mismatch_process]" not in message["content"]
    assert "TODAS sus edges son 'flows_to'" in message["content"]
