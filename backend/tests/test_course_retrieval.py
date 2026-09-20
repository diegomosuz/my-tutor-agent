"""Tests de `app/services/course_retrieval.py` (v1.4.0, Bloque 1:
"COURSE-WIDE RETRIEVAL FOUNDATION").

Tres categorías:

1. Tokenización/normalización (`tokenize`/`normalize_text`) -- PARTE 21.
2. Ranking, sobre un corpus sintético pequeño y controlado (`tmp_path`,
   mismo patrón que el resto de la suite) -- PARTE 22.
3. Calidad de evidencia: los candidatos preservan identidad y contenido
   exacto del `SourceBlock` original, nunca lo mutan -- PARTE 23.

Ningún test hace una llamada real a un LLM (este servicio no usa ningún
LLM en absoluto). El corpus real (`spec-driven-design-expert`) se ejerce
en QA manual documentada en `docs/COURSE_GROUNDED_TUTOR_V1_4.md`, no acá.
"""
from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.services import course_retrieval


# --------------------------------------------------------------------------
# PARTE 21 — tokenización / normalización
# --------------------------------------------------------------------------


def test_tokenize_lowercases():
    assert course_retrieval.tokenize("CONSTITUTION Guardrails") == ["constitution", "guardrails"]


def test_tokenize_strips_accents_consistently():
    assert course_retrieval.tokenize("Constitución") == course_retrieval.tokenize("Constitucion")


def test_tokenize_separates_punctuation():
    assert course_retrieval.tokenize("¿Qué es TDD/BDD?") == ["tdd", "bdd"]


def test_tokenize_spanish_stopwords_removed():
    tokens = course_retrieval.tokenize("la constitucion y las reglas de el equipo")
    assert "la" not in tokens
    assert "y" not in tokens
    assert "las" not in tokens
    assert "de" not in tokens
    assert "el" not in tokens
    assert "constitucion" in tokens
    assert "reglas" in tokens
    assert "equipo" in tokens


def test_tokenize_preserves_technical_terms():
    tokens = course_retrieval.tokenize(
        "LLM API TDD BDD OpenAPI spec-driven specification Claude GitHub JSON Python"
    )
    for term in ("llm", "api", "tdd", "bdd", "openapi", "specification", "claude", "github", "json", "python"):
        assert term in tokens, f"{term!r} missing from {tokens}"
    # El término compuesto se indexa completo Y en sus partes.
    assert "spec-driven" in tokens
    assert "spec" in tokens
    assert "driven" in tokens


def test_tokenize_empty_query():
    assert course_retrieval.tokenize("") == []
    assert course_retrieval.tokenize("   ") == []


def test_tokenize_multiple_spaces():
    assert course_retrieval.tokenize("constitution     guardrails") == ["constitution", "guardrails"]


def test_tokenize_deterministic():
    text = "¿Qué es Contract-Driven Development?"
    assert course_retrieval.tokenize(text) == course_retrieval.tokenize(text)


# --------------------------------------------------------------------------
# PARTE 22/23 — ranking + calidad de evidencia, sobre corpus sintético
# --------------------------------------------------------------------------

_TOPIC_A = """---
title: Constitution y Guardrails No Negociables
order: 1
---
# Constitution y Guardrails No Negociables

El equipo define reglas persistentes y limites explicitos para cada decision tecnica importante.
"""

_TOPIC_B = """---
title: Introduccion General del Curso
order: 2
---
# Introduccion General del Curso

## Sobre la Constitution del Proyecto

Este bloque describe reglas persistentes que el equipo aplica siempre.
"""

_TOPIC_C = """---
title: Tema Ajeno Sin Relacion
order: 1
---
# Tema Ajeno Sin Relacion

La constitution del proyecto se revisa constantemente. La constitution define principios y limites. Nada reemplaza la constitution como fuente de verdad.
"""

_TOPIC_D = """---
title: Tema Completamente Distinto
order: 2
---
# Tema Completamente Distinto

## Otro Encabezado

Contenido totalmente ajeno sobre gestion de tareas y planificacion semanal sin ninguna relacion tematica.
"""


def _make_synthetic_course(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    course_dir = content_dir / "curso-test"

    mod_alpha = course_dir / "01-modulo-alpha"
    mod_alpha.mkdir(parents=True)
    (mod_alpha / "01-topico-a.md").write_text(_TOPIC_A, encoding="utf-8")
    (mod_alpha / "02-topico-b.md").write_text(_TOPIC_B, encoding="utf-8")

    mod_beta = course_dir / "02-modulo-beta"
    mod_beta.mkdir(parents=True)
    (mod_beta / "01-topico-c.md").write_text(_TOPIC_C, encoding="utf-8")
    (mod_beta / "02-topico-d.md").write_text(_TOPIC_D, encoding="utf-8")

    return content_dir


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        content_dir=str(_make_synthetic_course(tmp_path)), lesson_cache_dir=str(tmp_path / "cache")
    )


def test_A_topic_title_match_ranks_highest(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(settings, "curso-test", "constitution")
    assert results, "esperaba al menos un resultado"
    assert results[0].topic_id == "topico-a"  # match en topic_title


def test_B_heading_path_match_ranks_above_incidental_body(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(settings, "curso-test", "constitution")
    topics_in_order = [r.topic_id for r in results]
    # topico-b (heading match) debe rankear antes que topico-c (solo body).
    assert topics_in_order.index("topico-b") < topics_in_order.index("topico-c")


def test_C_strong_body_match_still_recoverable(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(settings, "curso-test", "constitution")
    assert "topico-c" in [r.topic_id for r in results]


def test_D_no_significant_overlap_returns_empty(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(settings, "curso-test", "receta de cocina italiana")
    assert results == []


def test_E_top_k_respected(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(
        settings, "curso-test", "constitution reglas", top_k=2, max_per_topic=None
    )
    assert len(results) <= 2


def test_F_exclude_topic_id_respected(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(
        settings, "curso-test", "constitution", exclude_topic_id="topico-a"
    )
    assert "topico-a" not in [r.topic_id for r in results]
    assert results  # el resto del curso sigue teniendo evidencia


def test_G_deterministic_order_and_scores(tmp_path):
    settings = _settings(tmp_path)
    first = course_retrieval.search_course(settings, "curso-test", "constitution reglas")
    second = course_retrieval.search_course(settings, "curso-test", "constitution reglas")
    assert [(r.topic_id, r.source_ref, r.score) for r in first] == [
        (r.topic_id, r.source_ref, r.score) for r in second
    ]


def test_H_source_ref_identity_does_not_collide_across_topics(tmp_path):
    settings = _settings(tmp_path)
    # Query de un solo término a propósito: topico-c solo contiene
    # "constitution" en su cuerpo (no "reglas"), así que una query de 2+
    # términos lo filtraría por cobertura mínima (ver
    # test_multi_term_query_requires_minimum_coverage) -- acá el objetivo
    # es aislar la identidad de source_ref, no la cobertura.
    results = course_retrieval.search_course(
        settings, "curso-test", "constitution", max_per_topic=None
    )
    # topico-a y topico-c comparten literalmente el mismo source_ref
    # (SRC-002, por construcción del corpus sintético) -- deben aparecer
    # como candidatos DISTINTOS, identificados por topic_id, nunca
    # colapsados en uno solo.
    src_002_candidates = [r for r in results if r.source_ref == "SRC-002"]
    topic_ids = {r.topic_id for r in src_002_candidates}
    assert "topico-a" in topic_ids
    assert "topico-c" in topic_ids
    assert len(src_002_candidates) >= 2


def test_top_k_clamped_to_max(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(
        settings, "curso-test", "constitution reglas", top_k=999, max_per_topic=None
    )
    assert len(results) <= course_retrieval.MAX_TOP_K


def test_diversity_limits_candidates_per_topic(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(
        settings, "curso-test", "constitution reglas", top_k=10, max_per_topic=1
    )
    counts: dict[str, int] = {}
    for r in results:
        counts[r.topic_id] = counts.get(r.topic_id, 0) + 1
    assert all(count <= 1 for count in counts.values())


def test_multi_term_query_requires_minimum_coverage(tmp_path):
    # PARTE 28 (negative QA): una query de 2+ términos donde un bloque
    # solo matchea 1 término no debe considerarse evidencia significativa
    # -- reproduce el hallazgo real de QA (una palabra genérica coincide
    # de casualidad, el resto de la query no tiene overlap).
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(settings, "curso-test", "constitution xyz-inexistente-123")
    # "xyz-inexistente-123" no existe en el corpus -> ningún bloque puede
    # matchear 2 términos -> [] (no basta con matchear "constitution" solo).
    assert results == []


# --------------------------------------------------------------------------
# PARTE 23 — calidad de evidencia: identidad y contenido preservados
# --------------------------------------------------------------------------


def test_candidate_preserves_full_identity_and_exact_content(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(settings, "curso-test", "constitution")
    top = results[0]
    assert top.course_id == "curso-test"
    assert top.module_id == "modulo-alpha"
    assert top.module_title == "Modulo Alpha"
    assert top.topic_id == "topico-a"
    assert top.topic_title == "Constitution y Guardrails No Negociables"
    assert top.source_ref.startswith("SRC-")
    assert top.block_type == "paragraph"
    assert top.start_line >= 1
    assert top.end_line >= top.start_line
    assert "reglas persistentes" in top.markdown
    assert "reglas persistentes" in top.plain_text


def test_candidate_never_mutates_source_block_text(tmp_path):
    settings = _settings(tmp_path)
    results = course_retrieval.search_course(settings, "curso-test", "constitution")
    top = results[0]
    # El markdown devuelto debe ser exactamente el texto fuente original,
    # nunca reformulado/resumido/truncado.
    assert top.markdown.strip() == (
        "El equipo define reglas persistentes y limites explicitos "
        "para cada decision tecnica importante."
    )
