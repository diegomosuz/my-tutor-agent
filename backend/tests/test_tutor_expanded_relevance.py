"""Tests del SEGUNDO gap-closure de v1.3.0 BLOQUE 6 (el primer gap-closure,
`tutor-v3.2.1`, agregó un campo de texto libre `relevance_reasoning` antes
de `response_type` -- QA real mostró que el propio texto podía "razonar
bien" y aun así terminar en un `response_type` inconsistente en el mismo
objeto, porque el texto libre no se valida estructuralmente).

`tutor-v3.3` reemplaza `relevance_reasoning` por dos ENUMs cerrados,
`scope_relation` y `topic_coverage`, en ese orden, ANTES de
`response_type` -- una CLASIFICACIÓN estructurada, nunca una explicación.
Esto permite validar determinísticamente (sin ningún validador semántico)
que la clasificación sea consistente con la forma real de la respuesta.

Dos categorías de test:

1. Aserciones de CONTENIDO del prompt (`test_prompt_*`): confirman que el
   texto real que recibe el LLM describe la nueva filosofía y los campos
   nuevos. No prueban el comportamiento del modelo real (eso lo hace la QA
   manual documentada en docs/CLASSROOM_UX_V1_3.md).
2. Escenarios con FakeLLMProvider + tests de invariantes de
   `ExpandedTutorReplyBody` (PARTE 24 de la spec): confirman que el
   contrato (scope_relation/topic_coverage -> response_type/chunks) se
   valida determinísticamente, incluidas las contradicciones que deben
   rechazarse -- nunca prueban juicio semántico real (imposible con un
   fake).
"""
from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.models.tutor import ExpandedTutorReplyBody
from app.prompts.tutor import TUTOR_SYSTEM_PROMPT, _build_system_prompt

from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN
from .tutor_fixtures import (
    valid_answer_reply_dict,
    valid_general_related_reply_dict,
    valid_not_covered_reply_dict,
    valid_topic_plus_general_reply_dict,
    valid_unrelated_reply_dict,
)

from app.services import tutor_service


def _make_content_dir(tmp_path: Path, markdown: str = SAMPLE_TOPIC_MARKDOWN) -> Path:
    content_dir = tmp_path / "content"
    module = content_dir / "curso-demo" / "modulo-demo"
    module.mkdir(parents=True)
    (module / "topico-demo.md").write_text(markdown, encoding="utf-8")
    return content_dir


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        content_dir=str(_make_content_dir(tmp_path)), lesson_cache_dir=str(tmp_path / "cache")
    )


def _ask(settings, provider, message="¿Qué es Kubernetes?", allow_general_knowledge=True):
    return tutor_service.ask_tutor(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        message=message,
        scene_id=None,
        recent_history=[],
        allow_general_knowledge=allow_general_knowledge,
        provider=provider,
    )


# --------------------------------------------------------------------------
# Aserciones de contenido del prompt
# --------------------------------------------------------------------------


def test_prompt_relevance_gate_is_permissive_presumption():
    p = _build_system_prompt(True)
    assert "PRESUNCIÓN MODERADAMENTE PERMISIVA" in p
    assert "descartarla solo cuando sea CLARAMENTE ajena" in p


def test_prompt_course_scope_is_not_a_whitelist():
    p = _build_system_prompt(True)
    assert "NUNCA UNA LISTA CERRADA" in p
    assert "NO lo convierte, por sí solo, en" in p


def test_prompt_lists_adjacent_foundational_ecosystem_categories():
    p = _build_system_prompt(True)
    assert "conocimiento fundacional del dominio" in p
    assert "conceptos adyacentes" in p
    assert "ecosistema técnico" in p


def test_prompt_ambiguous_short_terms_interpreted_in_course_context():
    p = _build_system_prompt(True)
    assert "TÉRMINOS CORTOS O AMBIGUOS" in p
    assert "PREFERÍ la interpretación técnica plausible" in p


def test_prompt_weak_topical_relation_insufficient_for_answer_chunks():
    p = _build_system_prompt(True)
    assert "AUTOCHEQUEO" in p
    assert "aparentar" in p


def test_prompt_describes_scope_relation_and_topic_coverage_as_classification():
    # v1.3.0 (segundo gap-closure): el prompt debe describir los dos
    # campos nuevos EXPLÍCITAMENTE como clasificación cerrada, nunca como
    # explicación/razonamiento libre.
    p = _build_system_prompt(True)
    assert '"scope_relation"' in p
    assert '"topic_coverage"' in p
    assert "current_topic" in p
    assert "course_domain" in p
    assert "sufficient" in p and "partial" in p and "insufficient" in p
    assert "CLASIFICACIÓN" in p
    assert "nunca son explicación" in p or "nunca explicación" in p


def test_prompt_never_asks_for_chain_of_thought_or_long_reasoning():
    # PARTE 3 de la spec: "No agregar reasoning largo. No pedir
    # chain-of-thought." -- confirma que el campo de razonamiento libre
    # del primer gap-closure ya no existe en el prompt.
    p = _build_system_prompt(True)
    assert "relevance_reasoning" not in p
    assert "razonamiento interno" not in p.lower()


def test_prompt_strict_mode_unaffected_by_gap_closure_wording():
    strict = _build_system_prompt(False)
    assert strict == TUTOR_SYSTEM_PROMPT
    assert "PRESUNCIÓN MODERADAMENTE PERMISIVA" not in strict
    assert "COURSE DOMAIN" not in strict
    assert "scope_relation" not in strict


# --------------------------------------------------------------------------
# ExpandedTutorReplyBody: forma/orden de campos y descarte del contrato
# público
# --------------------------------------------------------------------------


def test_expanded_reply_body_field_order_scope_then_coverage_then_response_type():
    fields = list(ExpandedTutorReplyBody.model_fields.keys())
    assert fields[0] == "scope_relation"
    assert fields[1] == "topic_coverage"
    assert fields[2] == "response_type"


def test_expanded_reply_body_requires_scope_relation_and_topic_coverage():
    good = valid_general_related_reply_dict()
    body = ExpandedTutorReplyBody.model_validate(good)
    assert body.scope_relation.value == "current_topic"
    assert body.topic_coverage.value == "insufficient"

    for missing_field in ("scope_relation", "topic_coverage"):
        bad = valid_general_related_reply_dict()
        bad.pop(missing_field)
        with pytest.raises(ValidationError):
            ExpandedTutorReplyBody.model_validate(bad)


def test_scope_relation_and_topic_coverage_never_leak_to_public_reply_body(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_general_related_reply_dict()])
    reply = _ask(settings, provider)
    assert not hasattr(reply, "scope_relation")
    assert not hasattr(reply, "topic_coverage")
    dumped = reply.model_dump()
    assert "scope_relation" not in dumped
    assert "topic_coverage" not in dumped


# --------------------------------------------------------------------------
# Invariantes estructurales scope_relation/topic_coverage <-> response_type
# (PARTE 8/12/21 de la spec) -- nunca semantic validator, solo consistencia
# entre campos que el propio LLM ya declaró.
# --------------------------------------------------------------------------


def test_invariant_unrelated_scope_requires_unrelated_response_type():
    bad = valid_unrelated_reply_dict()
    bad["response_type"] = "answer"
    bad["answer_chunks"] = []
    bad["general_knowledge_chunks"] = ["algo"]
    bad["general_knowledge_used"] = True
    with pytest.raises(ValidationError):
        ExpandedTutorReplyBody.model_validate(bad)


def test_invariant_current_topic_or_course_domain_requires_answer_response_type():
    for scope in ("current_topic", "course_domain"):
        bad = valid_general_related_reply_dict(scope_relation=scope)
        bad["response_type"] = "not_covered"
        with pytest.raises(ValidationError):
            ExpandedTutorReplyBody.model_validate(bad)


def test_invariant_sufficient_coverage_forbids_general_knowledge():
    bad = valid_answer_reply_dict()  # scope=current_topic, coverage=sufficient
    bad["general_knowledge_chunks"] = ["esto no debería estar acá"]
    bad["general_knowledge_used"] = True
    with pytest.raises(ValidationError):
        ExpandedTutorReplyBody.model_validate(bad)


def test_invariant_sufficient_coverage_requires_at_least_one_answer_chunk():
    bad = valid_answer_reply_dict()
    bad["answer_chunks"] = []
    with pytest.raises(ValidationError):
        ExpandedTutorReplyBody.model_validate(bad)


def test_invariant_insufficient_coverage_forbids_answer_chunks_weak_attribution_regression():
    # PARTE 21 de la spec, caso equivalente al hallazgo real de QA: un
    # SourceBlock menciona tangencialmente el concepto, la pregunta pide
    # una definición, y el provider devuelve una respuesta "grounded"
    # citando esa mención débil -- si el propio modelo ya declaró
    # topic_coverage="insufficient", esa combinación es estructuralmente
    # inválida, sin necesitar ningún validador semántico.
    bad = valid_general_related_reply_dict()  # topic_coverage=insufficient
    bad["answer_chunks"] = [
        {
            "text": "El material menciona el ecosistema de herramientas relacionado.",
            "source_refs": ["SRC-002"],
        }
    ]
    with pytest.raises(ValidationError):
        ExpandedTutorReplyBody.model_validate(bad)


def test_invariant_partial_coverage_allows_both_answer_and_general_chunks():
    ok = valid_topic_plus_general_reply_dict(["SRC-002"])  # topic_coverage=partial
    body = ExpandedTutorReplyBody.model_validate(ok)
    assert body.answer_chunks
    assert body.general_knowledge_chunks


def test_invariant_clarification_response_type_skips_scope_coverage_cross_check():
    # REGLA 18 (clarification) es una salida ortogonal -- cualquier valor
    # cerrado de scope_relation/topic_coverage es válido junto a ella.
    from .tutor_fixtures import valid_clarification_reply_dict

    body = ExpandedTutorReplyBody.model_validate(valid_clarification_reply_dict())
    assert body.response_type.value == "clarification"


# --------------------------------------------------------------------------
# Matriz completa con FakeLLMProvider (PARTE 24 de la spec)
# --------------------------------------------------------------------------


def test_expanded_current_topic_sufficient(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
    reply = _ask(settings, provider)
    assert reply.response_type.value == "answer"
    assert reply.general_knowledge_used is False


def test_expanded_current_topic_partial(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_topic_plus_general_reply_dict(["SRC-002"])])
    reply = _ask(settings, provider)
    assert reply.response_type.value == "answer"
    assert reply.answer_chunks
    assert reply.general_knowledge_chunks


def test_expanded_current_topic_insufficient(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_general_related_reply_dict("current_topic")])
    reply = _ask(settings, provider)
    assert reply.response_type.value == "answer"
    assert reply.answer_chunks == []
    assert reply.general_knowledge_chunks


def test_expanded_course_domain_insufficient(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_general_related_reply_dict("course_domain")])
    reply = _ask(settings, provider, message="¿Qué es un agente de IA?")
    assert reply.response_type.value == "answer"
    assert reply.answer_chunks == []
    assert reply.general_knowledge_chunks


def test_expanded_unrelated(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_unrelated_reply_dict()])
    reply = _ask(settings, provider, message="¿Cuál es la mejor receta de asado?")
    assert reply.response_type.value == "unrelated"


def test_strict_current_topic_sufficient(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
    reply = _ask(settings, provider, allow_general_knowledge=False)
    assert reply.response_type.value == "answer"


def test_strict_current_topic_insufficient(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_not_covered_reply_dict()])
    reply = _ask(settings, provider, allow_general_knowledge=False)
    assert reply.response_type.value == "not_covered"


def test_strict_course_domain_also_not_covered(tmp_path):
    # En modo estricto no existe distinción course_domain vs
    # current_topic -- cualquier pregunta no cubierta por AUTHORIZED
    # SOURCE es "not_covered", sin importar a qué dominio pertenezca
    # (TutorReplyBody no tiene scope_relation en absoluto).
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_not_covered_reply_dict()])
    reply = _ask(
        settings, provider, message="¿Qué es un agente de IA?", allow_general_knowledge=False
    )
    assert reply.response_type.value == "not_covered"


def test_strict_unrelated_rejected_defense_in_depth(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(
        responses=[valid_unrelated_reply_dict(), valid_not_covered_reply_dict()]
    )
    reply = _ask(
        settings, provider, message="¿Cuál es la mejor receta de asado?",
        allow_general_knowledge=False,
    )
    assert len(provider.calls) == 2  # el primer intento (unrelated) se rechazó
    assert reply.response_type.value == "not_covered"
