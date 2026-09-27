"""Tests de integración de `app/services/tutor_learning_context_service.py`
(v1.8.0, Bloque 1) contra Postgres REAL + el curriculum real de
`content_dir` -- mismo patrón que `test_learning_profile_service.py`
(v1.7.0 Bloque 4), que este servicio orquesta directamente.

Cubre la "prueba de fundación de adaptividad" (Parte K de la
especificación): dos alumnos reales distintos, mismo curso/tópico,
producen `TutorLearningContext` distintos -- sin ninguna llamada LLM."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import AppUser
from app.db.session import get_engine
from app.models.certification import LegacyCertificationAttemptEntry
from app.services import (
    certification_history_service,
    topic_progress_service,
    tutor_learning_context_service,
)
from app.services import courses as course_service
from tests.conftest import TEST_DATABASE_URL

COURSE = "curso-de-prueba"
MODULE_FUNDAMENTOS = "fundamentos"
MODULE_ARQUITECTURAS = "arquitecturas"
TOPIC_INTRODUCCION = "introduccion"
TOPIC_COMPONENTES = "componentes"
TOPIC_ARQUITECTURA = "arquitectura-empresarial"


def _session() -> Session:
    return Session(get_engine(TEST_DATABASE_URL))


def _create_app_user() -> uuid.UUID:
    session = _session()
    try:
        user = AppUser()
        session.add(user)
        session.commit()
        return user.id
    finally:
        session.close()


def _legacy_entry(practice_id: str, module_id: str, topic_id: str, score: float, completed_at: str) -> LegacyCertificationAttemptEntry:
    return LegacyCertificationAttemptEntry(
        practice_id=practice_id,
        mode="practice",
        question_count=2,
        answered_count=2,
        correct_count=1 if score >= 50 else 0,
        partial_count=0,
        incorrect_count=1 if score < 50 else 0,
        unanswered_count=0,
        score_percentage=score,
        completed_at=completed_at,
        performance_by_topic=[
            {
                "module_id": module_id, "topic_id": topic_id, "attempted": 2,
                "correct": 1 if score >= 50 else 0, "partially_correct": 0,
                "incorrect": 1 if score < 50 else 0, "unanswered": 0, "practice_score_percent": score,
            }
        ],
        competencies_to_reinforce=[],
    )


def _settings(content_dir) -> Settings:
    return Settings(content_dir=str(content_dir), database_url=TEST_DATABASE_URL)


def test_new_user_current_topic_not_started(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        ctx = tutor_learning_context_service.build(
            settings=_settings(content_dir), session=session, user_id=user_id,
            course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
        )
        assert ctx.current_topic.status == "not_started"
        assert ctx.course_summary.total_topics == 3
        assert ctx.review_topics == []
    finally:
        session.close()


def test_needs_review_current_topic_from_real_certification_evidence(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE,
            [_legacy_entry("p1", MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, 20, "2026-01-01T00:00:00+00:00")],
        )
        session.commit()

        ctx = tutor_learning_context_service.build(
            settings=_settings(content_dir), session=session, user_id=user_id,
            course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
        )
        assert ctx.current_topic.status == "needs_review"
        assert ctx.current_topic.reason_code == "LOW_CERTIFICATION_SCORE"
    finally:
        session.close()


def test_review_topics_reflect_other_real_topics(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE,
            [_legacy_entry("p1", MODULE_ARQUITECTURAS, TOPIC_ARQUITECTURA, 20, "2026-01-01T00:00:00+00:00")],
        )
        session.commit()
        topic_progress_service.mark_topic_progress(
            session, user_id, COURSE, MODULE_FUNDAMENTOS, TOPIC_COMPONENTES, "start"
        )
        session.commit()

        ctx = tutor_learning_context_service.build(
            settings=_settings(content_dir), session=session, user_id=user_id,
            course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
        )
        by_topic = {t.topic_id: t for t in ctx.review_topics}
        assert by_topic[TOPIC_ARQUITECTURA].status == "needs_review"
        assert by_topic[TOPIC_COMPONENTES].status == "progressing"
        # needs_review antes que progressing (mismo criterio de
        # get_review_candidates).
        assert [t.topic_id for t in ctx.review_topics] == [TOPIC_ARQUITECTURA, TOPIC_COMPONENTES]
    finally:
        session.close()


def test_two_real_students_same_topic_produce_different_contexts(content_dir):
    """Prueba de fundación de adaptividad (Parte K): mismo curso, mismo
    tópico, dos LearningProfile reales distintos -> dos TutorLearningContext
    distintos. Sin LLM en ningún punto de este test."""
    settings = _settings(content_dir)
    student_a = _create_app_user()
    student_b = _create_app_user()
    session = _session()
    try:
        certification_history_service.import_legacy_attempts(
            session, student_a, COURSE,
            [_legacy_entry("pa", MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, 20, "2026-01-01T00:00:00+00:00")],
        )
        certification_history_service.import_legacy_attempts(
            session, student_b, COURSE,
            [_legacy_entry("pb", MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, 95, "2026-01-01T00:00:00+00:00")],
        )
        session.commit()

        ctx_a = tutor_learning_context_service.build(
            settings=settings, session=session, user_id=student_a,
            course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
        )
        ctx_b = tutor_learning_context_service.build(
            settings=settings, session=session, user_id=student_b,
            course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
        )
        assert ctx_a.current_topic.status == "needs_review"
        assert ctx_b.current_topic.status == "mastered"
        assert ctx_a.model_dump() != ctx_b.model_dump()
    finally:
        session.close()


def test_certification_driven_state_change_updates_context_without_caching(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        settings = _settings(content_dir)
        before = tutor_learning_context_service.build(
            settings=settings, session=session, user_id=user_id,
            course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
        )
        assert before.current_topic.status == "not_started"

        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE,
            [_legacy_entry("p1", MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, 90, "2026-01-01T00:00:00+00:00")],
        )
        session.commit()

        after = tutor_learning_context_service.build(
            settings=settings, session=session, user_id=user_id,
            course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
        )
        assert after.current_topic.status == "mastered"
    finally:
        session.close()


def test_invalid_course_propagates_course_not_found_error(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        with pytest.raises(course_service.CourseNotFoundError):
            tutor_learning_context_service.build(
                settings=_settings(content_dir), session=session, user_id=user_id,
                course_id="curso-que-no-existe", module_id="m1", topic_id="t1",
            )
    finally:
        session.close()


def test_db_failure_never_produces_a_fake_default_context(content_dir):
    """El orquestador nunca atrapa un fallo real de infraestructura para
    disfrazarlo de 'alumno sin progreso'. Simula una caída real de
    Postgres apuntando a un puerto inalcanzable -- IMPORTANTE: se usa un
    engine/Session totalmente aparte, nunca el `_session()` normal
    (reusar una Session cerrada NO falla: SQLAlchemy simplemente abre una
    transacción nueva de forma transparente, lo que en una primera versión
    de este test dejó una transacción abierta sin cerrar y colgó el
    truncate autouse del test siguiente esperando el lock -- de ahí este
    engine descartable, aislado, que jamás llega a conectar)."""
    from sqlalchemy import create_engine
    from sqlalchemy.exc import SQLAlchemyError

    user_id = _create_app_user()
    unreachable_url = TEST_DATABASE_URL.replace(":5432/", ":59999/")
    broken_engine = create_engine(unreachable_url)
    broken_session = Session(broken_engine)
    try:
        with pytest.raises(SQLAlchemyError):
            tutor_learning_context_service.build(
                settings=_settings(content_dir), session=broken_session, user_id=user_id,
                course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
            )
    finally:
        broken_session.close()
        broken_engine.dispose()


def test_is_read_only(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        from sqlalchemy import func, select

        from app.db.models import CertificationAttempt, TopicProgress

        topic_progress_service.mark_topic_progress(
            session, user_id, COURSE, MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, "start"
        )
        session.commit()

        before_progress = session.execute(select(func.count()).select_from(TopicProgress)).scalar_one()
        before_attempts = session.execute(select(func.count()).select_from(CertificationAttempt)).scalar_one()

        tutor_learning_context_service.build(
            settings=_settings(content_dir), session=session, user_id=user_id,
            course_id=COURSE, module_id=MODULE_FUNDAMENTOS, topic_id=TOPIC_INTRODUCCION,
        )
        session.commit()

        after_progress = session.execute(select(func.count()).select_from(TopicProgress)).scalar_one()
        after_attempts = session.execute(select(func.count()).select_from(CertificationAttempt)).scalar_one()
        assert before_progress == after_progress
        assert before_attempts == after_attempts
    finally:
        session.close()
