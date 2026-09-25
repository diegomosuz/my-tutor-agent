"""Progreso curricular por tópico (v1.7.0, Bloque 2). PostgreSQL es la
fuente de verdad desde este bloque -- ver docs/SERVER_SIDE_PROFILE_V1_7.md.

Regla dura: este módulo NUNCA valida que `course_id`/`module_id`/
`topic_id` existan en el filesystem de cursos -- esa validación vive en el
router (`app/routers/progress.py`), que ya reutiliza el repositorio seguro
existente (`app/services/courses.py`) antes de llamar acá. Esto evita
acoplar la tabla de progreso al filesystem y mantiene esta capa testeable
con Postgres real sin necesitar un curso de verdad en disco.

Ratchet (nunca degrada `completed` -> `in_progress`) y carrera de creación
(unique constraint + retry ante `IntegrityError`) siguen exactamente el
mismo patrón ya probado en `app/services/identity_resolver.py` (Bloque 1).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import TopicProgress
from app.models.progress import LegacyImportTopicEntry, TopicProgressStatus
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.progress")


def _find_row(
    session: Session, user_id: uuid.UUID, course_id: str, module_id: str, topic_id: str
) -> TopicProgress | None:
    stmt = select(TopicProgress).where(
        TopicProgress.user_id == user_id,
        TopicProgress.course_id == course_id,
        TopicProgress.module_id == module_id,
        TopicProgress.topic_id == topic_id,
    )
    return session.execute(stmt).scalar_one_or_none()


def get_course_progress(session: Session, user_id: uuid.UUID, course_id: str) -> list[TopicProgress]:
    stmt = select(TopicProgress).where(
        TopicProgress.user_id == user_id, TopicProgress.course_id == course_id
    )
    return list(session.execute(stmt).scalars().all())


def _apply_action_to_existing(row: TopicProgress, action: str, now: datetime) -> TopicProgress:
    if row.started_at is None:
        row.started_at = now
    if action == "complete" and row.status != "completed":
        row.status = "completed"
        row.completed_at = row.completed_at or now
    # action == "start" nunca toca `.status` de una fila ya existente
    # (nunca degrada `completed` -> `in_progress`, y `in_progress` ya
    # sigue siendo el mismo valor -- no-op idempotente).
    return row


def mark_topic_progress(
    session: Session,
    user_id: uuid.UUID,
    course_id: str,
    module_id: str,
    topic_id: str,
    action: str,
) -> TopicProgress:
    """Idempotente y a prueba de carreras: dos requests concurrentes para
    el mismo (user, course, module, topic) nunca crean dos filas, y
    `complete` siempre gana sobre `start` sin importar el orden de
    llegada (ver docstring del módulo)."""
    now = datetime.now(timezone.utc)

    existing = _find_row(session, user_id, course_id, module_id, topic_id)
    if existing is not None:
        _apply_action_to_existing(existing, action, now)
        session.flush()
        log_event(logger, "topic_progress_updated", user_id=str(user_id), action=action, created=False)
        return existing

    new_status: TopicProgressStatus = "completed" if action == "complete" else "in_progress"
    row = TopicProgress(
        user_id=user_id,
        course_id=course_id,
        module_id=module_id,
        topic_id=topic_id,
        status=new_status,
        started_at=now,
        completed_at=now if new_status == "completed" else None,
    )
    session.add(row)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        existing = _find_row(session, user_id, course_id, module_id, topic_id)
        if existing is None:
            raise
        _apply_action_to_existing(existing, action, now)
        session.flush()
        log_event(
            logger, "topic_progress_updated", user_id=str(user_id), action=action, created=False, race_lost=True
        )
        return existing

    log_event(logger, "topic_progress_updated", user_id=str(user_id), action=action, created=True)
    return row


def _merge_legacy_entry_into_existing(row: TopicProgress, entry: LegacyImportTopicEntry) -> None:
    # Status: completed > in_progress, nunca degrada un valor ya alcanzado.
    if entry.status == "completed" and row.status != "completed":
        row.status = "completed"

    # Timestamps: la primera ocurrencia histórica real gana (el mínimo
    # válido), nunca `datetime.now()` reemplazando un timestamp histórico.
    if entry.started_at is not None and (row.started_at is None or entry.started_at < row.started_at):
        row.started_at = entry.started_at

    if row.status == "completed":
        candidate = entry.completed_at if entry.status == "completed" else None
        if candidate is not None and (row.completed_at is None or candidate < row.completed_at):
            row.completed_at = candidate


def import_legacy_progress(
    session: Session, user_id: uuid.UUID, course_id: str, entries: list[LegacyImportTopicEntry]
) -> None:
    """Fusiona un snapshot legacy de `localStorage` (ya filtrado por el
    router contra el curriculum real) con el progreso server-side
    existente. Nunca degrada progreso ya persistido (PASO 38): server
    completed + legacy in_progress -> completed; server in_progress +
    legacy completed -> completed."""
    imported = 0
    for entry in entries:
        existing = _find_row(session, user_id, course_id, entry.module_id, entry.topic_id)
        if existing is not None:
            _merge_legacy_entry_into_existing(existing, entry)
            continue

        row = TopicProgress(
            user_id=user_id,
            course_id=course_id,
            module_id=entry.module_id,
            topic_id=entry.topic_id,
            status=entry.status,
            started_at=entry.started_at,
            completed_at=entry.completed_at if entry.status == "completed" else None,
        )
        session.add(row)
        try:
            session.flush()
        except IntegrityError:
            # Carrera con otra request (ej. un mark_topic_progress
            # concurrente creando la misma fila): descarta el intento de
            # creación y fusiona contra la fila que sí quedó persistida.
            session.rollback()
            existing = _find_row(session, user_id, course_id, entry.module_id, entry.topic_id)
            if existing is None:
                raise
            _merge_legacy_entry_into_existing(existing, entry)
            continue
        imported += 1

    log_event(logger, "topic_progress_import_completed", user_id=str(user_id), entry_count=len(entries))


def delete_course_progress(session: Session, user_id: uuid.UUID, course_id: str) -> None:
    stmt = delete(TopicProgress).where(
        TopicProgress.user_id == user_id, TopicProgress.course_id == course_id
    )
    session.execute(stmt)
    log_event(logger, "topic_progress_reset", user_id=str(user_id))
