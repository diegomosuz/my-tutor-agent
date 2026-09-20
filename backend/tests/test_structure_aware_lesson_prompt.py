"""Tests del bloque "Structure-Aware Lesson Generation" (v1.3.0, Bloque 3).

Cubre dos cosas distintas, deliberadamente separadas:

1. Guía nueva del prompt (REGLA 7 reformulada + REGLA 21 nueva) -- texto
   estático, verificado con aserciones de contenido (no hay LLM acá).
2. Fixtures sintéticas de GroundingPacket (PARTE 29): confirman que
   `build_user_prompt`/`build_messages` efectivamente incrustan la
   metadata estructural nueva en el mensaje que se le manda al LLM, para
   los 5 casos pedidos (tabla, imagen, código, proceso ordenado, lista
   paralela). Esto NO prueba comportamiento del LLM real (eso es QA
   manual con el proveedor real, ver docs/STRUCTURE_AWARE_LESSONS.md) --
   solo prueba que el prompt builder construye lo que promete construir.
"""
from __future__ import annotations

from app.models.schemas import TopicMetadata
from app.prompts.lesson import LESSON_PROMPT_VERSION, SYSTEM_PROMPT, build_messages, build_user_prompt
from app.services.canonical import build_canonical_topic, build_grounding_packet


def _packet(markdown_text: str, *, title: str = "Tema") -> str:
    canonical = build_canonical_topic(
        course_id="curso",
        module_id="modulo",
        topic_id="topico",
        metadata=TopicMetadata(title=title, order=1, description=""),
        raw_markdown=markdown_text,
    )
    return build_grounding_packet(
        canonical,
        course_title="Curso",
        module_title="Módulo",
        topic_title=title,
        include_structural_metadata=True,
    )


# --------------------------------------------------------------------------
# A-H: guía nueva del system prompt
# --------------------------------------------------------------------------


def test_A_system_prompt_declares_structured_blocks_as_high_value():
    assert "REGLA 21" in SYSTEM_PROMPT
    assert "ALTO VALOR" in SYSTEM_PROMPT
    assert "NO puede desaparecer de la LessonPlan" in SYSTEM_PROMPT


def test_B_scene_budget_guidance_never_sacrifices_structured_content_first():
    assert "RANGO TÍPICO observado" in SYSTEM_PROMPT
    assert "NUNCA un objetivo de compresión" in SYSTEM_PROMPT
    assert "nunca sacrifiques primero un bloque estructurado real" in SYSTEM_PROMPT


def test_C_heading_never_determines_visual_type():
    assert "EL HEADING DA CONTEXTO, NUNCA DETERMINA visual_type" in SYSTEM_PROMPT
    assert "nunca para decidir automáticamente su visual_type" in SYSTEM_PROMPT


def test_D_process_requires_explicit_ordering_signal():
    assert "PROCESS REQUIERE ORDEN EXPLÍCITO EN EL CONTENIDO" in SYSTEM_PROMPT
    assert "no en el heading" in SYSTEM_PROMPT


def test_E_parallel_items_are_never_process():
    assert "elementos PARALELOS sin ninguna de estas señales" in SYSTEM_PROMPT
    assert 'NO es "process" aunque la fuente los liste uno tras otro' in SYSTEM_PROMPT


def test_F_table_guidance_prefers_table_or_comparison_never_silent_bullets():
    assert "nunca conviertas una tabla real en bullets sueltos" in SYSTEM_PROMPT
    # v1.3.0 (Bloque 3): QA real mostró que permitir "comparison" para
    # tablas reales causaba un fallo sistemático de contrato (ver
    # test_visual_selection_table_vs_comparison_distinction_present) --
    # la guía final es "table" siempre, nunca "comparison", para
    # cualquier tabla Markdown real.
    assert 'NUNCA uses "comparison" para un bloque "type: table"' in SYSTEM_PROMPT


def test_G_image_guidance_prefers_image_visual_or_dedicated_scene():
    assert 'debería preferir visual_type="image" o una escena propia' in SYSTEM_PROMPT
    assert "nunca ignores sistemáticamente todas las imágenes" in SYSTEM_PROMPT


def test_H_code_guidance_prefers_code_visual_never_rewritten_as_bullets():
    assert 'debería preferir visual_type="code"' in SYSTEM_PROMPT
    assert "nunca reescrito como bullets" in SYSTEM_PROMPT


def test_metadata_format_documented_in_prompt():
    # El modelo tiene que saber leer "type:"/"list_kind:"/"lang:"/
    # "heading_path:" -- confirmamos que el prompt describe exactamente
    # ese vocabulario (mismo que emite canonical.py::_describe_block_metadata).
    assert "type: <tipo>" in SYSTEM_PROMPT
    assert "list_kind: ordered/unordered/task" in SYSTEM_PROMPT
    assert "heading_path: A > B > C" in SYSTEM_PROMPT


def test_no_hardcoded_course_specific_names_in_new_guidance():
    # PARTE 40: las reglas deben funcionar para cualquier curso, nunca
    # atadas a nombres de dominio de un curso puntual.
    forbidden = ["Spec Driven Design", "SDD", "TDD", "BDD", "OpenAPI", "Haiku", "Claude", "Spec Kit"]
    for term in forbidden:
        assert term not in SYSTEM_PROMPT


def test_I_lesson_prompt_v3_3_is_effective():
    assert LESSON_PROMPT_VERSION == "lesson-v3.3"


def test_J_cache_key_changes_with_new_prompt_version():
    # El cache key de LessonPlan depende de content_sha256+provider+model+
    # prompt_version (ver lesson_generator.py::_cache_key) -- confirmamos
    # acá solo la precondición (versión distinta de todas las anteriores),
    # el mecanismo de invalidación en sí ya está cubierto por
    # test_lesson_generator.py::test_different_lesson_prompt_version_....
    assert LESSON_PROMPT_VERSION not in {"lesson-v3", "lesson-v3.1", "lesson-v3.2", "lesson-v3.2.1"}


# --------------------------------------------------------------------------
# PARTE 29: golden generation fixtures -- confirman que la metadata
# estructural realmente llega al mensaje que recibe el LLM, para los 5
# casos pedidos. No fakean comportamiento del LLM: solo verifican que el
# prompt builder incrusta lo que promete incrustar.
# --------------------------------------------------------------------------


def test_golden_1_table_metadata_reaches_user_prompt():
    packet = _packet(
        "# Tema\n\n"
        "## Comparación\n\n"
        "| A | B |\n|---|---|\n| 1 | 2 |\n"
    )
    prompt = build_user_prompt(packet)
    assert "type: table" in prompt
    assert "| A | B |" in prompt
    assert "heading_path: Tema > Comparación" in prompt


def test_golden_2_image_metadata_reaches_user_prompt():
    packet = _packet(
        "# Tema\n\n"
        "## Ilustración\n\n"
        "![Diagrama](images/diagrama.png)\n"
    )
    prompt = build_user_prompt(packet)
    assert "type: image" in prompt
    assert "![Diagrama](images/diagrama.png)" in prompt


def test_golden_3_code_metadata_reaches_user_prompt():
    packet = _packet(
        "# Tema\n\n"
        "## Implementación\n\n"
        "```python\ndef f():\n    return 1\n```\n"
    )
    prompt = build_user_prompt(packet)
    assert "type: code" in prompt
    assert "lang: python" in prompt
    assert "def f():" in prompt


def test_golden_4_ordered_process_metadata_reaches_user_prompt():
    packet = _packet(
        "# Tema\n\n"
        "## Pasos\n\n"
        "1. Primero hacé esto.\n2. Luego hacé aquello.\n3. Finalmente confirmá.\n"
    )
    prompt = build_user_prompt(packet)
    assert "type: list" in prompt
    assert "list_kind: ordered" in prompt
    assert "1. Primero hacé esto." in prompt


def test_golden_5_parallel_unordered_list_metadata_reaches_user_prompt():
    packet = _packet(
        "# Tema\n\n"
        "## Principios\n\n"
        "- Principio independiente A.\n- Principio independiente B.\n- Principio independiente C.\n"
    )
    prompt = build_user_prompt(packet)
    assert "type: list" in prompt
    assert "list_kind: unordered" in prompt
    # Nunca debe mencionarse "ordered" para esta lista paralela.
    assert "list_kind: ordered" not in prompt


def test_build_messages_uses_structural_packet_end_to_end():
    packet = _packet("# Tema\n\n| A | B |\n|---|---|\n| 1 | 2 |\n")
    messages = build_messages(packet)
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert "type: table" in messages[1]["content"]
