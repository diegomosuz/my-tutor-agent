"""Tests unitarios del core pedagógico puro (v1.7.0, Bloque 4) --
`app/services/learning_state.py`. Sin DB, sin Postgres, sin fixture
externo -- puramente funciones puras con inputs construidos a mano."""
from __future__ import annotations

from app.models.certification import CertificationAttemptEntry, TopicBreakdown
from app.services.learning_state import (
    CurriculumTopicRef,
    _round_half_up,
    classify_score,
    derive_course_learning_states,
    derive_topic_learning_signal,
    derive_topic_learning_state,
    get_review_candidates,
    summarize_learning_states,
)

MODULE = "modulo-1"
TOPIC = "topico-1"


def _attempt(completed_at: str, score: float, module_id: str = MODULE, topic_id: str = TOPIC, attempted: int = 2) -> CertificationAttemptEntry:
    return CertificationAttemptEntry(
        attempt_id=f"attempt-{completed_at}",
        course_id="curso-demo",
        mode="practice",
        module_ids=[module_id],
        topic_ids=[topic_id],
        question_count=attempted,
        answered_count=attempted,
        correct_count=0,
        partial_count=0,
        incorrect_count=attempted,
        unanswered_count=0,
        score_percentage=score,
        completed_at=completed_at,
        performance_by_topic=[
            TopicBreakdown(
                module_id=module_id, topic_id=topic_id, attempted=attempted, correct=0,
                partially_correct=0, incorrect=attempted, unanswered=0, practice_score_percent=score,
            )
        ],
        competencies_to_reinforce=[],
        topics_to_reinforce=[],
        origin="server_evaluated",
    )


class TestClassifyScore:
    def test_below_60_is_needs_reinforcement(self):
        assert classify_score(0) == "needs_reinforcement"
        assert classify_score(59.9) == "needs_reinforcement"

    def test_60_to_79_is_developing(self):
        assert classify_score(60) == "developing"
        assert classify_score(79.9) == "developing"

    def test_80_and_above_is_observed_strength(self):
        assert classify_score(80) == "observed_strength"
        assert classify_score(100) == "observed_strength"


class TestRoundHalfUp:
    def test_matches_js_math_round_on_real_tie(self):
        # avg=30.25: JS Math.round(302.5)/10 = 30.3; Python round() nativo
        # da 30.2 (banker's rounding) -- confirmado real, ver fixture.
        assert _round_half_up(30.25, 1) == 30.3

    def test_never_uses_python_native_banker_rounding(self):
        assert round(30.25, 1) == 30.2  # documenta el bug que se evita
        assert _round_half_up(30.25, 1) != round(30.25, 1)


class TestDeriveTopicLearningSignal:
    def test_no_observations_not_started(self):
        signal = derive_topic_learning_signal(MODULE, TOPIC, "not_started", [])
        assert signal.observations == 0
        assert signal.latest_score is None
        assert signal.recent_average is None
        assert signal.reinforcement_level is None

    def test_one_observation(self):
        attempts = [_attempt("2026-01-01T00:00:00Z", 30)]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "not_started", attempts)
        assert signal.observations == 1
        assert signal.latest_score == 30
        assert signal.recent_average == 30

    def test_window_limits_to_3_most_recent(self):
        attempts = [
            _attempt("2026-01-01T00:00:00Z", 90),
            _attempt("2026-01-02T00:00:00Z", 10),
            _attempt("2026-01-03T00:00:00Z", 10),
            _attempt("2026-01-04T00:00:00Z", 10),
        ]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "completed", attempts)
        assert signal.observations == 3
        assert signal.recent_average == 10.0
        assert signal.latest_score == 10  # el más reciente, no el 90 excluido

    def test_ignores_observations_of_other_topics(self):
        attempts = [_attempt("2026-01-01T00:00:00Z", 30, module_id="otro-modulo", topic_id="otro-topico")]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "not_started", attempts)
        assert signal.observations == 0

    def test_ignores_zero_attempted_breakdown(self):
        attempt = _attempt("2026-01-01T00:00:00Z", 30, attempted=0)
        signal = derive_topic_learning_signal(MODULE, TOPIC, "not_started", [attempt])
        assert signal.observations == 0


class TestDeriveTopicLearningState:
    def test_not_started_no_evidence(self):
        signal = derive_topic_learning_signal(MODULE, TOPIC, "not_started", [])
        assert derive_topic_learning_state(signal) == ("not_started", "NOT_STARTED")

    def test_in_progress_no_evidence(self):
        signal = derive_topic_learning_signal(MODULE, TOPIC, "in_progress", [])
        assert derive_topic_learning_state(signal) == ("progressing", "STARTED_NOT_COMPLETED")

    def test_completed_no_evidence_never_mastered(self):
        signal = derive_topic_learning_signal(MODULE, TOPIC, "completed", [])
        assert derive_topic_learning_state(signal) == ("progressing", "COMPLETED_NO_ASSESSMENT")

    def test_low_score_single_observation(self):
        attempts = [_attempt("2026-01-01T00:00:00Z", 30)]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "completed", attempts)
        assert derive_topic_learning_state(signal) == ("needs_review", "LOW_CERTIFICATION_SCORE")

    def test_repeated_low_score_two_observations(self):
        attempts = [_attempt("2026-01-01T00:00:00Z", 30), _attempt("2026-01-02T00:00:00Z", 40)]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "completed", attempts)
        assert derive_topic_learning_state(signal) == ("needs_review", "REPEATED_LOW_CERTIFICATION_SCORE")

    def test_high_score_produces_mastered_even_without_completion(self):
        # PASO 24: evidencia domina en cualquier dirección -- alto score
        # produce mastered aunque el tópico nunca se haya completado.
        attempts = [_attempt("2026-01-01T00:00:00Z", 90)]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "not_started", attempts)
        assert derive_topic_learning_state(signal) == ("mastered", "HIGH_CERTIFICATION_SCORE")

    def test_low_score_overrides_completed_status(self):
        attempts = [_attempt("2026-01-01T00:00:00Z", 20)]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "completed", attempts)
        assert derive_topic_learning_state(signal) == ("needs_review", "LOW_CERTIFICATION_SCORE")

    def test_medium_score(self):
        attempts = [_attempt("2026-01-01T00:00:00Z", 70)]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "in_progress", attempts)
        assert derive_topic_learning_state(signal) == ("progressing", "MEDIUM_CERTIFICATION_SCORE")

    def test_window_effect_25_and_100_is_progressing_never_mastered(self):
        attempts = [_attempt("2026-01-01T00:00:00Z", 25), _attempt("2026-02-01T00:00:00Z", 100)]
        signal = derive_topic_learning_signal(MODULE, TOPIC, "completed", attempts)
        assert signal.recent_average == 62.5
        assert derive_topic_learning_state(signal) == ("progressing", "MEDIUM_CERTIFICATION_SCORE")


class TestDeriveCourseLearningStates:
    def test_curriculum_drives_universe_never_stale_db_rows(self):
        curriculum = [
            CurriculumTopicRef(module_id=MODULE, topic_id=TOPIC, module_title="Módulo 1", topic_title="Tópico 1"),
        ]
        # Progreso/evidencia para un tópico que YA NO existe en el curriculum.
        status_by_key = {(MODULE, TOPIC): "in_progress", ("modulo-fantasma", "topico-fantasma"): "completed"}
        attempts = [_attempt("2026-01-01T00:00:00Z", 90, module_id="modulo-fantasma", topic_id="topico-fantasma")]
        states = derive_course_learning_states("curso-demo", curriculum, status_by_key, attempts)
        assert len(states) == 1  # nunca 2 -- el fantasma nunca aparece
        assert states[0].module_id == MODULE

    def test_topic_without_progress_row_is_not_started(self):
        curriculum = [CurriculumTopicRef(module_id=MODULE, topic_id=TOPIC, module_title="M", topic_title="T")]
        states = derive_course_learning_states("curso-demo", curriculum, {}, [])
        assert states[0].status == "not_started"
        assert states[0].evidence.status == "not_started"

    def test_duplicate_topic_slug_across_modules_stays_independent(self):
        curriculum = [
            CurriculumTopicRef(module_id="modulo-a", topic_id="topico-1", module_title="A", topic_title="T1"),
            CurriculumTopicRef(module_id="modulo-b", topic_id="topico-1", module_title="B", topic_title="T1"),
        ]
        status_by_key = {("modulo-a", "topico-1"): "completed"}
        attempts = [_attempt("2026-01-01T00:00:00Z", 90, module_id="modulo-b", topic_id="topico-1")]
        states = derive_course_learning_states("curso-demo", curriculum, status_by_key, attempts)
        by_module = {s.module_id: s for s in states}
        assert by_module["modulo-a"].status == "progressing"  # completed, sin evidencia
        assert by_module["modulo-a"].reason_code == "COMPLETED_NO_ASSESSMENT"
        assert by_module["modulo-b"].status == "mastered"  # evidencia alta, sin completar
        assert by_module["modulo-b"].reason_code == "HIGH_CERTIFICATION_SCORE"

    def test_order_matches_curriculum_order_not_db_order(self):
        curriculum = [
            CurriculumTopicRef(module_id="modulo-z", topic_id="topico-1", module_title="Z", topic_title="T"),
            CurriculumTopicRef(module_id="modulo-a", topic_id="topico-1", module_title="A", topic_title="T"),
        ]
        states = derive_course_learning_states("curso-demo", curriculum, {}, [])
        assert [s.module_id for s in states] == ["modulo-z", "modulo-a"]


class TestSummarizeLearningStates:
    def test_counts_sum_to_total(self):
        curriculum = [
            CurriculumTopicRef(module_id=MODULE, topic_id=f"t{i}", module_title="M", topic_title="T")
            for i in range(4)
        ]
        status_by_key = {(MODULE, "t1"): "in_progress", (MODULE, "t2"): "completed"}
        attempts = [_attempt("2026-01-01T00:00:00Z", 90, topic_id="t3")]
        states = derive_course_learning_states("curso-demo", curriculum, status_by_key, attempts)
        summary = summarize_learning_states("curso-demo", states)
        assert summary.total_topics == 4
        assert summary.not_started + summary.progressing + summary.needs_review + summary.mastered == 4

    def test_empty_course_zero_percentage(self):
        summary = summarize_learning_states("curso-demo", [])
        assert summary.total_topics == 0
        assert summary.mastered_percentage == 0


class TestGetReviewCandidates:
    def test_never_includes_not_started_or_mastered(self):
        curriculum = [
            CurriculumTopicRef(module_id=MODULE, topic_id="t1", module_title="M", topic_title="T1"),
            CurriculumTopicRef(module_id=MODULE, topic_id="t2", module_title="M", topic_title="T2"),
            CurriculumTopicRef(module_id=MODULE, topic_id="t3", module_title="M", topic_title="T3"),
        ]
        status_by_key = {(MODULE, "t2"): "in_progress"}
        attempts = [_attempt("2026-01-01T00:00:00Z", 30, topic_id="t3")]
        states = derive_course_learning_states("curso-demo", curriculum, status_by_key, attempts)
        candidates = get_review_candidates(states)
        statuses = {c.status for c in candidates}
        assert "not_started" not in statuses
        assert "mastered" not in statuses

    def test_needs_review_ranked_before_progressing(self):
        curriculum = [
            CurriculumTopicRef(module_id=MODULE, topic_id="t1", module_title="M", topic_title="T1"),
            CurriculumTopicRef(module_id=MODULE, topic_id="t2", module_title="M", topic_title="T2"),
        ]
        status_by_key = {(MODULE, "t1"): "in_progress"}
        attempts = [_attempt("2026-01-01T00:00:00Z", 20, topic_id="t2")]
        states = derive_course_learning_states("curso-demo", curriculum, status_by_key, attempts)
        candidates = get_review_candidates(states)
        assert [c.topic_id for c in candidates] == ["t2", "t1"]
