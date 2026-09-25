"""PASO 22/75: concurrencia real (threads + Postgres real, nunca mockeada)
sobre `mark_topic_progress`. Estado final siempre: una sola fila,
`completed` gana sobre `in_progress` sin importar el orden real de
llegada."""
from __future__ import annotations

import threading
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import AppUser
from app.db.session import get_engine
from app.services import topic_progress_service as svc
from tests.conftest import TEST_DATABASE_URL

COURSE = "curso-demo"
MODULE = "modulo-1"
TOPIC = "topico-1"


def _create_app_user() -> uuid.UUID:
    session = Session(get_engine(TEST_DATABASE_URL))
    try:
        user = AppUser()
        session.add(user)
        session.commit()
        return user.id
    finally:
        session.close()


def _run_concurrent(user_id: uuid.UUID, actions: list[str]) -> list[Exception]:
    engine = get_engine(TEST_DATABASE_URL)
    errors: list[Exception] = []
    barrier = threading.Barrier(len(actions))

    def _worker(action: str) -> None:
        session = Session(engine)
        try:
            barrier.wait()
            svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, action)
            session.commit()
        except Exception as exc:  # pragma: no cover - solo si algo real falla
            errors.append(exc)
        finally:
            session.close()

    threads = [threading.Thread(target=_worker, args=(a,)) for a in actions]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return errors


def _row_count_and_status(user_id: uuid.UUID) -> tuple[int, str | None]:
    session = Session(get_engine(TEST_DATABASE_URL))
    try:
        rows = svc.get_course_progress(session, user_id, COURSE)
        return len(rows), (rows[0].status if rows else None)
    finally:
        session.close()


def test_concurrent_start_start_never_duplicates_row():
    user_id = _create_app_user()
    errors = _run_concurrent(user_id, ["start", "start", "start", "start", "start"])
    assert not errors
    count, status = _row_count_and_status(user_id)
    assert count == 1
    assert status == "in_progress"


def test_concurrent_start_complete_always_ends_completed():
    user_id = _create_app_user()
    errors = _run_concurrent(user_id, ["start", "complete", "start", "complete", "start"])
    assert not errors
    count, status = _row_count_and_status(user_id)
    assert count == 1
    assert status == "completed"


def test_concurrent_complete_complete_never_duplicates_row():
    user_id = _create_app_user()
    errors = _run_concurrent(user_id, ["complete", "complete", "complete"])
    assert not errors
    count, status = _row_count_and_status(user_id)
    assert count == 1
    assert status == "completed"


def test_repeated_concurrency_run_is_consistent():
    """Corre el escenario start/complete varias veces con usuarios
    distintos para reducir la chance de que una sola corrida 'suerte' un
    resultado correcto sin ejercitar la carrera real."""
    for _ in range(5):
        user_id = _create_app_user()
        errors = _run_concurrent(user_id, ["start", "complete"])
        assert not errors
        count, status = _row_count_and_status(user_id)
        assert count == 1
        assert status == "completed"
