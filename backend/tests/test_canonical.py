"""Tests del parser canónico determinístico (Fase 2).

Cubren: los tipos de bloque soportados, los casos de Markdown listados en
la especificación de Fase 2, y las invariantes A-J exigidas sobre
SourceBlock / CanonicalTopicContent / Grounding Packet / validate_source_refs.
"""
from __future__ import annotations

import re

import pytest

from app.models.schemas import TopicMetadata
from app.services.canonical import (
    InvalidSourceReferenceError,
    assert_valid_source_refs,
    build_canonical_topic,
    build_grounding_packet,
    parse_source_blocks,
    validate_source_refs,
)

SAMPLE_METADATA = TopicMetadata(title="Tópico de prueba", order=1, description="")


def _canonical(markdown_text: str):
    return build_canonical_topic(
        course_id="curso",
        module_id="modulo",
        topic_id="topico",
        metadata=SAMPLE_METADATA,
        raw_markdown=markdown_text,
    )


# --------------------------------------------------------------------------
# 1-2. Frontmatter ya se resuelve en app.services.courses antes de llegar acá;
# el parser canónico solo ve Markdown puro. Se valida a nivel de API en
# test_courses.py. Acá confirmamos que el parser no asume frontmatter.
# --------------------------------------------------------------------------


def test_parser_works_on_plain_markdown_without_frontmatter():
    blocks = parse_source_blocks("# Título\n\nContenido simple.\n")
    assert len(blocks) == 2
    assert blocks[0].block_type == "heading"
    assert blocks[1].block_type == "paragraph"


# --------------------------------------------------------------------------
# 3. Múltiples niveles de headings -> heading_path coherente
# --------------------------------------------------------------------------


def test_heading_hierarchy_tracks_nested_levels():
    md = (
        "# Arquitectura\n\n"
        "## Componentes\n\n"
        "### Datos\n\n"
        "Un párrafo bajo Datos.\n\n"
        "## Otro Componente\n\n"
        "Otro párrafo.\n"
    )
    blocks = parse_source_blocks(md)
    by_type = {b.block_type: b for b in blocks}

    h1, h2_componentes, h3_datos, p_datos, h2_otro, p_otro = blocks

    assert h1.heading_path == ["Arquitectura"]
    assert h2_componentes.heading_path == ["Arquitectura", "Componentes"]
    assert h3_datos.heading_path == ["Arquitectura", "Componentes", "Datos"]
    assert p_datos.heading_path == ["Arquitectura", "Componentes", "Datos"]
    # Un nuevo H2 debe reemplazar "Componentes" (y todo lo debajo de él).
    assert h2_otro.heading_path == ["Arquitectura", "Otro Componente"]
    assert p_otro.heading_path == ["Arquitectura", "Otro Componente"]


def test_setext_headings_are_detected_with_correct_title_and_lines():
    """Cierre de deuda de Fase 2: los headings estilo Setext (subrayados con
    '=' o '-') deben detectarse como heading, con el título correcto (sin
    la línea de subrayado) y heading_path coherente. El rango de líneas
    preserva ambas líneas del heading Setext (título + subrayado), ya que
    ese es el markdown literal de ese bloque."""
    md = (
        "Título nivel 1\n"
        "==============\n"
        "\n"
        "Subtítulo nivel 2\n"
        "-----------------\n"
        "\n"
        "Un párrafo bajo el subtítulo.\n"
    )
    blocks = parse_source_blocks(md)
    assert len(blocks) == 3

    h1, h2, paragraph = blocks

    assert h1.block_type == "heading"
    assert h1.plain_text == "Título nivel 1"
    assert h1.start_line == 1
    assert h1.end_line == 2
    assert h1.heading_path == ["Título nivel 1"]
    # El markdown literal conserva ambas líneas (título + subrayado).
    assert h1.markdown == "Título nivel 1\n=============="

    assert h2.block_type == "heading"
    assert h2.plain_text == "Subtítulo nivel 2"
    assert h2.start_line == 4
    assert h2.end_line == 5
    assert h2.heading_path == ["Título nivel 1", "Subtítulo nivel 2"]

    assert paragraph.block_type == "paragraph"
    assert paragraph.heading_path == ["Título nivel 1", "Subtítulo nivel 2"]

    # Determinismo: un segundo parseo produce exactamente el mismo modelo.
    assert parse_source_blocks(md) == blocks


# --------------------------------------------------------------------------
# 4. Párrafos multilínea
# --------------------------------------------------------------------------


def test_multiline_paragraph_is_a_single_block():
    md = "Línea uno del párrafo\nLínea dos del párrafo\nLínea tres.\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    assert blocks[0].block_type == "paragraph"
    assert blocks[0].start_line == 1
    assert blocks[0].end_line == 3
    assert "Línea uno" in blocks[0].markdown
    assert "Línea tres." in blocks[0].markdown


# --------------------------------------------------------------------------
# 5-6. Listas unordered / ordered
# --------------------------------------------------------------------------


def test_unordered_list_is_a_single_block():
    md = "- item uno\n- item dos\n- item tres\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    assert blocks[0].block_type == "list"
    assert blocks[0].start_line == 1
    assert blocks[0].end_line == 3


def test_ordered_list_is_a_single_block():
    md = "1. uno\n2. dos\n3. tres\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    assert blocks[0].block_type == "list"


# --------------------------------------------------------------------------
# 7-8. Fenced code block, con líneas vacías internas y caracteres Markdown
# --------------------------------------------------------------------------


def test_fenced_code_block_preserves_blank_lines_and_markdown_chars():
    md = (
        "```python\n"
        "# esto no es un heading\n"
        "\n"
        "def f():\n"
        "    x = \"**no es negrita**\"\n"
        "\n"
        "    return x\n"
        "```\n"
    )
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    block = blocks[0]
    assert block.block_type == "code"
    # El markdown crudo conserva EXACTAMENTE las líneas vacías internas.
    assert "\n\n" in block.markdown
    assert block.markdown.startswith("```python")
    assert block.markdown.endswith("```")
    # El plain_text no debe confundir el "#" o "**" del código con sintaxis.
    assert "# esto no es un heading" in block.plain_text
    assert '"**no es negrita**"' in block.plain_text
    assert "```" not in block.plain_text


# --------------------------------------------------------------------------
# 9. Tabla Markdown
# --------------------------------------------------------------------------


def test_markdown_table_is_a_single_block():
    md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    assert blocks[0].block_type == "table"
    assert blocks[0].start_line == 1
    assert blocks[0].end_line == 4
    assert "| A | B |" in blocks[0].markdown


# --------------------------------------------------------------------------
# 10. Blockquote
# --------------------------------------------------------------------------


def test_blockquote_block():
    md = "> Esta es una cita.\n> Con dos líneas.\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    assert blocks[0].block_type == "blockquote"
    assert "Esta es una cita." in blocks[0].plain_text
    assert ">" not in blocks[0].plain_text


# --------------------------------------------------------------------------
# 11. Imagen Markdown
# --------------------------------------------------------------------------


def test_standalone_image_is_detected_as_image_block():
    md = "![Diagrama de arquitectura](http://example.com/diagrama.png)\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    assert blocks[0].block_type == "image"
    assert blocks[0].plain_text.strip() == "Diagrama de arquitectura"


def test_image_inside_paragraph_with_text_stays_paragraph():
    md = "Mirá esta imagen: ![alt](http://example.com/x.png) y seguí leyendo.\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    assert blocks[0].block_type == "paragraph"


# --------------------------------------------------------------------------
# 12. Enlaces
# --------------------------------------------------------------------------


def test_links_are_preserved_in_markdown_and_stripped_in_plain_text():
    md = "Visitá la [documentación oficial](https://example.com/docs) para más.\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    assert "[documentación oficial](https://example.com/docs)" in blocks[0].markdown
    assert "documentación oficial" in blocks[0].plain_text
    assert "https://example.com/docs" not in blocks[0].plain_text


# --------------------------------------------------------------------------
# 13. UTF-8 español
# --------------------------------------------------------------------------


def test_utf8_spanish_characters_preserved():
    md = "# Configuración básica\n\n¿Qué es esto? ¡Atención! Á É Í Ó Ú Ñ á é í ó ú ñ.\n"
    blocks = parse_source_blocks(md)
    heading, paragraph = blocks
    assert heading.plain_text == "Configuración básica"
    assert "¿Qué es esto?" in paragraph.markdown
    assert "¡Atención!" in paragraph.markdown
    assert "ñ" in paragraph.markdown


# --------------------------------------------------------------------------
# 14. Términos técnicos sin traducir
# --------------------------------------------------------------------------


def test_technical_terms_are_preserved_verbatim():
    md = (
        "El pipeline usa **embedding**, *fine-tuning* y `retrieval` sobre un "
        "API Gateway desplegado en Kubernetes.\n"
    )
    blocks = parse_source_blocks(md)
    assert len(blocks) == 1
    text = blocks[0].plain_text
    for term in ["embedding", "fine-tuning", "retrieval", "API Gateway", "Kubernetes"]:
        assert term in text
    for term in ["embedding", "fine-tuning", "retrieval", "API Gateway", "Kubernetes"]:
        assert term in blocks[0].markdown


# --------------------------------------------------------------------------
# 15. Documento que termina sin newline
# --------------------------------------------------------------------------


def test_document_without_trailing_newline():
    md = "# Título\n\nÚltimo párrafo sin salto de línea final"
    blocks = parse_source_blocks(md)
    assert blocks[-1].block_type == "paragraph"
    assert blocks[-1].markdown == "Último párrafo sin salto de línea final"
    assert blocks[-1].end_line == 3


# --------------------------------------------------------------------------
# 16. Documento con líneas vacías múltiples
# --------------------------------------------------------------------------


def test_multiple_blank_lines_between_blocks():
    md = "Primer párrafo.\n\n\n\nSegundo párrafo.\n"
    blocks = parse_source_blocks(md)
    assert len(blocks) == 2
    assert blocks[0].markdown == "Primer párrafo."
    assert blocks[1].markdown == "Segundo párrafo."
    # Las líneas vacías intermedias no pertenecen a ningún bloque, pero el
    # segundo párrafo debe reportar su línea real (línea 5).
    assert blocks[1].start_line == 5


# --------------------------------------------------------------------------
# Invariantes A-J
# --------------------------------------------------------------------------

_FULL_DOCUMENT = """# Curso de prueba

## Introducción

Este es un párrafo con **negrita**, *cursiva* y [un enlace](https://example.com).

## Conceptos

- primero
- segundo
- tercero

1. uno
2. dos

### Código de ejemplo

```python
def f():
    # comentario
    return "**no negrita**"
```

### Datos en tabla

| Columna A | Columna B |
| --- | --- |
| 1 | 2 |

> Una cita relevante.

![Diagrama](https://example.com/diagrama.png)

---

Fin del documento con términos técnicos: embedding, fine-tuning, Kubernetes.
"""


def test_invariant_a_source_refs_are_unique():
    canonical = _canonical(_FULL_DOCUMENT)
    refs = [b.source_ref for b in canonical.source_blocks]
    assert len(refs) == len(set(refs))


def test_invariant_b_source_refs_are_sequential_and_ordered():
    canonical = _canonical(_FULL_DOCUMENT)
    refs = [b.source_ref for b in canonical.source_blocks]
    expected = [f"SRC-{i:03d}" for i in range(1, len(refs) + 1)]
    assert refs == expected


def test_invariant_c_start_line_le_end_line():
    canonical = _canonical(_FULL_DOCUMENT)
    for block in canonical.source_blocks:
        assert block.start_line <= block.end_line


def test_invariant_d_blocks_appear_in_document_order():
    canonical = _canonical(_FULL_DOCUMENT)
    starts = [b.start_line for b in canonical.source_blocks]
    assert starts == sorted(starts)
    assert len(starts) == len(set(starts))


def test_invariant_e_reparsing_same_document_is_deterministic():
    first = parse_source_blocks(_FULL_DOCUMENT)
    second = parse_source_blocks(_FULL_DOCUMENT)
    assert first == second


def test_invariant_f_same_content_same_hash():
    c1 = _canonical(_FULL_DOCUMENT)
    c2 = _canonical(_FULL_DOCUMENT)
    assert c1.content_sha256 == c2.content_sha256


def test_invariant_g_changed_content_changes_hash():
    c1 = _canonical(_FULL_DOCUMENT)
    c2 = _canonical(_FULL_DOCUMENT + "\nUna línea nueva que cambia el contenido.\n")
    assert c1.content_sha256 != c2.content_sha256


def test_invariant_h_grounding_packet_refs_all_exist_in_source_blocks():
    canonical = _canonical(_FULL_DOCUMENT)
    packet = build_grounding_packet(
        canonical, course_title="Curso", module_title="Módulo", topic_title="Tópico"
    )
    refs_in_packet = set(re.findall(r"\[SRC-\d{3}\]", packet))
    refs_in_packet = {r.strip("[]") for r in refs_in_packet}
    known_refs = {b.source_ref for b in canonical.source_blocks}
    assert refs_in_packet.issubset(known_refs)
    assert refs_in_packet == known_refs  # todos los bloques están citados


def test_invariant_i_validate_source_refs_detects_invalid_refs():
    canonical = _canonical(_FULL_DOCUMENT)
    existing_ref = canonical.source_blocks[0].source_ref
    result = validate_source_refs([existing_ref, "SRC-999"], canonical)
    assert result.valid_refs == [existing_ref]
    assert result.invalid_refs == ["SRC-999"]

    with pytest.raises(InvalidSourceReferenceError) as exc_info:
        assert_valid_source_refs([existing_ref, "SRC-999"], canonical)
    assert exc_info.value.invalid_refs == ["SRC-999"]

    # No debe lanzar si todas las referencias son válidas.
    assert_valid_source_refs([existing_ref], canonical)


def test_invariant_j_raw_markdown_available_without_reformulation():
    canonical = _canonical(_FULL_DOCUMENT)
    assert canonical.raw_markdown == _FULL_DOCUMENT
    # El markdown de cada bloque debe ser un fragmento literal del original.
    for block in canonical.source_blocks:
        assert block.markdown in _FULL_DOCUMENT


# --------------------------------------------------------------------------
# Grounding packet: formato y contenido exclusivamente derivado del Markdown
# --------------------------------------------------------------------------


def test_grounding_packet_format_and_no_injected_content():
    canonical = _canonical("# Título\n\nUn párrafo simple.\n")
    packet = build_grounding_packet(
        canonical,
        course_title="Curso Demo",
        module_title="Módulo Demo",
        topic_title="Título",
    )
    assert packet.startswith("=== AUTHORIZED SOURCE: TOPIC ===")
    assert packet.rstrip().endswith("=== END AUTHORIZED SOURCE ===")
    assert "Course: Curso Demo" in packet
    assert "Module: Módulo Demo" in packet
    assert "Topic: Título" in packet
    assert f"Content SHA256: {canonical.content_sha256}" in packet
    assert "[SRC-001]" in packet
    assert "[SRC-002]" in packet
    assert "# Título" in packet
    assert "Un párrafo simple." in packet
    # Default: sin metadata estructural (comportamiento histórico intacto
    # para tutor/checkpoints/certificación/endpoint de inspección).
    assert "type:" not in packet
    assert "heading_path:" not in packet


# --------------------------------------------------------------------------
# v1.3.0 (Bloque 3, "Structure-Aware Lesson Generation"), PARTE 26:
# metadata estructural opt-in del Grounding Packet
# (include_structural_metadata=True), exclusiva de lesson_generator.py.
# --------------------------------------------------------------------------

_STRUCTURED_DOCUMENT = """# Tema

## Sección

Un párrafo introductorio.

| Modelo | Costo |
|---|---|
| A | Bajo |
| B | Alto |

```python
def f():
    return 1
```

![Diagrama del sistema](images/diagrama.png)

1. Primer paso
2. Segundo paso

- Item libre
- Otro item

Checklist de dominio:

- [ ] Tarea pendiente
- [x] Tarea hecha
"""


def _packet_with_metadata(markdown_text: str) -> str:
    canonical = _canonical(markdown_text)
    return build_grounding_packet(
        canonical,
        course_title="Curso",
        module_title="Módulo",
        topic_title="Tema",
        include_structural_metadata=True,
    )


def _block_section(packet: str, source_ref: str) -> str:
    start = packet.index(f"[{source_ref}]")
    end = packet.index("\n\n", start)
    return packet[start:end]


def test_metadata_disabled_by_default_matches_historical_packet():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    packet_default = build_grounding_packet(
        canonical, course_title="Curso", module_title="Módulo", topic_title="Tema"
    )
    packet_explicit_false = build_grounding_packet(
        canonical,
        course_title="Curso",
        module_title="Módulo",
        topic_title="Tema",
        include_structural_metadata=False,
    )
    assert packet_default == packet_explicit_false
    assert "type:" not in packet_default


def test_table_metadata_includes_type_and_preserves_literal_markdown():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    table_ref = next(b.source_ref for b in canonical.source_blocks if b.block_type == "table")
    packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
    section = _block_section(packet, table_ref)
    assert "type: table" in section
    assert "| Modelo | Costo |" in section
    assert "| A | Bajo |" in section


def test_image_metadata_includes_type_and_preserves_literal_markdown():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    image_ref = next(b.source_ref for b in canonical.source_blocks if b.block_type == "image")
    packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
    section = _block_section(packet, image_ref)
    assert "type: image" in section
    assert "![Diagrama del sistema](images/diagrama.png)" in section


def test_code_metadata_includes_type_lang_and_preserves_fence():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    code_ref = next(b.source_ref for b in canonical.source_blocks if b.block_type == "code")
    packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
    section = _block_section(packet, code_ref)
    assert "type: code" in section
    assert "lang: python" in section
    assert "```python" in section
    assert "def f():" in section


def test_paragraph_metadata_includes_type_without_extra_fields():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    para_ref = next(b.source_ref for b in canonical.source_blocks if b.block_type == "paragraph")
    packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
    section = _block_section(packet, para_ref)
    assert "type: paragraph" in section
    assert "list_kind:" not in section
    assert "lang:" not in section


def test_ordered_list_metadata_declares_list_kind_ordered():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    for block in canonical.source_blocks:
        if block.block_type == "list" and block.markdown.lstrip().startswith("1."):
            packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
            section = _block_section(packet, block.source_ref)
            assert "type: list" in section
            assert "list_kind: ordered" in section
            return
    pytest.fail("no ordered list block found in fixture")


def test_unordered_list_metadata_declares_list_kind_unordered():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    for block in canonical.source_blocks:
        if block.block_type == "list" and block.markdown.lstrip().startswith("- Item libre"):
            packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
            section = _block_section(packet, block.source_ref)
            assert "list_kind: unordered" in section
            return
    pytest.fail("no unordered list block found in fixture")


def test_task_list_metadata_declares_list_kind_task():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    for block in canonical.source_blocks:
        if block.block_type == "list" and "[ ]" in block.markdown:
            packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
            section = _block_section(packet, block.source_ref)
            assert "list_kind: task" in section
            return
    pytest.fail("no task list block found in fixture")


def test_heading_path_serialized_as_arrow_chain():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    table_ref = next(b.source_ref for b in canonical.source_blocks if b.block_type == "table")
    block = next(b for b in canonical.source_blocks if b.source_ref == table_ref)
    packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
    section = _block_section(packet, table_ref)
    expected = "heading_path: " + " > ".join(block.heading_path)
    assert expected in section


def test_structural_metadata_never_changes_source_refs_or_line_spans():
    canonical_before = _canonical(_STRUCTURED_DOCUMENT)
    packet = _packet_with_metadata(_STRUCTURED_DOCUMENT)
    refs_in_packet = {r.strip("[]") for r in re.findall(r"\[SRC-\d{3}\]", packet)}
    known_refs = {b.source_ref for b in canonical_before.source_blocks}
    assert refs_in_packet == known_refs
    # Nunca se agregan bloques nuevos ni se cambian sus line spans: el
    # canonical en sí (fuente de verdad de start_line/end_line) es
    # exactamente el mismo objeto sin importar include_structural_metadata.
    canonical_after = _canonical(_STRUCTURED_DOCUMENT)
    for before, after in zip(canonical_before.source_blocks, canonical_after.source_blocks):
        assert before.start_line == after.start_line
        assert before.end_line == after.end_line
        assert before.markdown == after.markdown


def test_grounding_packet_validate_source_refs_unaffected_by_metadata():
    canonical = _canonical(_STRUCTURED_DOCUMENT)
    existing_ref = canonical.source_blocks[0].source_ref
    # validate_source_refs opera sobre canonical.source_blocks, nunca sobre
    # el texto del packet -- confirmando que la metadata nueva del packet
    # no es "nueva evidencia" que pudiera alterar esta validación.
    result = validate_source_refs([existing_ref, "SRC-999"], canonical)
    assert result.valid_refs == [existing_ref]
    assert result.invalid_refs == ["SRC-999"]
