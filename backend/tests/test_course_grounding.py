"""Tests de app/services/course_grounding.py (v1.4.0, Bloque 2): el
namespace `COURSE-SRC-*` y el packet `=== COURSE EVIDENCE ===` que
conecta el retrieval determinístico del Bloque 1
(`app/services/course_retrieval.py`) con el Tutor. Ningún test acá hace
una llamada LLM ni toca el filesystem de cursos real -- construye
`CourseEvidenceCandidate` sintéticos directamente (mismo patrón que
`tests/test_course_retrieval.py`)."""
from __future__ import annotations

from app.models.retrieval import CourseEvidenceCandidate
from app.services.course_grounding import (
    build_course_evidence_packet,
    build_course_source_bindings,
    validate_course_source_refs,
)


def _candidate(
    *,
    topic_id: str,
    source_ref: str = "SRC-001",
    module_id: str = "modulo-a",
    module_title: str = "Módulo A",
    topic_title: str = "Tópico",
    heading_path: list[str] | None = None,
    markdown: str = "Contenido del bloque.",
    score: float = 1.0,
) -> CourseEvidenceCandidate:
    return CourseEvidenceCandidate(
        course_id="curso-demo",
        module_id=module_id,
        module_title=module_title,
        topic_id=topic_id,
        topic_title=topic_title,
        source_ref=source_ref,
        block_type="paragraph",
        heading_path=heading_path or [],
        start_line=1,
        end_line=1,
        markdown=markdown,
        plain_text=markdown,
        score=score,
        matched_terms=["termino"],
    )


# --------------------------------------------------------------------------
# build_course_source_bindings: asignación COURSE-SRC-XXX
# --------------------------------------------------------------------------


def test_bindings_assigned_sequentially_in_candidate_order():
    candidates = [
        _candidate(topic_id="topico-a", source_ref="SRC-002"),
        _candidate(topic_id="topico-b", source_ref="SRC-001"),
    ]
    bindings = build_course_source_bindings(candidates)
    assert [b.course_source_ref for b in bindings] == ["COURSE-SRC-001", "COURSE-SRC-002"]
    # El orden de asignación sigue EXACTAMENTE el orden de entrada (ya
    # rankeado por el Bloque 1) -- nunca reordena por topic_id/source_ref.
    assert bindings[0].topic_id == "topico-a"
    assert bindings[0].original_source_ref == "SRC-002"
    assert bindings[1].topic_id == "topico-b"
    assert bindings[1].original_source_ref == "SRC-001"


def test_bindings_never_collide_even_with_same_original_source_ref():
    # Dos tópicos distintos casi siempre comparten "SRC-001" (ver
    # docstring del módulo) -- el namespace COURSE-SRC-XXX los distingue
    # sin ambigüedad.
    candidates = [
        _candidate(topic_id="topico-a", source_ref="SRC-001"),
        _candidate(topic_id="topico-b", source_ref="SRC-001"),
    ]
    bindings = build_course_source_bindings(candidates)
    refs = [b.course_source_ref for b in bindings]
    assert len(refs) == len(set(refs))  # sin colisiones
    assert bindings[0].topic_id != bindings[1].topic_id


def test_bindings_empty_candidates_produce_empty_list():
    assert build_course_source_bindings([]) == []


def test_bindings_preserve_all_provenance_metadata():
    candidate = _candidate(
        topic_id="topico-a",
        module_id="modulo-x",
        module_title="Módulo X",
        topic_title="Tópico X",
        heading_path=["Sección 1", "Subsección A"],
        markdown="Texto literal del bloque original.",
    )
    binding = build_course_source_bindings([candidate])[0]
    assert binding.course_id == "curso-demo"
    assert binding.module_id == "modulo-x"
    assert binding.module_title == "Módulo X"
    assert binding.topic_id == "topico-a"
    assert binding.topic_title == "Tópico X"
    assert binding.heading_path == ["Sección 1", "Subsección A"]
    assert binding.content == "Texto literal del bloque original."


# --------------------------------------------------------------------------
# build_course_evidence_packet: texto determinístico enviado al LLM
# --------------------------------------------------------------------------


def test_packet_empty_when_no_bindings():
    assert build_course_evidence_packet([]) == ""


def test_packet_contains_delimiters_and_ref_labels():
    bindings = build_course_source_bindings(
        [_candidate(topic_id="topico-a", source_ref="SRC-003")]
    )
    packet = build_course_evidence_packet(bindings)
    assert packet.startswith("=== COURSE EVIDENCE")
    assert packet.rstrip().endswith("=== END COURSE EVIDENCE ===")
    assert "[COURSE-SRC-001]" in packet
    # El source_ref ORIGINAL se preserva como metadata, pero nunca
    # reemplaza al identificador COURSE-SRC-XXX que el LLM debe citar.
    assert "original_source_ref: SRC-003" in packet


def test_packet_never_reformulates_markdown_content():
    literal = "Texto EXACTO, con Mayúsculas y puntuación: ¿listo?"
    bindings = build_course_source_bindings(
        [_candidate(topic_id="topico-a", markdown=literal)]
    )
    packet = build_course_evidence_packet(bindings)
    assert literal in packet


def test_packet_preserves_heading_path():
    bindings = build_course_source_bindings(
        [_candidate(topic_id="topico-a", heading_path=["Arquitectura", "Componentes"])]
    )
    packet = build_course_evidence_packet(bindings)
    assert "Arquitectura > Componentes" in packet


def test_packet_shows_placeholder_when_heading_path_empty():
    bindings = build_course_source_bindings([_candidate(topic_id="topico-a", heading_path=[])])
    packet = build_course_evidence_packet(bindings)
    assert "(sin heading)" in packet


def test_packet_includes_module_and_topic_titles():
    bindings = build_course_source_bindings(
        [_candidate(topic_id="topico-a", module_title="Módulo Avanzado", topic_title="Tema X")]
    )
    packet = build_course_evidence_packet(bindings)
    assert "module: Módulo Avanzado" in packet
    assert "topic: Tema X" in packet


def test_packet_deterministic_for_same_input():
    candidates = [
        _candidate(topic_id="topico-a", source_ref="SRC-001"),
        _candidate(topic_id="topico-b", source_ref="SRC-002"),
    ]
    bindings1 = build_course_source_bindings(candidates)
    bindings2 = build_course_source_bindings(candidates)
    assert build_course_evidence_packet(bindings1) == build_course_evidence_packet(bindings2)


# --------------------------------------------------------------------------
# validate_course_source_refs: rechazo de refs inexistentes / cruzadas
# --------------------------------------------------------------------------


def test_validate_accepts_refs_that_exist_in_bindings():
    bindings = build_course_source_bindings([_candidate(topic_id="topico-a")])
    assert validate_course_source_refs(["COURSE-SRC-001"], bindings) == []


def test_validate_rejects_nonexistent_course_src_ref():
    bindings = build_course_source_bindings([_candidate(topic_id="topico-a")])
    invalid = validate_course_source_refs(["COURSE-SRC-999"], bindings)
    assert invalid == ["COURSE-SRC-999"]


def test_validate_rejects_current_topic_src_ref_cross_namespace():
    # Un SRC-XXX (namespace del tópico actual) nunca es válido como
    # course_source_ref, aunque "parezca" razonable -- namespaces
    # distintos, nunca intercambiables.
    bindings = build_course_source_bindings([_candidate(topic_id="topico-a")])
    invalid = validate_course_source_refs(["SRC-001"], bindings)
    assert invalid == ["SRC-001"]


def test_validate_empty_bindings_rejects_everything():
    invalid = validate_course_source_refs(["COURSE-SRC-001"], [])
    assert invalid == ["COURSE-SRC-001"]


def test_validate_empty_refs_returns_empty():
    bindings = build_course_source_bindings([_candidate(topic_id="topico-a")])
    assert validate_course_source_refs([], bindings) == []


def test_validate_partial_invalid_returns_only_invalid_subset():
    bindings = build_course_source_bindings(
        [_candidate(topic_id="topico-a"), _candidate(topic_id="topico-b")]
    )
    invalid = validate_course_source_refs(
        ["COURSE-SRC-001", "COURSE-SRC-999", "COURSE-SRC-002"], bindings
    )
    assert invalid == ["COURSE-SRC-999"]
