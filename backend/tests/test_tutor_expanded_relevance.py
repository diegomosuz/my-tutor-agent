"""Tests del SEGUNDO gap-closure de v1.3.0 BLOQUE 6 (el primer gap-closure,
`tutor-v3.2.1`, agregó un campo de texto libre `relevance_reasoning` antes
de `response_type` -- QA real mostró que el propio texto podía "razonar
bien" y aun así terminar en un `response_type` inconsistente en el mismo
objeto, porque el texto libre no se valida estructuralmente), extendido en
v1.4.0 (Bloque 2, "COURSE-GROUNDED TUTOR + CROSS-TOPIC PROVENANCE").

`tutor-v3.3` reemplazó `relevance_reasoning` por dos ENUMs cerrados,
`scope_relation` y `topic_coverage`, en ese orden, ANTES de
`response_type` -- una CLASIFICACIÓN estructurada, nunca una explicación.
`tutor-v4` (Bloque 2) agrega un TERCER eje, `course_coverage`, y --
cambio estructural clave -- deja de ser exclusivo del modo ampliado:
`scope_relation`/`topic_coverage`/`course_coverage` se clasifican en TODA
consulta, en ambos modos, porque `course_coverage` decide si corresponde
usar evidencia de otros tópicos del curso incluso en modo estricto (ver
`app/models/tutor.py::StructuredTutorReplyBody`, que reemplaza a los dos
modelos separados `TutorReplyBody`/`ExpandedTutorReplyBody` de v1.3.0).

Consecuencia para estos tests: el mapeo `scope_relation="unrelated"` ->
`response_type` (mode-aware: "not_covered" en modo estricto, "unrelated"
en modo ampliado) YA NO se valida a nivel Pydantic -- se movió
deliberadamente a `tutor_service._validate` (que sí conoce el modo, algo
que un validador de modelo no puede saber por diseño, ver el docstring de
`_validate_course_grounded_shape`). Los invariantes que SÍ siguen siendo
mode-independientes (coverage-vs-chunks-vacíos, clarification ortogonal)
siguen viviendo en el modelo y se siguen probando acá a ese nivel.

Tres categorías de test:

1. Aserciones de CONTENIDO del prompt (`test_prompt_*`): confirman que el
   texto real que recibe el LLM describe la clasificación y los tres ejes.
   No prueban el comportamiento del modelo real (eso lo hace la QA manual
   documentada en docs/CLASSROOM_UX_V1_3.md / docs/COURSE_GROUNDED_TUTOR_V1_4.md).
2. Invariantes MODE-INDEPENDIENTES de `StructuredTutorReplyBody`
   (`_validate_course_grounded_shape`): confirman que la forma
   coverage-vs-chunks se valida determinísticamente a nivel Pydantic.
3. Escenarios con FakeLLMProvider + `tutor_service.ask_tutor`: confirman
   el comportamiento end-to-end, incluido el mapeo mode-aware
   scope_relation -> response_type que vive en `tutor_service._validate`.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.models.tutor import StructuredTutorReplyBody
from app.prompts.tutor import TUTOR_SYSTEM_PROMPT, _build_system_prompt
from app.services import tutor_service
from app.services.llm_retry import GenerationFailedError

from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN
from .tutor_fixtures import (
    valid_answer_reply_dict,
    valid_clarification_reply_dict,
    valid_general_related_reply_dict,
    valid_not_covered_reply_dict,
    valid_topic_plus_general_reply_dict,
    valid_unrelated_reply_dict,
)


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


def test_prompt_describes_scope_relation_and_coverage_axes_as_classification():
    # v1.4.0 (Bloque 2): el prompt debe describir los TRES campos
    # (scope_relation/topic_coverage/course_coverage) EXPLÍCITAMENTE como
    # clasificación cerrada, nunca como explicación/razonamiento libre.
    p = _build_system_prompt(True)
    assert '"scope_relation"' in p
    assert '"topic_coverage"' in p
    assert '"course_coverage"' in p
    assert "current_topic" in p
    assert "course_domain" in p
    assert "sufficient" in p and "partial" in p and "insufficient" in p
    assert "CLASIFICACIÓN" in p
    assert "nunca son explicación" in p or "nunca explicación" in p


def test_prompt_never_asks_for_chain_of_thought_or_long_reasoning():
    p = _build_system_prompt(True)
    assert "relevance_reasoning" not in p
    assert "razonamiento interno" not in p.lower()


def test_prompt_classification_axes_are_universal_since_v4():
    # v1.4.0 (Bloque 2), cambio estructural clave: a diferencia de v1.3.0
    # (donde scope_relation/topic_coverage solo existían en modo
    # ampliado), REGLA 20 -- y por lo tanto los tres ejes de clasificación
    # -- es parte del prompt BASE, presente en TODO modo. Lo único
    # exclusivo del modo ampliado es la posibilidad de usar conocimiento
    # general (REGLA 22/23).
    strict = _build_system_prompt(False)
    assert strict == TUTOR_SYSTEM_PROMPT
    assert "PRESUNCIÓN MODERADAMENTE PERMISIVA" in strict
    assert "COURSE DOMAIN" in strict
    assert '"scope_relation"' in strict
    assert '"course_coverage"' in strict
    # Lo que sigue siendo exclusivo del modo ampliado: el heading real de
    # REGLA 22/23 (conocimiento general), nunca presente en modo estricto.
    assert "REGLA 22 —" not in strict
    assert "REGLA 23 —" not in strict
    assert "MODO AMPLIADO: CONOCIMIENTO GENERAL" not in strict


def test_prompt_expanded_mode_adds_only_general_knowledge_rules():
    expanded = _build_system_prompt(True)
    strict = _build_system_prompt(False)
    assert expanded.startswith(strict)
    added = expanded[len(strict):]
    assert "REGLA 22" in added
    assert "REGLA 23" in added
    assert "MODO AMPLIADO: CONOCIMIENTO GENERAL" in added


# --------------------------------------------------------------------------
# StructuredTutorReplyBody: forma/orden de campos y descarte del contrato
# público
# --------------------------------------------------------------------------


def test_structured_reply_body_field_order_scope_then_coverages_then_response_type():
    fields = list(StructuredTutorReplyBody.model_fields.keys())
    assert fields[0] == "scope_relation"
    assert fields[1] == "topic_coverage"
    assert fields[2] == "course_coverage"
    assert fields[3] == "response_type"


def test_structured_reply_body_requires_all_three_classification_fields():
    good = valid_general_related_reply_dict()
    body = StructuredTutorReplyBody.model_validate(good)
    assert body.scope_relation.value == "current_topic"
    assert body.topic_coverage.value == "insufficient"
    assert body.course_coverage.value == "insufficient"

    for missing_field in ("scope_relation", "topic_coverage", "course_coverage"):
        bad = valid_general_related_reply_dict()
        bad.pop(missing_field)
        with pytest.raises(ValidationError):
            StructuredTutorReplyBody.model_validate(bad)


def test_scope_and_coverage_fields_never_leak_to_public_reply_body(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_general_related_reply_dict()])
    reply = _ask(settings, provider)
    assert not hasattr(reply, "scope_relation")
    assert not hasattr(reply, "topic_coverage")
    assert not hasattr(reply, "course_coverage")
    dumped = reply.model_dump()
    assert "scope_relation" not in dumped
    assert "topic_coverage" not in dumped
    assert "course_coverage" not in dumped


# --------------------------------------------------------------------------
# Invariantes MODE-INDEPENDIENTES (_validate_course_grounded_shape): solo
# consistencia entre coverage y chunks, nunca scope_relation<->response_type
# (eso es mode-aware, se prueba más abajo a nivel de servicio).
# --------------------------------------------------------------------------


def test_invariant_sufficient_coverage_forbids_general_knowledge():
    bad = valid_answer_reply_dict()  # topic_coverage=sufficient
    bad["general_knowledge_chunks"] = ["esto no debería estar acá"]
    bad["general_knowledge_used"] = True
    with pytest.raises(ValidationError):
        StructuredTutorReplyBody.model_validate(bad)


def test_invariant_sufficient_topic_coverage_requires_at_least_one_answer_chunk():
    bad = valid_answer_reply_dict()
    bad["answer_chunks"] = []
    with pytest.raises(ValidationError):
        StructuredTutorReplyBody.model_validate(bad)


def test_invariant_insufficient_topic_coverage_forbids_answer_chunks_weak_attribution_regression():
    # PARTE 21 de la spec original (v1.3.0), caso equivalente al hallazgo
    # real de QA: un SourceBlock menciona tangencialmente el concepto, la
    # pregunta pide una definición, y el provider devuelve una respuesta
    # "grounded" citando esa mención débil -- si el propio modelo ya
    # declaró topic_coverage="insufficient", esa combinación es
    # estructuralmente inválida, sin necesitar ningún validador semántico.
    bad = valid_general_related_reply_dict()  # topic_coverage=insufficient
    bad["answer_chunks"] = [
        {
            "text": "El material menciona el ecosistema de herramientas relacionado.",
            "source_refs": ["SRC-002"],
        }
    ]
    with pytest.raises(ValidationError):
        StructuredTutorReplyBody.model_validate(bad)


def test_invariant_insufficient_course_coverage_forbids_course_answer_chunks():
    # v1.4.0 (Bloque 2): mismo criterio que topic_coverage, para el
    # segundo canal grounded.
    bad = valid_general_related_reply_dict()  # course_coverage=insufficient
    bad["course_answer_chunks"] = [
        {"text": "Otro tópico menciona algo relacionado.", "source_refs": ["COURSE-SRC-001"]}
    ]
    with pytest.raises(ValidationError):
        StructuredTutorReplyBody.model_validate(bad)


def test_invariant_partial_topic_coverage_allows_both_answer_and_general_chunks():
    ok = valid_topic_plus_general_reply_dict(["SRC-002"])  # topic_coverage=partial
    body = StructuredTutorReplyBody.model_validate(ok)
    assert body.answer_chunks
    assert body.general_knowledge_chunks


def test_invariant_clarification_response_type_skips_scope_coverage_cross_check():
    # REGLA 18 (clarification) es una salida ortogonal -- cualquier valor
    # cerrado de scope_relation/topic_coverage/course_coverage es válido
    # junto a ella.
    body = StructuredTutorReplyBody.model_validate(valid_clarification_reply_dict())
    assert body.response_type.value == "clarification"


# --------------------------------------------------------------------------
# Matriz completa con FakeLLMProvider (comportamiento end-to-end, incluido
# el mapeo mode-aware scope_relation -> response_type de
# tutor_service._validate)
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


def test_strict_course_domain_also_not_covered_when_course_evidence_absent(tmp_path):
    # En modo estricto, sin evidencia real de otro tópico (course_coverage
    # insufficient, este curso de test solo tiene un tópico), una pregunta
    # de otro dominio sigue siendo "not_covered", sin importar a qué
    # dominio pertenezca -- el contrato público (TutorReplyBody) nunca
    # expone scope_relation en absoluto.
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


# --------------------------------------------------------------------------
# v1.4.0 (Bloque 2): mapeo mode-aware scope_relation -> response_type,
# aplicado en tutor_service._validate (ver su docstring para la matriz
# completa) -- ya no es un invariante Pydantic, así que se prueba acá vía
# FakeLLMProvider + ask_tutor.
# --------------------------------------------------------------------------


def test_strict_scope_unrelated_but_response_answer_is_rejected_and_retried(tmp_path):
    # Inconsistencia interna del modelo: dice que la pregunta es ajena al
    # curso (scope_relation="unrelated") pero igual arma una "answer" --
    # en modo estricto eso nunca es legal, se rechaza y se reintenta.
    settings = _settings(tmp_path)
    inconsistent = valid_unrelated_reply_dict()
    inconsistent["response_type"] = "answer"
    inconsistent["topic_coverage"] = "sufficient"
    inconsistent["answer_chunks"] = [
        {"text": "Kubernetes es un orquestador de contenedores.", "source_refs": ["SRC-002"]}
    ]
    provider = FakeLLMProvider(
        responses=[inconsistent, valid_not_covered_reply_dict()]
    )
    reply = _ask(settings, provider, allow_general_knowledge=False)
    assert len(provider.calls) == 2
    assert reply.response_type.value == "not_covered"


def test_expanded_scope_unrelated_but_response_answer_is_rejected_and_retried(tmp_path):
    # Mismo caso que arriba, pero en modo ampliado: la respuesta legal
    # para scope_relation="unrelated" es response_type="unrelated", nunca
    # "answer" con conocimiento general.
    settings = _settings(tmp_path)
    inconsistent = valid_general_related_reply_dict()
    inconsistent["scope_relation"] = "unrelated"
    provider = FakeLLMProvider(
        responses=[inconsistent, valid_unrelated_reply_dict()]
    )
    reply = _ask(settings, provider, allow_general_knowledge=True)
    assert len(provider.calls) == 2
    assert reply.response_type.value == "unrelated"


def test_expanded_scope_related_but_response_unrelated_is_rejected_and_retried(tmp_path):
    # Caso inverso: scope_relation dice que la pregunta SÍ pertenece al
    # tópico/curso, pero response_type="unrelated" -- también inconsistente.
    settings = _settings(tmp_path)
    inconsistent = valid_unrelated_reply_dict()
    inconsistent["scope_relation"] = "current_topic"
    provider = FakeLLMProvider(
        responses=[inconsistent, valid_general_related_reply_dict()]
    )
    reply = _ask(settings, provider, allow_general_knowledge=True)
    assert len(provider.calls) == 2
    assert reply.response_type.value == "answer"


def test_strict_scope_unrelated_persisting_raises_generation_failed(tmp_path):
    settings = _settings(tmp_path)
    inconsistent = valid_unrelated_reply_dict()
    inconsistent["response_type"] = "answer"
    inconsistent["topic_coverage"] = "sufficient"
    inconsistent["answer_chunks"] = [
        {"text": "Kubernetes es un orquestador de contenedores.", "source_refs": ["SRC-002"]}
    ]
    provider = FakeLLMProvider(responses=[inconsistent, inconsistent, inconsistent])
    with pytest.raises(GenerationFailedError):
        _ask(settings, provider, allow_general_knowledge=False)
    assert len(provider.calls) == 3
