"""Tests unitarios del core puro de TutorTeachingPolicy (v1.8.0, Bloque
3: "DETERMINISTIC ADAPTIVE TEACHING POLICY") --
`app/services/tutor_teaching_policy.py`. Sin DB, sin Postgres, sin LLM:
`TutorLearningContext` se construye a mano para ejercitar cada
permutación de forma aislada y determinística.

Cubre la Parte K de la especificación del bloque (tests 50-59)."""
from __future__ import annotations

from app.services.tutor_learning_context import (
    TutorCourseSummary,
    TutorCurrentTopicContext,
    TutorLearningContext,
)
from app.services.tutor_teaching_policy import (
    SCAFFOLD_LEVEL_RANK,
    STANDARD_FALLBACK_POLICY,
    ComprehensionCheck,
    ExampleComplexity,
    ExplanationDepth,
    PrerequisiteReinforcement,
    ProgressionMode,
    ScaffoldLevel,
    TutorTeachingPolicy,
    build_tutor_teaching_policy,
)

_EMPTY_SUMMARY = TutorCourseSummary(total_topics=1, not_started=0, progressing=0, needs_review=0, mastered=0)


def _ctx(status: str, reason_code: str, recent_average: float | None = None, observation_count: int = 0) -> TutorLearningContext:
    return TutorLearningContext(
        course_id="curso-demo",
        current_topic=TutorCurrentTopicContext(
            module_id="m1", topic_id="t1", status=status, reason_code=reason_code,
            recent_average=recent_average, observation_count=observation_count,
        ),
        course_summary=_EMPTY_SUMMARY,
        review_topics=[],
    )


# --------------------------------------------------------------------------
# PASO 50-53: policy exacta por status (PARTE C, 11-14)
# --------------------------------------------------------------------------


def test_not_started_policy_exact():
    policy = build_tutor_teaching_policy(_ctx("not_started", "NOT_STARTED"))
    assert policy == TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.foundation,
        explanation_depth=ExplanationDepth.foundational,
        prerequisite_reinforcement=PrerequisiteReinforcement.when_relevant,
        example_complexity=ExampleComplexity.basic,
        comprehension_check=ComprehensionCheck.optional,
        progression_mode=ProgressionMode.reinforce_before_advancing,
    )


def test_progressing_policy_exact():
    policy = build_tutor_teaching_policy(_ctx("progressing", "STARTED_NOT_COMPLETED"))
    assert policy == TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.guided,
        explanation_depth=ExplanationDepth.standard,
        prerequisite_reinforcement=PrerequisiteReinforcement.when_relevant,
        example_complexity=ExampleComplexity.intermediate,
        comprehension_check=ComprehensionCheck.optional,
        progression_mode=ProgressionMode.balanced,
    )


def test_needs_review_policy_exact():
    policy = build_tutor_teaching_policy(_ctx("needs_review", "LOW_CERTIFICATION_SCORE"))
    assert policy == TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.foundation,
        explanation_depth=ExplanationDepth.foundational,
        prerequisite_reinforcement=PrerequisiteReinforcement.required,
        example_complexity=ExampleComplexity.basic,
        comprehension_check=ComprehensionCheck.encouraged,
        progression_mode=ProgressionMode.reinforce_before_advancing,
    )


def test_mastered_policy_exact():
    policy = build_tutor_teaching_policy(_ctx("mastered", "HIGH_CERTIFICATION_SCORE"))
    assert policy == TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.minimal,
        explanation_depth=ExplanationDepth.advanced,
        prerequisite_reinforcement=PrerequisiteReinforcement.minimal,
        example_complexity=ExampleComplexity.advanced,
        comprehension_check=ComprehensionCheck.minimal,
        progression_mode=ProgressionMode.advance_when_relevant,
    )


# --------------------------------------------------------------------------
# PASO 54-57: modulación por reason_code (PARTE D, 16-24)
# --------------------------------------------------------------------------


class TestReasonCodeModulation:
    def test_not_started_reason_code_no_extra_change(self):
        """PASO 17: NOT_STARTED -- sin cambio especial adicional."""
        policy = build_tutor_teaching_policy(_ctx("not_started", "NOT_STARTED"))
        base = build_tutor_teaching_policy(_ctx("not_started", "NOT_STARTED"))
        assert policy == base

    def test_started_not_completed_matches_progressing_base(self):
        """PASO 18: continuity-oriented -- ya reflejado en la base de
        'progressing', sin dimensión adicional."""
        policy = build_tutor_teaching_policy(_ctx("progressing", "STARTED_NOT_COMPLETED"))
        assert policy.progression_mode == ProgressionMode.balanced

    def test_completed_no_assessment_never_implies_mastery(self):
        """PASO 19/56: COMPLETED_NO_ASSESSMENT nunca empuja hacia los
        valores de 'mastered' (scaffold mínimo, profundidad avanzada)."""
        policy = build_tutor_teaching_policy(_ctx("progressing", "COMPLETED_NO_ASSESSMENT"))
        assert policy.scaffold_level != ScaffoldLevel.minimal
        assert policy.explanation_depth != ExplanationDepth.advanced
        assert policy.prerequisite_reinforcement != PrerequisiteReinforcement.minimal

    def test_low_certification_score_requires_prerequisite_reinforcement(self):
        """PASO 20: LOW_CERTIFICATION_SCORE -- más reinforcement."""
        base = build_tutor_teaching_policy(_ctx("needs_review", "LOW_CERTIFICATION_SCORE"))
        assert base.prerequisite_reinforcement == PrerequisiteReinforcement.required

    def test_repeated_low_never_weaker_than_low(self):
        """PASO 21/55: REPEATED_LOW_CERTIFICATION_SCORE debe ser el máximo
        reinforcement permitido por policy -- nunca MENOS reforzado que
        LOW_CERTIFICATION_SCORE en ninguna dimensión."""
        low = build_tutor_teaching_policy(_ctx("needs_review", "LOW_CERTIFICATION_SCORE"))
        repeated = build_tutor_teaching_policy(_ctx("needs_review", "REPEATED_LOW_CERTIFICATION_SCORE"))
        assert SCAFFOLD_LEVEL_RANK[repeated.scaffold_level] >= SCAFFOLD_LEVEL_RANK[low.scaffold_level]
        assert repeated.prerequisite_reinforcement == PrerequisiteReinforcement.required
        # Ambos llegan al mismo techo (PrerequisiteReinforcement.required
        # es el valor más alto posible) -- documentado como decisión
        # deliberada, ver docstring de _apply_reason_code_modulation.
        assert repeated.prerequisite_reinforcement == low.prerequisite_reinforcement

    def test_medium_certification_score_matches_progressing_base(self):
        """PASO 22: moderate scaffold -- ya reflejado en la base de
        'progressing' (guided/standard), sin cambio adicional."""
        policy = build_tutor_teaching_policy(_ctx("progressing", "MEDIUM_CERTIFICATION_SCORE"))
        assert policy.scaffold_level == ScaffoldLevel.guided

    def test_high_certification_score_never_overrides_final_state(self):
        """PASO 23/57: HIGH_CERTIFICATION_SCORE puede 'disminuir scaffold'
        -- pero la base de 'mastered' ya tiene el mínimo posible, así que
        no hay margen para bajar más, y el status sigue siendo la
        autoridad (nunca se reclassifica a partir del reason_code)."""
        policy = build_tutor_teaching_policy(_ctx("mastered", "HIGH_CERTIFICATION_SCORE"))
        assert policy.scaffold_level == ScaffoldLevel.minimal
        assert SCAFFOLD_LEVEL_RANK[policy.scaffold_level] == min(SCAFFOLD_LEVEL_RANK.values())


def test_no_reclassification_status_always_governs():
    """PASO 24: aunque (hipotéticamente) un reason_code no coincidiera
    con su status habitual, el builder NUNCA recalcula el status -- solo
    lee `current.status` tal cual viene y aplica la base de ESE status."""
    # Combinación que hoy nunca produce learning_state.py (needs_review +
    # HIGH_CERTIFICATION_SCORE), ejercitada deliberadamente para probar
    # que el builder no intenta "corregir" la inconsistencia -- status
    # manda, la modulación de reason_code simplemente no aplica (HIGH no
    # está en el set que modula).
    policy = build_tutor_teaching_policy(_ctx("needs_review", "HIGH_CERTIFICATION_SCORE"))
    assert policy.scaffold_level == ScaffoldLevel.foundation  # base de needs_review, no de mastered


# --------------------------------------------------------------------------
# PASO 58-59: determinismo / inmutabilidad / sin side effects
# --------------------------------------------------------------------------


def test_deterministic_same_input_same_output():
    ctx = _ctx("needs_review", "REPEATED_LOW_CERTIFICATION_SCORE", recent_average=15.0, observation_count=3)
    first = build_tutor_teaching_policy(ctx)
    second = build_tutor_teaching_policy(ctx)
    assert first == second
    assert first.model_dump() == second.model_dump()


def test_builder_never_mutates_input_context():
    ctx = _ctx("needs_review", "LOW_CERTIFICATION_SCORE")
    before = ctx.model_dump()
    build_tutor_teaching_policy(ctx)
    assert ctx.model_dump() == before


# --------------------------------------------------------------------------
# current_topic=None / learning_context=None (PARTE O, 82)
# --------------------------------------------------------------------------


def test_current_topic_none_uses_standard_fallback_never_invents_state():
    ctx = TutorLearningContext(course_id="c", current_topic=None, course_summary=_EMPTY_SUMMARY, review_topics=[])
    policy = build_tutor_teaching_policy(ctx)
    assert policy == STANDARD_FALLBACK_POLICY
    # Ninguno de los seis valores coincide con el extremo de "mastered" ni
    # de "needs_review" -- es deliberadamente neutral, no-asuntivo.
    assert policy.scaffold_level == ScaffoldLevel.standard
    assert policy.progression_mode == ProgressionMode.balanced


def test_learning_context_none_returns_no_policy():
    assert build_tutor_teaching_policy(None) is None


# --------------------------------------------------------------------------
# PASO 70 / criterio G: needs_review > mastered en scaffold, provable
# --------------------------------------------------------------------------


def test_needs_review_has_strictly_more_scaffold_than_mastered():
    needs_review = build_tutor_teaching_policy(_ctx("needs_review", "LOW_CERTIFICATION_SCORE"))
    mastered = build_tutor_teaching_policy(_ctx("mastered", "HIGH_CERTIFICATION_SCORE"))
    assert SCAFFOLD_LEVEL_RANK[needs_review.scaffold_level] > SCAFFOLD_LEVEL_RANK[mastered.scaffold_level]


def test_scaffold_level_rank_covers_all_enum_values():
    assert set(SCAFFOLD_LEVEL_RANK.keys()) == set(ScaffoldLevel)
