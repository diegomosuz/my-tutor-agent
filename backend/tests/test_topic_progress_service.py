"""Tests de `app/services/topic_progress_service.py` (v1.7.0, Bloque 2)
contra Postgres REAL (ver `tests/conftest.py::TEST_DATABASE_URL`)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models import AppUser
from app.db.session import get_engine
from app.models.progress import LegacyImportTopicEntry
from app.services import topic_progress_service as svc
from tests.conftest import TEST_DATABASE_URL

COURSE = "curso-demo"
MODULE = "modulo-1"
TOPIC = "topico-1"


def _session() -> Session:
    return Session(get_engine(TEST_DATABASE_URL))


def _uid() -> uuid.UUID:
    """Crea un AppUser real (topic_progress.user_id tiene FK -> app_users.id)
    en una sesión/transacción propia y corta, y devuelve su id."""
    session = _session()
    try:
        user = AppUser()
        session.add(user)
        session.commit()
        return user.id
    finally:
        session.close()


def test_no_row_means_not_started_by_absence():
    session = _session()
    try:
        rows = svc.get_course_progress(session, _uid(), COURSE)
        assert rows == []
    finally:
        session.close()


def test_mark_started_creates_in_progress_row():
    session = _session()
    try:
        user_id = _uid()
        row = svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "start")
        session.commit()
        assert row.status == "in_progress"
        assert row.started_at is not None
        assert row.completed_at is None
    finally:
        session.close()


def test_mark_started_is_idempotent_single_row():
    session = _session()
    try:
        user_id = _uid()
        svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "start")
        session.commit()
        svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "start")
        session.commit()
        rows = svc.get_course_progress(session, user_id, COURSE)
        assert len(rows) == 1
        assert rows[0].status == "in_progress"
    finally:
        session.close()


def test_mark_completed_is_idempotent_and_preserves_first_completed_at():
    session = _session()
    try:
        user_id = _uid()
        first = svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "complete")
        session.commit()
        first_completed_at = first.completed_at

        second = svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "complete")
        session.commit()
        assert second.completed_at == first_completed_at

        rows = svc.get_course_progress(session, user_id, COURSE)
        assert len(rows) == 1
    finally:
        session.close()


def test_status_never_downgrades_completed_to_in_progress():
    session = _session()
    try:
        user_id = _uid()
        svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "complete")
        session.commit()
        row = svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "start")
        session.commit()
        assert row.status == "completed"
    finally:
        session.close()


def test_complete_after_start_preserves_original_started_at():
    session = _session()
    try:
        user_id = _uid()
        started = svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "start")
        session.commit()
        original_started_at = started.started_at

        completed = svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "complete")
        session.commit()
        assert completed.started_at == original_started_at
        assert completed.status == "completed"
    finally:
        session.close()


def test_two_different_users_isolated():
    session = _session()
    try:
        user_a, user_b = _uid(), _uid()
        svc.mark_topic_progress(session, user_a, COURSE, MODULE, TOPIC, "complete")
        session.commit()
        rows_a = svc.get_course_progress(session, user_a, COURSE)
        rows_b = svc.get_course_progress(session, user_b, COURSE)
        assert len(rows_a) == 1
        assert rows_b == []
    finally:
        session.close()


def test_delete_course_progress_removes_only_that_course():
    session = _session()
    try:
        user_id = _uid()
        svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "complete")
        svc.mark_topic_progress(session, user_id, "otro-curso", MODULE, TOPIC, "complete")
        session.commit()

        svc.delete_course_progress(session, user_id, COURSE)
        session.commit()

        assert svc.get_course_progress(session, user_id, COURSE) == []
        assert len(svc.get_course_progress(session, user_id, "otro-curso")) == 1
    finally:
        session.close()


# --- Merge policy (legacy import) ------------------------------------------


def _entry(topic_id: str, status: str, started_at=None, completed_at=None) -> LegacyImportTopicEntry:
    return LegacyImportTopicEntry(
        module_id=MODULE, topic_id=topic_id, status=status, started_at=started_at, completed_at=completed_at
    )


def test_legacy_import_creates_new_topic_when_server_empty():
    session = _session()
    try:
        user_id = _uid()
        started = datetime(2025, 1, 1, tzinfo=timezone.utc)
        svc.import_legacy_progress(session, user_id, COURSE, [_entry(TOPIC, "in_progress", started_at=started)])
        session.commit()
        rows = svc.get_course_progress(session, user_id, COURSE)
        assert len(rows) == 1
        assert rows[0].status == "in_progress"
        assert rows[0].started_at == started
    finally:
        session.close()


def test_legacy_import_never_downgrades_server_completed():
    session = _session()
    try:
        user_id = _uid()
        svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "complete")
        session.commit()

        svc.import_legacy_progress(
            session, user_id, COURSE, [_entry(TOPIC, "in_progress", started_at=datetime(2020, 1, 1, tzinfo=timezone.utc))]
        )
        session.commit()

        rows = svc.get_course_progress(session, user_id, COURSE)
        assert rows[0].status == "completed"
    finally:
        session.close()


def test_legacy_import_upgrades_server_in_progress_to_completed():
    session = _session()
    try:
        user_id = _uid()
        svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "start")
        session.commit()

        completed_at = datetime(2025, 6, 1, tzinfo=timezone.utc)
        svc.import_legacy_progress(
            session, user_id, COURSE,
            [_entry(TOPIC, "completed", started_at=datetime(2025, 1, 1, tzinfo=timezone.utc), completed_at=completed_at)],
        )
        session.commit()

        rows = svc.get_course_progress(session, user_id, COURSE)
        assert rows[0].status == "completed"
        assert rows[0].completed_at == completed_at
    finally:
        session.close()


def test_legacy_import_timestamp_merge_keeps_earliest_started_at():
    session = _session()
    try:
        user_id = _uid()
        later = datetime(2026, 1, 1, tzinfo=timezone.utc)
        earlier = datetime(2024, 1, 1, tzinfo=timezone.utc)

        svc.mark_topic_progress(session, user_id, COURSE, MODULE, TOPIC, "start")
        session.commit()
        # Simula que el started_at real (server) es `later` (created "now").
        rows = svc.get_course_progress(session, user_id, COURSE)
        rows[0].started_at = later
        session.commit()

        svc.import_legacy_progress(session, user_id, COURSE, [_entry(TOPIC, "in_progress", started_at=earlier)])
        session.commit()

        rows = svc.get_course_progress(session, user_id, COURSE)
        assert rows[0].started_at == earlier
    finally:
        session.close()


def test_legacy_import_is_idempotent():
    session = _session()
    try:
        user_id = _uid()
        entry = _entry(TOPIC, "completed", started_at=datetime(2025, 1, 1, tzinfo=timezone.utc), completed_at=datetime(2025, 1, 2, tzinfo=timezone.utc))
        svc.import_legacy_progress(session, user_id, COURSE, [entry])
        session.commit()
        svc.import_legacy_progress(session, user_id, COURSE, [entry])
        session.commit()

        rows = svc.get_course_progress(session, user_id, COURSE)
        assert len(rows) == 1
        assert rows[0].status == "completed"
    finally:
        session.close()


def test_legacy_import_multiple_topics_and_courses():
    session = _session()
    try:
        user_id = _uid()
        svc.import_legacy_progress(
            session, user_id, COURSE,
            [_entry("topico-a", "completed", completed_at=datetime(2025, 1, 1, tzinfo=timezone.utc)),
             _entry("topico-b", "in_progress", started_at=datetime(2025, 1, 1, tzinfo=timezone.utc))],
        )
        session.commit()
        rows = svc.get_course_progress(session, user_id, COURSE)
        assert {r.topic_id for r in rows} == {"topico-a", "topico-b"}
    finally:
        session.close()
