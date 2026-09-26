"""Tests de `app/services/certification_history_service.py` (v1.7.0,
Bloque 3) contra Postgres REAL (ver `tests/conftest.py::TEST_DATABASE_URL`)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import AppUser
from app.db.session import get_engine
from app.models.certification import (
    CertificationAttemptOrigin,
    CertificationMode,
    CertificationPracticeResult,
    CompetencyBreakdown,
    LegacyCertificationAttemptEntry,
    TopicBreakdown,
)
from app.services import certification_history_service as svc
from tests.conftest import TEST_DATABASE_URL

COURSE = "curso-demo"


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


def _topic(module_id="modulo-1", topic_id="topico-1", attempted=2, correct=1, partial=1, incorrect=0, unanswered=0, score=75.0) -> TopicBreakdown:
    return TopicBreakdown(
        module_id=module_id, topic_id=topic_id, attempted=attempted, correct=correct,
        partially_correct=partial, incorrect=incorrect, unanswered=unanswered, practice_score_percent=score,
    )


def _competency(name="Competencia A", attempted=1, correct=1, partial=0, incorrect=0, score=100.0) -> CompetencyBreakdown:
    return CompetencyBreakdown(
        competency=name, attempted=attempted, correct=correct, partially_correct=partial,
        incorrect=incorrect, practice_score_percent=score,
    )


def _result(total=2, correct=1, partial=1, incorrect=0, unanswered=0, score=75.0) -> CertificationPracticeResult:
    return CertificationPracticeResult(
        total_questions=total, correct=correct, partially_correct=partial, incorrect=incorrect,
        unanswered=unanswered, practice_score_percent=score,
        by_topic=[_topic(attempted=total, correct=correct, partial=partial, incorrect=incorrect, unanswered=unanswered, score=score)],
        by_competency=[_competency(score=score)],
        question_results=[],
        topics_to_reinforce=[],
    )


def test_persist_attempt_creates_row_with_server_evaluated_origin():
    session = _session()
    try:
        user_id = _create_app_user()
        entry = svc.persist_attempt(session, user_id, COURSE, "practice-1", CertificationMode.simulation, _result())
        session.commit()
        assert entry.origin == CertificationAttemptOrigin.server_evaluated
        assert entry.score_percentage == 75.0
        assert entry.module_ids == ["modulo-1"]
        assert entry.topic_ids == ["topico-1"]
    finally:
        session.close()


def test_persist_attempt_never_includes_question_results_field():
    session = _session()
    try:
        user_id = _create_app_user()
        entry = svc.persist_attempt(session, user_id, COURSE, "practice-1", CertificationMode.practice, _result())
        session.commit()
        assert not hasattr(entry, "question_results")
    finally:
        session.close()


def test_persist_attempt_idempotent_same_practice_id_first_write_wins():
    session = _session()
    try:
        user_id = _create_app_user()
        first = svc.persist_attempt(session, user_id, COURSE, "practice-1", CertificationMode.simulation, _result(score=75.0))
        session.commit()
        # Reintento con un resultado DISTINTO (simula recompute tras un
        # retry de red): nunca debe pisar la evidencia ya persistida.
        second = svc.persist_attempt(session, user_id, COURSE, "practice-1", CertificationMode.simulation, _result(score=0.0, correct=0, partial=0, incorrect=2))
        session.commit()
        assert second.score_percentage == 75.0
        history = svc.get_history(session, user_id, COURSE)
        assert len(history) == 1
    finally:
        session.close()


def test_two_different_practice_ids_create_two_attempts():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.persist_attempt(session, user_id, COURSE, "practice-1", CertificationMode.practice, _result())
        svc.persist_attempt(session, user_id, COURSE, "practice-2", CertificationMode.simulation, _result())
        session.commit()
        history = svc.get_history(session, user_id, COURSE)
        assert len(history) == 2
    finally:
        session.close()


def test_two_users_isolated():
    session = _session()
    try:
        user_a, user_b = _create_app_user(), _create_app_user()
        svc.persist_attempt(session, user_a, COURSE, "practice-1", CertificationMode.practice, _result())
        session.commit()
        assert len(svc.get_history(session, user_a, COURSE)) == 1
        assert svc.get_history(session, user_b, COURSE) == []
    finally:
        session.close()


def test_history_sorted_most_recent_first():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.persist_attempt(session, user_id, COURSE, "practice-1", CertificationMode.practice, _result())
        session.commit()
        svc.persist_attempt(session, user_id, COURSE, "practice-2", CertificationMode.practice, _result())
        session.commit()
        history = svc.get_history(session, user_id, COURSE)
        assert history[0].attempt_id == "practice-2"
        assert history[1].attempt_id == "practice-1"
    finally:
        session.close()


def test_history_limit_serves_at_most_50():
    session = _session()
    try:
        user_id = _create_app_user()
        for i in range(60):
            svc.persist_attempt(session, user_id, COURSE, f"practice-{i}", CertificationMode.practice, _result())
            session.commit()
        history = svc.get_history(session, user_id, COURSE)
        assert len(history) == 50
        # PASO 19: se persisten los 60, solo se SIRVEN 50 -- nunca se
        # truncó la persistencia real.
        raw_count_session = _session()
        try:
            from app.db.models import CertificationAttempt
            from sqlalchemy import select, func
            count = raw_count_session.execute(
                select(func.count()).select_from(CertificationAttempt).where(CertificationAttempt.user_id == user_id)
            ).scalar_one()
            assert count == 60
        finally:
            raw_count_session.close()
    finally:
        session.close()


def test_delete_history_removes_only_that_course():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.persist_attempt(session, user_id, COURSE, "practice-1", CertificationMode.practice, _result())
        svc.persist_attempt(session, user_id, "otro-curso", "practice-2", CertificationMode.practice, _result())
        session.commit()

        svc.delete_history(session, user_id, COURSE)
        session.commit()

        assert svc.get_history(session, user_id, COURSE) == []
        assert len(svc.get_history(session, user_id, "otro-curso")) == 1
    finally:
        session.close()


def test_delete_history_cascades_topic_results():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.persist_attempt(session, user_id, COURSE, "practice-1", CertificationMode.practice, _result())
        session.commit()
        svc.delete_history(session, user_id, COURSE)
        session.commit()

        from app.db.models import CertificationTopicResult
        from sqlalchemy import select, func
        remaining = session.execute(select(func.count()).select_from(CertificationTopicResult)).scalar_one()
        assert remaining == 0
    finally:
        session.close()


# --- Legacy import ----------------------------------------------------------


def _legacy_entry(practice_id="legacy-1", score=60.0, completed_at="2025-01-01T00:00:00+00:00") -> LegacyCertificationAttemptEntry:
    return LegacyCertificationAttemptEntry(
        practice_id=practice_id,
        mode=CertificationMode.practice,
        question_count=2,
        answered_count=2,
        correct_count=1,
        partial_count=0,
        incorrect_count=1,
        unanswered_count=0,
        score_percentage=score,
        completed_at=completed_at,
        performance_by_topic=[_topic(score=score)],
        competencies_to_reinforce=[_competency(score=score)],
    )


def test_legacy_import_creates_attempt_with_legacy_origin():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.import_legacy_attempts(session, user_id, COURSE, [_legacy_entry()])
        session.commit()
        history = svc.get_history(session, user_id, COURSE)
        assert len(history) == 1
        assert history[0].origin == CertificationAttemptOrigin.legacy_import
        assert history[0].completed_at.startswith("2025-01-01")
    finally:
        session.close()


def test_legacy_import_skips_practice_id_already_server_evaluated():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.persist_attempt(session, user_id, COURSE, "shared-id", CertificationMode.simulation, _result(score=90.0))
        session.commit()

        svc.import_legacy_attempts(session, user_id, COURSE, [_legacy_entry(practice_id="shared-id", score=10.0)])
        session.commit()

        history = svc.get_history(session, user_id, COURSE)
        assert len(history) == 1
        assert history[0].origin == CertificationAttemptOrigin.server_evaluated
        assert history[0].score_percentage == 90.0
    finally:
        session.close()


def test_legacy_import_is_idempotent():
    session = _session()
    try:
        user_id = _create_app_user()
        entry = _legacy_entry()
        svc.import_legacy_attempts(session, user_id, COURSE, [entry])
        session.commit()
        svc.import_legacy_attempts(session, user_id, COURSE, [entry])
        session.commit()
        assert len(svc.get_history(session, user_id, COURSE)) == 1
    finally:
        session.close()


def test_legacy_import_multiple_attempts():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.import_legacy_attempts(
            session, user_id, COURSE,
            [_legacy_entry(practice_id="legacy-1"), _legacy_entry(practice_id="legacy-2")],
        )
        session.commit()
        assert len(svc.get_history(session, user_id, COURSE)) == 2
    finally:
        session.close()


def test_legacy_import_empty_list_is_noop():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.import_legacy_attempts(session, user_id, COURSE, [])
        session.commit()
        assert svc.get_history(session, user_id, COURSE) == []
    finally:
        session.close()


def test_legacy_import_invalid_timestamp_skips_entry_without_raising():
    session = _session()
    try:
        user_id = _create_app_user()
        entry = _legacy_entry(completed_at="not-a-real-timestamp")
        svc.import_legacy_attempts(session, user_id, COURSE, [entry])
        session.commit()
        assert svc.get_history(session, user_id, COURSE) == []
    finally:
        session.close()


def test_legacy_import_preserves_order_by_original_timestamp():
    session = _session()
    try:
        user_id = _create_app_user()
        svc.import_legacy_attempts(
            session, user_id, COURSE,
            [
                _legacy_entry(practice_id="older", completed_at="2024-01-01T00:00:00+00:00"),
                _legacy_entry(practice_id="newer", completed_at="2025-06-01T00:00:00+00:00"),
            ],
        )
        session.commit()
        history = svc.get_history(session, user_id, COURSE)
        assert history[0].attempt_id == "newer"
        assert history[1].attempt_id == "older"
    finally:
        session.close()
