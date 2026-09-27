"""Tests unitarios del core puro de TutorLearningContext (v1.8.0, Bloque
1) -- `app/services/tutor_learning_context.py`. Sin DB, sin Postgres:
`LearningProfile` se construye a mano (o vía `derive_course_learning_states`
ya testeado en `test_learning_state.py`) para poder ejercitar cada
permutación de forma determinística y aislada."""
from __future__ import annotations

import json

from app.models.certification import CertificationAttemptEntry, TopicBreakdown
from app.services.learning_profile_service import LearningProfile
from app.services.learning_state import (
    CurriculumTopicRef,
    derive_course_learning_states,
    summarize_learning_states,
)
from app.services.tutor_learning_context import (
    MAX_REVIEW_TOPICS,
    build_tutor_learning_context,
)

COURSE = "curso-demo"


def _topic(module_id: str, topic_id: str, module_title: str | None = None, topic_title: str | None = None) -> CurriculumTopicRef:
    return CurriculumTopicRef(
        module_id=module_id,
        topic_id=topic_id,
        module_title=module_title or module_id.replace("-", " ").title(),
        topic_title=topic_title or topic_id.replace("-", " ").title(),
    )


def _attempt(completed_at: str, score: float, module_id: str, topic_id: str) -> CertificationAttemptEntry:
    return CertificationAttemptEntry(
        attempt_id=f"attempt-{module_id}-{topic_id}-{completed_at}",
        course_id=COURSE,
        mode="practice",
        module_ids=[module_id],
        topic_ids=[topic_id],
        question_count=2,
        answered_count=2,
        correct_count=0,
        partial_count=0,
        incorrect_count=2,
        unanswered_count=0,
        score_percentage=score,
        completed_at=completed_at,
        performance_by_topic=[
            TopicBreakdown(
                module_id=module_id, topic_id=topic_id, attempted=2, correct=0,
                partially_correct=0, incorrect=2, unanswered=0, practice_score_percent=score,
            )
        ],
        competencies_to_reinforce=[],
        topics_to_reinforce=[],
        origin="server_evaluated",
    )


def _profile(
    curriculum_topics: list[CurriculumTopicRef],
    topic_status_by_key: dict[tuple[str, str], str] | None = None,
    attempts: list[CertificationAttemptEntry] | None = None,
) -> LearningProfile:
    states = derive_course_learning_states(
        COURSE, curriculum_topics, topic_status_by_key or {}, attempts or []
    )
    summary = summarize_learning_states(COURSE, states)
    return LearningProfile(
        course_id=COURSE, curriculum_topics=curriculum_topics, states=states, summary=summary
    )


class TestCurrentTopic:
    def test_not_started_current_topic(self):
        profile = _profile([_topic("m1", "t1")])
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert ctx.current_topic is not None
        assert ctx.current_topic.status == "not_started"
        assert ctx.current_topic.reason_code == "NOT_STARTED"
        assert ctx.current_topic.recent_average is None
        assert ctx.current_topic.observation_count == 0

    def test_progressing_current_topic_started_not_completed(self):
        profile = _profile([_topic("m1", "t1")], {("m1", "t1"): "in_progress"})
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert ctx.current_topic.status == "progressing"
        assert ctx.current_topic.reason_code == "STARTED_NOT_COMPLETED"

    def test_needs_review_current_topic_low_score(self):
        profile = _profile(
            [_topic("m1", "t1")],
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 20, "m1", "t1")],
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert ctx.current_topic.status == "needs_review"
        assert ctx.current_topic.reason_code == "LOW_CERTIFICATION_SCORE"
        assert ctx.current_topic.recent_average == 20.0
        assert ctx.current_topic.observation_count == 1

    def test_mastered_current_topic_high_score(self):
        profile = _profile(
            [_topic("m1", "t1")],
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 90, "m1", "t1")],
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert ctx.current_topic.status == "mastered"
        assert ctx.current_topic.reason_code == "HIGH_CERTIFICATION_SCORE"

    def test_current_topic_outside_curriculum_is_none(self):
        """(module_id, topic_id) que no pertenece al curriculum del
        profile -- nunca se inventa un estado por defecto."""
        profile = _profile([_topic("m1", "t1")])
        ctx = build_tutor_learning_context(profile, module_id="m-otro", topic_id="t-otro")
        assert ctx.current_topic is None

    def test_recent_average_exact_values_preserved(self):
        """Valores exactos ya cubiertos en test_learning_state_parity.py --
        acá solo se confirma que el builder los propaga sin recalcular."""
        profile = _profile(
            [_topic("m1", "t1")],
            attempts=[
                _attempt("2026-01-03T00:00:00+00:00", 100, "m1", "t1"),
                _attempt("2026-01-02T00:00:00+00:00", 50, "m1", "t1"),
                _attempt("2026-01-01T00:00:00+00:00", 50, "m1", "t1"),
            ],
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert ctx.current_topic.recent_average == 66.7
        assert ctx.current_topic.observation_count == 3


class TestCourseSummary:
    def test_summary_mirrors_learning_profile_summary(self):
        profile = _profile(
            [_topic("m1", "t1"), _topic("m1", "t2")],
            {("m1", "t1"): "completed"},
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert ctx.course_summary.total_topics == 2
        assert ctx.course_summary.model_dump() == profile.summary.model_dump(
            exclude={"course_id", "mastered_percentage"}
        )


class TestReviewTopics:
    def test_current_topic_excluded_from_its_own_review_list(self):
        profile = _profile(
            [_topic("m1", "t1")],
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 20, "m1", "t1")],
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert ctx.review_topics == []

    def test_needs_review_ranked_before_progressing(self):
        topics = [_topic("m1", "a"), _topic("m1", "b"), _topic("m1", "current")]
        profile = _profile(
            topics,
            {("m1", "b"): "in_progress"},
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 20, "m1", "a")],
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="current")
        assert [t.topic_id for t in ctx.review_topics] == ["a", "b"]
        assert ctx.review_topics[0].status == "needs_review"
        assert ctx.review_topics[1].status == "progressing"

    def test_mastered_and_not_started_never_appear_in_review_topics(self):
        topics = [_topic("m1", "mastered"), _topic("m1", "fresh"), _topic("m1", "current")]
        profile = _profile(
            topics,
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 90, "m1", "mastered")],
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="current")
        assert ctx.review_topics == []

    def test_truncated_to_max_review_topics(self):
        topics = [_topic("m1", f"t{i}") for i in range(MAX_REVIEW_TOPICS + 3)]
        topics.append(_topic("m1", "current"))
        attempts = [
            _attempt("2026-01-01T00:00:00+00:00", 20, "m1", f"t{i}")
            for i in range(MAX_REVIEW_TOPICS + 3)
        ]
        profile = _profile(topics, attempts=attempts)
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="current")
        assert len(ctx.review_topics) == MAX_REVIEW_TOPICS

    def test_review_topics_include_titles(self):
        profile = _profile(
            [_topic("m1", "a", module_title="Módulo Uno", topic_title="Tópico A"), _topic("m1", "current")],
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 20, "m1", "a")],
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="current")
        assert ctx.review_topics[0].module_title == "Módulo Uno"
        assert ctx.review_topics[0].topic_title == "Tópico A"

    def test_empty_profile_produces_empty_review_topics(self):
        profile = _profile([])
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert ctx.review_topics == []
        assert ctx.current_topic is None
        assert ctx.course_summary.total_topics == 0

    def test_duplicate_topic_slug_across_modules_stays_separate(self):
        topics = [_topic("mod-a", "comun"), _topic("mod-b", "comun"), _topic("mod-c", "current")]
        profile = _profile(
            topics,
            {("mod-a", "comun"): "in_progress"},
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 20, "mod-b", "comun")],
        )
        ctx = build_tutor_learning_context(profile, module_id="mod-c", topic_id="current")
        by_module = {t.module_id: t for t in ctx.review_topics}
        assert by_module["mod-a"].status == "progressing"
        assert by_module["mod-b"].status == "needs_review"


class TestDeterminism:
    def test_same_input_same_output(self):
        profile = _profile(
            [_topic("m1", "t1"), _topic("m1", "t2")],
            {("m1", "t1"): "in_progress"},
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 30, "m1", "t2")],
        )
        first = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        second = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        assert first.model_dump() == second.model_dump()


class TestDifferentProfilesProduceDifferentContexts:
    def test_two_profiles_same_topic_different_context(self):
        """Base determinística de la 'prueba de fundación de adaptividad'
        (Parte K): dos LearningProfile distintos para el MISMO
        (module_id, topic_id) producen TutorLearningContext distintos --
        sin llamar a ningún LLM."""
        topics = [_topic("m1", "t1")]
        profile_needs_review = _profile(
            topics, attempts=[_attempt("2026-01-01T00:00:00+00:00", 20, "m1", "t1")]
        )
        profile_mastered = _profile(
            topics, attempts=[_attempt("2026-01-01T00:00:00+00:00", 90, "m1", "t1")]
        )
        ctx_a = build_tutor_learning_context(profile_needs_review, module_id="m1", topic_id="t1")
        ctx_b = build_tutor_learning_context(profile_mastered, module_id="m1", topic_id="t1")
        assert ctx_a.current_topic.status != ctx_b.current_topic.status
        assert ctx_a.model_dump() != ctx_b.model_dump()


class TestPrivacyContract:
    """PARTE E: ningún campo prohibido puede aparecer en la serialización
    completa de `TutorLearningContext`, bajo ningún nombre de clave --
    chequeo por texto sobre el JSON completo, no solo por nombre de campo
    de nivel superior (para cubrir metadata anidada que se agregue a
    futuro sin querer)."""

    _PROHIBITED_SUBSTRINGS = [
        "app_user_id", "user_id", "email", "display_name", "subject",
        "issuer", "tenant_id", "external_object_id", "x-dev-user",
        "password", "token", "provider", "answers", "answer_key",
        "question_results", "practice_id", "attempt_id", "completed_at",
        "conversation", "recent_history",
    ]

    def test_full_context_never_contains_prohibited_fields(self):
        profile = _profile(
            [_topic("m1", "t1"), _topic("m1", "t2")],
            {("m1", "t1"): "in_progress"},
            attempts=[_attempt("2026-01-01T00:00:00+00:00", 20, "m1", "t2")],
        )
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t1")
        serialized = json.dumps(ctx.model_dump()).lower()
        for forbidden in self._PROHIBITED_SUBSTRINGS:
            assert forbidden not in serialized, f"campo prohibido encontrado: {forbidden}"

    def test_context_size_is_bounded(self):
        """Estimación de footprint (Parte N): con el tope de
        MAX_REVIEW_TOPICS, un contexto real nunca debería superar un
        tamaño trivial (unos pocos KB) -- sin tokenizer externo, un límite
        de bytes generoso alcanza para detectar una regresión real."""
        topics = [_topic("m1", f"t{i}") for i in range(30)]
        attempts = [_attempt("2026-01-01T00:00:00+00:00", 20, "m1", f"t{i}") for i in range(30)]
        profile = _profile(topics, attempts=attempts)
        ctx = build_tutor_learning_context(profile, module_id="m1", topic_id="t0")
        serialized_bytes = len(json.dumps(ctx.model_dump()).encode("utf-8"))
        assert serialized_bytes < 4000
        assert len(ctx.review_topics) <= MAX_REVIEW_TOPICS
