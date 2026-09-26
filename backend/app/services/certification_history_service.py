"""Historial de Certification server-side (v1.7.0, Bloque 3). PostgreSQL
es la fuente de verdad desde este bloque -- ver
docs/SERVER_SIDE_PROFILE_V1_7.md sección "Bloque 3".

Regla dura: este módulo NUNCA persiste `question_results` (respuestas
individuales/answer key/explicaciones) -- solo agregados ya públicos,
exactamente los mismos que el frontend guardaba en `localStorage` antes de
este bloque (`CertificationAttemptSummary`). Tampoco valida que
`course_id`/`module_id`/`topic_id` existan en el filesystem de cursos --
esa validación vive en el router, igual que en
`topic_progress_service.py`.

Idempotencia/carreras: mismo patrón ya probado en Bloque 1/2
(`IntegrityError` + retry ante `UNIQUE(user_id, practice_id)`) -- un
reintento de red del mismo submit, o reimportar el mismo intento legacy,
nunca crea una fila duplicada ni sobrescribe evidencia ya persistida.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db.models import CertificationAttempt, CertificationTopicResult
from app.models.certification import (
    CertificationAttemptEntry,
    CertificationAttemptOrigin,
    CertificationMode,
    CertificationPracticeResult,
    CompetencyBreakdown,
    LegacyCertificationAttemptEntry,
    TopicBreakdown,
)
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.certification")

# PASO 19 de la especificación: "persistir más pero devolver/usar máximo
# 50" -- decisión explícita (nunca truncar la persistencia: Postgres no
# tiene la limitación de cuota de localStorage que originó el límite de
# 50; truncar acá perdería evidencia real para siempre sin necesidad). El
# límite se aplica únicamente al SERVIR/usar historial, reproduciendo el
# comportamiento observable exacto de antes.
HISTORY_SERVE_LIMIT = 50


def _topics_to_reinforce(by_topic: list[TopicBreakdown]) -> list[TopicBreakdown]:
    return sorted(
        [t for t in by_topic if t.incorrect > 0 or t.partially_correct > 0],
        key=lambda t: t.practice_score_percent,
    )


def _row_to_entry(attempt: CertificationAttempt) -> CertificationAttemptEntry:
    by_topic = [
        TopicBreakdown(
            module_id=r.module_id,
            topic_id=r.topic_id,
            attempted=r.attempted,
            correct=r.correct,
            partially_correct=r.partially_correct,
            incorrect=r.incorrect,
            unanswered=r.unanswered,
            practice_score_percent=r.score_percent,
        )
        for r in sorted(attempt.topic_results, key=lambda r: (r.module_id, r.topic_id))
    ]
    module_ids = sorted({r.module_id for r in attempt.topic_results})
    topic_ids = sorted({r.topic_id for r in attempt.topic_results})
    competencies = [CompetencyBreakdown(**c) for c in attempt.competency_breakdown]

    return CertificationAttemptEntry(
        attempt_id=attempt.practice_id,
        course_id=attempt.course_id,
        mode=CertificationMode(attempt.mode),
        module_ids=module_ids,
        topic_ids=topic_ids,
        question_count=attempt.total_questions,
        answered_count=attempt.total_questions - attempt.unanswered_count,
        correct_count=attempt.correct_count,
        partial_count=attempt.partially_correct_count,
        incorrect_count=attempt.incorrect_count,
        unanswered_count=attempt.unanswered_count,
        score_percentage=attempt.score_percent,
        completed_at=attempt.attempted_at.isoformat(),
        performance_by_topic=by_topic,
        competencies_to_reinforce=competencies,
        topics_to_reinforce=_topics_to_reinforce(by_topic),
        origin=CertificationAttemptOrigin(attempt.origin),
    )


def _find_by_practice_id(session: Session, user_id: uuid.UUID, practice_id: str) -> CertificationAttempt | None:
    stmt = (
        select(CertificationAttempt)
        .where(CertificationAttempt.user_id == user_id, CertificationAttempt.practice_id == practice_id)
        .options(selectinload(CertificationAttempt.topic_results))
    )
    return session.execute(stmt).scalar_one_or_none()


def get_history(
    session: Session, user_id: uuid.UUID, course_id: str, limit: int = HISTORY_SERVE_LIMIT
) -> list[CertificationAttemptEntry]:
    stmt = (
        select(CertificationAttempt)
        .where(CertificationAttempt.user_id == user_id, CertificationAttempt.course_id == course_id)
        .options(selectinload(CertificationAttempt.topic_results))
        # Tie-break estable ante timestamps iguales: created_at (orden real
        # de inserción), nunca depende de que attempted_at sea único.
        .order_by(CertificationAttempt.attempted_at.desc(), CertificationAttempt.created_at.desc())
        .limit(limit)
    )
    rows = session.execute(stmt).scalars().all()
    return [_row_to_entry(r) for r in rows]


def persist_attempt(
    session: Session,
    user_id: uuid.UUID,
    course_id: str,
    practice_id: str,
    mode: CertificationMode,
    result: CertificationPracticeResult,
) -> CertificationAttemptEntry:
    """Persiste el resultado YA evaluado determinísticamente por
    `certification_service.evaluate_simulation` (nunca recibe ni confía en
    un score enviado por el cliente). Idempotente: un practice_id repetido
    (reintento de red) nunca crea una segunda fila -- devuelve la evidencia
    YA persistida en su primer submit real, sin importar si `result`
    recalculado ahora difiere (primer-submit-gana, ver
    docs/SERVER_SIDE_PROFILE_V1_7.md)."""
    existing = _find_by_practice_id(session, user_id, practice_id)
    if existing is not None:
        log_event(
            logger, "certification_attempt_persisted", user_id=str(user_id), course_id=course_id,
            created=False,
        )
        return _row_to_entry(existing)

    now = datetime.now(timezone.utc)
    attempt = CertificationAttempt(
        user_id=user_id,
        course_id=course_id,
        practice_id=practice_id,
        mode=mode.value,
        total_questions=result.total_questions,
        correct_count=result.correct,
        partially_correct_count=result.partially_correct,
        incorrect_count=result.incorrect,
        unanswered_count=result.unanswered,
        score_percent=result.practice_score_percent,
        competency_breakdown=[c.model_dump() for c in result.by_competency],
        origin=CertificationAttemptOrigin.server_evaluated.value,
        attempted_at=now,
    )
    attempt.topic_results = [
        CertificationTopicResult(
            module_id=t.module_id,
            topic_id=t.topic_id,
            attempted=t.attempted,
            correct=t.correct,
            partially_correct=t.partially_correct,
            incorrect=t.incorrect,
            unanswered=t.unanswered,
            score_percent=t.practice_score_percent,
        )
        for t in result.by_topic
    ]
    session.add(attempt)
    try:
        session.flush()
    except IntegrityError:
        # Carrera real: otra request con el mismo practice_id ganó primero
        # (ver mismo patrón en identity_resolver.py/topic_progress_service.py).
        session.rollback()
        existing = _find_by_practice_id(session, user_id, practice_id)
        if existing is None:
            raise
        log_event(
            logger, "certification_attempt_persisted", user_id=str(user_id), course_id=course_id,
            created=False, race_lost=True,
        )
        return _row_to_entry(existing)

    log_event(logger, "certification_attempt_persisted", user_id=str(user_id), course_id=course_id, created=True)
    return _row_to_entry(attempt)


def import_legacy_attempts(
    session: Session,
    user_id: uuid.UUID,
    course_id: str,
    entries: list[LegacyCertificationAttemptEntry],
) -> None:
    """Fusiona un snapshot legacy de `localStorage`. Un `practice_id` que
    ya existe (server-evaluated O legacy previamente importado) se
    descarta en silencio -- NUNCA sobrescribe evidencia ya persistida (PASO
    40: server evidence nunca degradada por legacy)."""
    imported = 0
    for entry in entries:
        if _find_by_practice_id(session, user_id, entry.practice_id) is not None:
            continue

        try:
            completed_at = datetime.fromisoformat(entry.completed_at.replace("Z", "+00:00"))
        except ValueError:
            continue  # timestamp inválido: entrada descartada, no rompe el import completo.

        attempt = CertificationAttempt(
            user_id=user_id,
            course_id=course_id,
            practice_id=entry.practice_id,
            mode=entry.mode.value,
            total_questions=entry.question_count,
            correct_count=entry.correct_count,
            partially_correct_count=entry.partial_count,
            incorrect_count=entry.incorrect_count,
            unanswered_count=entry.unanswered_count,
            score_percent=entry.score_percentage,
            competency_breakdown=[c.model_dump() for c in entry.competencies_to_reinforce],
            origin=CertificationAttemptOrigin.legacy_import.value,
            attempted_at=completed_at,
        )
        attempt.topic_results = [
            CertificationTopicResult(
                module_id=t.module_id,
                topic_id=t.topic_id,
                attempted=t.attempted,
                correct=t.correct,
                partially_correct=t.partially_correct,
                incorrect=t.incorrect,
                unanswered=t.unanswered,
                score_percent=t.practice_score_percent,
            )
            for t in entry.performance_by_topic
        ]
        session.add(attempt)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            continue  # carrera con otra request: se descarta, nunca duplica.
        imported += 1

    log_event(
        logger, "legacy_certification_import_completed", user_id=str(user_id), course_id=course_id,
        entry_count=len(entries), imported_count=imported,
    )


def delete_history(session: Session, user_id: uuid.UUID, course_id: str) -> None:
    stmt = delete(CertificationAttempt).where(
        CertificationAttempt.user_id == user_id, CertificationAttempt.course_id == course_id
    )
    session.execute(stmt)
    log_event(logger, "certification_history_reset", user_id=str(user_id), course_id=course_id)
