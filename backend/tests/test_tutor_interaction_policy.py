"""Tests unitarios del core puro de TutorInteractionPolicy (v1.8.0,
Bloque 4: "ADAPTIVE INTERACTION & FORMATIVE MICRO-CHECKS") --
`app/services/tutor_interaction_policy.py`. Sin DB, sin Postgres, sin
LLM.

Cubre la Parte O de la especificación del bloque (tests 69-74)."""
from __future__ import annotations

from app.services.tutor_interaction_policy import (
    MicroCheckMode,
    TutorInteractionPolicy,
    build_tutor_interaction_policy,
)
from app.services.tutor_teaching_policy import (
    ComprehensionCheck,
    ExampleComplexity,
    ExplanationDepth,
    PrerequisiteReinforcement,
    ProgressionMode,
    ScaffoldLevel,
    TutorTeachingPolicy,
)


def _teaching_policy(comprehension_check: ComprehensionCheck) -> TutorTeachingPolicy:
    return TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.standard,
        explanation_depth=ExplanationDepth.standard,
        prerequisite_reinforcement=PrerequisiteReinforcement.when_relevant,
        example_complexity=ExampleComplexity.intermediate,
        comprehension_check=comprehension_check,
        progression_mode=ProgressionMode.balanced,
    )


# --------------------------------------------------------------------------
# PASO 69-71: mapeo determinístico
# --------------------------------------------------------------------------


def test_encouraged_mapping():
    policy = build_tutor_interaction_policy(_teaching_policy(ComprehensionCheck.encouraged))
    assert policy == TutorInteractionPolicy(micro_check_mode=MicroCheckMode.encouraged, max_micro_checks=1)


def test_optional_mapping():
    policy = build_tutor_interaction_policy(_teaching_policy(ComprehensionCheck.optional))
    assert policy.micro_check_mode == MicroCheckMode.optional


def test_minimal_maps_to_on_request_only():
    policy = build_tutor_interaction_policy(_teaching_policy(ComprehensionCheck.minimal))
    assert policy.micro_check_mode == MicroCheckMode.on_request_only


# --------------------------------------------------------------------------
# PASO 72: determinismo
# --------------------------------------------------------------------------


def test_deterministic_same_input_same_output():
    tp = _teaching_policy(ComprehensionCheck.encouraged)
    first = build_tutor_interaction_policy(tp)
    second = build_tutor_interaction_policy(tp)
    assert first == second


# --------------------------------------------------------------------------
# max_micro_checks siempre 1 (PARTE 14), nunca variable
# --------------------------------------------------------------------------


def test_max_micro_checks_always_one_regardless_of_mode():
    for check in ComprehensionCheck:
        policy = build_tutor_interaction_policy(_teaching_policy(check))
        assert policy.max_micro_checks == 1


# --------------------------------------------------------------------------
# teaching_policy=None -> sin política (mismo criterio que Bloque 2/3)
# --------------------------------------------------------------------------


def test_teaching_policy_none_returns_no_interaction_policy():
    assert build_tutor_interaction_policy(None) is None


# --------------------------------------------------------------------------
# PASO 73/74: sin DB, sin mutación
# --------------------------------------------------------------------------


def test_builder_never_mutates_input_policy():
    tp = _teaching_policy(ComprehensionCheck.optional)
    before = tp.model_dump()
    build_tutor_interaction_policy(tp)
    assert tp.model_dump() == before


def test_module_has_no_db_or_http_imports():
    """PASO 73: auditoría estática -- el módulo nunca importa sqlalchemy
    ni fastapi (0 DB, 0 HTTP a nivel de import)."""
    import app.services.tutor_interaction_policy as module

    source = open(module.__file__, encoding="utf-8").read()
    assert "sqlalchemy" not in source.lower()
    assert "fastapi" not in source.lower()
    assert "import random" not in source
