"""Tests del gap-closure de v1.3.0 BLOQUE 6 (relevance gate del modo
ampliado demasiado estricto -- "¿Qué es una skill?" devolvía "unrelated"
pese a que el curso trataba justamente ese dominio).

Dos categorías de test:

1. Aserciones de CONTENIDO del prompt (`test_prompt_*`): confirman que las
   frases clave de la nueva filosofía del relevance gate (presunción
   permisiva, CourseScope no es whitelist, términos ambiguos, guardia de
   atribución débil) están presentes en el texto real que recibe el LLM.
   No prueban el comportamiento del modelo real (eso lo hace la QA manual
   documentada en docs/CLASSROOM_UX_V1_3.md) -- prueban que el texto que
   se le envía dice lo que se supone que debe decir.
2. Escenarios con FakeLLMProvider (PARTE 16 A-F): confirman que el
   contrato (`ExpandedTutorReplyBody` -> `TutorReplyBody`, validación de
   forma, `relevance_reasoning` nunca expuesto) sigue funcionando
   correctamente con las formas de respuesta que ahora exige la nueva
   filosofía -- no prueban juicio semántico real (imposible con un fake).
"""
from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.models.tutor import ExpandedTutorReplyBody
from app.prompts.tutor import TUTOR_SYSTEM_PROMPT, _build_system_prompt

from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN
from .tutor_fixtures import (
    valid_answer_reply_dict,
    valid_general_related_reply_dict,
    valid_not_covered_reply_dict,
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
# PARTE 15 — aserciones de contenido del prompt
# --------------------------------------------------------------------------


def test_prompt_relevance_gate_is_permissive_presumption():
    p = _build_system_prompt(True)
    assert "PRESUNCIÓN MODERADAMENTE PERMISIVA" in p
    assert "descartarla solo cuando sea CLARAMENTE ajena" in p


def test_prompt_course_scope_is_not_a_whitelist():
    p = _build_system_prompt(True)
    assert "NUNCA UNA LISTA CERRADA" in p
    assert "NO lo convierte, por sí solo, en" in p or "NO es una lista exhaustiva" in p.upper()


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
    assert "aparentar grounding" in p


def test_prompt_relevance_coverage_independence_warning_present():
    p = _build_system_prompt(True)
    assert "RELEVANCE y COVERAGE son ejes INDEPENDIENTES" in p
    assert "NUNCA es, por sí solo, un motivo válido para" in p


def test_prompt_strict_mode_unaffected_by_gap_closure_wording():
    # El modo estricto (sin allow_general_knowledge) nunca incluye REGLA
    # 20/21/22 ni ninguna de las frases nuevas -- solo REGLA 7 gana una
    # oración de autochequeo (aplica a ambos modos, ver REGLA 7 de
    # TUTOR_SYSTEM_PROMPT), el resto de las reglas nuevas son exclusivas
    # del modo ampliado.
    strict = _build_system_prompt(False)
    assert strict == TUTOR_SYSTEM_PROMPT
    assert "PRESUNCIÓN MODERADAMENTE PERMISIVA" not in strict
    assert "COURSE DOMAIN" not in strict


# --------------------------------------------------------------------------
# PARTE 16 — escenarios con FakeLLMProvider A-F
# --------------------------------------------------------------------------


def test_A_expanded_adjacent_course_concept_produces_answer(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_general_related_reply_dict()])
    reply = _ask(settings, provider, message="¿Qué es un agente de IA?")
    assert reply.response_type.value == "answer"
    assert reply.general_knowledge_used is True


def test_B_expanded_ambiguous_technical_term_produces_answer(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_general_related_reply_dict()])
    reply = _ask(settings, provider, message="¿Qué es una skill?")
    assert reply.response_type.value == "answer"
    assert reply.general_knowledge_used is True


def test_C_expanded_clearly_unrelated_produces_unrelated(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_unrelated_reply_dict()])
    reply = _ask(settings, provider, message="¿Cuál es la mejor receta de asado?")
    assert reply.response_type.value == "unrelated"
    assert reply.answer_chunks == []
    assert reply.general_knowledge_chunks == []


def test_D_strict_same_adjacent_concept_produces_not_covered(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_not_covered_reply_dict()])
    reply = _ask(
        settings, provider, message="¿Qué es un agente de IA?", allow_general_knowledge=False
    )
    assert reply.response_type.value == "not_covered"
    assert reply.general_knowledge_used is False


def test_E_general_knowledge_only_has_empty_answer_chunks(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_general_related_reply_dict()])
    reply = _ask(settings, provider)
    assert reply.answer_chunks == []
    assert len(reply.general_knowledge_chunks) >= 1


def test_F_general_knowledge_chunks_never_carry_source_refs(tmp_path):
    # Estructural: general_knowledge_chunks es list[str], no tiene ningún
    # concepto de source_refs -- no hay nada que verificar en runtime
    # porque es estructuralmente imposible, pero el test deja explícito el
    # invariante para este gap-closure (PARTE 16 F).
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_general_related_reply_dict()])
    reply = _ask(settings, provider)
    assert all(isinstance(chunk, str) for chunk in reply.general_knowledge_chunks)


# --------------------------------------------------------------------------
# ExpandedTutorReplyBody: relevance_reasoning nunca cruza al contrato
# público (PARTE 12, causa raíz del fix de field-ordering).
# --------------------------------------------------------------------------


def test_expanded_reply_body_requires_relevance_reasoning_field():
    good = valid_general_related_reply_dict()
    good["relevance_reasoning"] = "Pertenece al tema (categoría a)."
    body = ExpandedTutorReplyBody.model_validate(good)
    assert body.relevance_reasoning

    bad = valid_general_related_reply_dict()
    bad.pop("relevance_reasoning", None)
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ExpandedTutorReplyBody.model_validate(bad)


def test_relevance_reasoning_never_leaks_to_public_reply_body(tmp_path):
    settings = _settings(tmp_path)
    dict_with_reasoning = valid_general_related_reply_dict()
    dict_with_reasoning["relevance_reasoning"] = (
        "Texto interno que nunca debería llegar al alumno ni a la API."
    )
    provider = FakeLLMProvider(responses=[dict_with_reasoning])
    reply = _ask(settings, provider)
    assert not hasattr(reply, "relevance_reasoning")
    assert "relevance_reasoning" not in reply.model_dump()


def test_relevance_reasoning_field_is_first_in_expanded_schema():
    # El orden de campos en el JSON Schema (y por lo tanto en la
    # generación real de OpenAI Structured Outputs) es la causa raíz del
    # fix: el modelo debe escribir su razonamiento ANTES de comprometerse
    # con response_type.
    fields = list(ExpandedTutorReplyBody.model_fields.keys())
    assert fields[0] == "relevance_reasoning"
    assert fields[1] == "response_type"
