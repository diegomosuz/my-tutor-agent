"""PASO 90 de la especificación: concurrencia real (threads + Postgres
real) sobre `certification_history_service.persist_attempt`. Mismo
practice_id sometido simultáneamente nunca crea dos filas."""
from __future__ import annotations

import threading
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AppUser, CertificationAttempt
from app.db.session import get_engine
from app.models.certification import CertificationMode, CertificationPracticeResult, TopicBreakdown
from app.services import certification_history_service as svc
from tests.conftest import TEST_DATABASE_URL

COURSE = "curso-demo"


def _create_app_user() -> uuid.UUID:
    session = Session(get_engine(TEST_DATABASE_URL))
    try:
        user = AppUser()
        session.add(user)
        session.commit()
        return user.id
    finally:
        session.close()


def _result(score: float) -> CertificationPracticeResult:
    return CertificationPracticeResult(
        total_questions=2,
        correct=1 if score > 50 else 0,
        partially_correct=0,
        incorrect=1 if score <= 50 else 0,
        unanswered=0,
        practice_score_percent=score,
        by_topic=[
            TopicBreakdown(
                module_id="modulo-1", topic_id="topico-1", attempted=2, correct=1, partially_correct=0,
                incorrect=1, unanswered=0, practice_score_percent=score,
            )
        ],
        by_competency=[],
        question_results=[],
        topics_to_reinforce=[],
    )


def test_concurrent_submit_same_practice_id_never_duplicates():
    user_id = _create_app_user()
    engine = get_engine(TEST_DATABASE_URL)
    errors: list[Exception] = []
    barrier = threading.Barrier(5)

    def _worker(score: float) -> None:
        session = Session(engine)
        try:
            barrier.wait()
            svc.persist_attempt(session, user_id, COURSE, "practice-shared", CertificationMode.simulation, _result(score))
            session.commit()
        except Exception as exc:  # pragma: no cover - solo si algo real falla
            errors.append(exc)
        finally:
            session.close()

    threads = [threading.Thread(target=_worker, args=(score,)) for score in [50.0, 60.0, 70.0, 80.0, 90.0]]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"Errores inesperados en la persistencia concurrente: {errors}"

    verify_session = Session(engine)
    try:
        count = verify_session.execute(
            select(func.count()).select_from(CertificationAttempt).where(
                CertificationAttempt.user_id == user_id, CertificationAttempt.practice_id == "practice-shared"
            )
        ).scalar_one()
    finally:
        verify_session.close()
    assert count == 1


def test_repeated_concurrency_run_is_consistent():
    for i in range(5):
        user_id = _create_app_user()
        engine = get_engine(TEST_DATABASE_URL)
        errors: list[Exception] = []
        barrier = threading.Barrier(3)

        def _worker() -> None:
            session = Session(engine)
            try:
                barrier.wait()
                svc.persist_attempt(session, user_id, COURSE, f"practice-run-{i}", CertificationMode.practice, _result(75.0))
                session.commit()
            except Exception as exc:  # pragma: no cover
                errors.append(exc)
            finally:
                session.close()

        threads = [threading.Thread(target=_worker) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors
        session = Session(engine)
        try:
            history = svc.get_history(session, user_id, COURSE)
        finally:
            session.close()
        assert len(history) == 1
