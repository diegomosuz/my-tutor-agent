"""Tests de integración de `app/services/learning_profile_service.py`
(v1.7.0, Bloque 4) contra Postgres REAL + el curriculum real de
`content_dir` (ver conftest.py: curso-de-prueba/fundamentos/
{introduccion,componentes}, arquitecturas/arquitectura-empresarial).

Cubre el invariante CRÍTICO del bloque (PASO 9/10/66): solo el top-50 de
Certification history (ya aplicado por certification_history_service, ver
Bloque 3) participa de la derivación -- evidencia más antigua que ya
quedó fuera de esos 50 nunca resucita."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import AppUser
from app.db.session import get_engine
from app.models.certification import LegacyCertificationAttemptEntry
from app.services import certification_history_service, learning_profile_service, topic_progress_service
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


def test_empty_user_all_not_started(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        profile = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        assert profile.summary.total_topics == 3
        assert profile.summary.not_started == 3
        assert all(s.status == "not_started" for s in profile.states)
    finally:
        session.close()


def test_curricular_progress_reflected_without_assessment(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        topic_progress_service.mark_topic_progress(
            session, user_id, COURSE, MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, "complete"
        )
        session.commit()

        profile = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        by_topic = {s.topic_id: s for s in profile.states}
        assert by_topic[TOPIC_INTRODUCCION].status == "progressing"
        assert by_topic[TOPIC_INTRODUCCION].reason_code == "COMPLETED_NO_ASSESSMENT"
        assert by_topic[TOPIC_INTRODUCCION].evidence.status == "completed"
    finally:
        session.close()


def test_mixed_course_states(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        topic_progress_service.mark_topic_progress(
            session, user_id, COURSE, MODULE_FUNDAMENTOS, TOPIC_COMPONENTES, "start"
        )
        session.commit()
        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE,
            [
                _legacy_entry("p1", MODULE_ARQUITECTURAS, TOPIC_ARQUITECTURA, 20, "2026-01-01T00:00:00+00:00"),
            ],
        )
        session.commit()

        profile = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        by_topic = {s.topic_id: s for s in profile.states}
        assert by_topic[TOPIC_INTRODUCCION].status == "not_started"
        assert by_topic[TOPIC_COMPONENTES].status == "progressing"
        assert by_topic[TOPIC_COMPONENTES].reason_code == "STARTED_NOT_COMPLETED"
        assert by_topic[TOPIC_ARQUITECTURA].status == "needs_review"
        assert by_topic[TOPIC_ARQUITECTURA].reason_code == "LOW_CERTIFICATION_SCORE"

        summary = profile.summary
        assert summary.not_started + summary.progressing + summary.needs_review + summary.mastered == 3
    finally:
        session.close()


def test_stale_topic_progress_never_appears_in_profile(content_dir):
    """Progreso persistido para un módulo/tópico que ya no existe en el
    curriculum real -- inalcanzable vía el endpoint normal (que valida
    contra el curriculum, ver progress.py), pero puede existir por datos
    viejos; el profile nunca debe generar un LearningState fantasma."""
    user_id = _create_app_user()
    session = _session()
    try:
        from app.db.models import TopicProgress
        from datetime import datetime, timezone

        stale = TopicProgress(
            user_id=user_id, course_id=COURSE, module_id="modulo-fantasma", topic_id="topico-fantasma",
            status="completed", started_at=datetime.now(timezone.utc), completed_at=datetime.now(timezone.utc),
        )
        session.add(stale)
        session.commit()

        profile = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        assert profile.summary.total_topics == 3  # nunca 4
        assert all(s.topic_id != "topico-fantasma" for s in profile.states)
    finally:
        session.close()


def test_stale_certification_evidence_never_appears_in_profile(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE,
            [_legacy_entry("p-stale", "modulo-fantasma", "topico-fantasma", 90, "2026-01-01T00:00:00+00:00")],
        )
        session.commit()

        profile = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        # La evidencia del tópico fantasma no participa de NINGÚN tópico
        # real -- los 3 tópicos reales siguen not_started.
        assert all(s.status == "not_started" for s in profile.states)
    finally:
        session.close()


def test_two_users_isolated(content_dir):
    user_a, user_b = _create_app_user(), _create_app_user()
    session = _session()
    try:
        topic_progress_service.mark_topic_progress(
            session, user_a, COURSE, MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, "complete"
        )
        session.commit()

        profile_a = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_a, course_id=COURSE
        )
        profile_b = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_b, course_id=COURSE
        )
        assert profile_a.summary.progressing == 1
        assert profile_b.summary.not_started == 3
    finally:
        session.close()


def test_determinism_same_input_same_output(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        topic_progress_service.mark_topic_progress(
            session, user_id, COURSE, MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, "complete"
        )
        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE,
            [_legacy_entry("p1", MODULE_FUNDAMENTOS, TOPIC_COMPONENTES, 45, "2026-01-01T00:00:00+00:00")],
        )
        session.commit()

        first = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        second = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        assert first.model_dump() == second.model_dump()
    finally:
        session.close()


def test_get_profile_is_read_only(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        topic_progress_service.mark_topic_progress(
            session, user_id, COURSE, MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, "start"
        )
        session.commit()

        from sqlalchemy import func, select
        from app.db.models import TopicProgress, CertificationAttempt

        before_progress = session.execute(select(func.count()).select_from(TopicProgress)).scalar_one()
        before_attempts = session.execute(select(func.count()).select_from(CertificationAttempt)).scalar_one()

        learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        session.commit()  # si hubiera escrituras pendientes, esto las confirmaría

        after_progress = session.execute(select(func.count()).select_from(TopicProgress)).scalar_one()
        after_attempts = session.execute(select(func.count()).select_from(CertificationAttempt)).scalar_one()

        assert before_progress == after_progress
        assert before_attempts == after_attempts
    finally:
        session.close()


def test_invalid_course_raises_course_not_found(content_dir):
    from app.services import courses as course_service

    user_id = _create_app_user()
    session = _session()
    try:
        try:
            learning_profile_service.get_learning_profile(
                settings=_settings(content_dir), session=session, user_id=user_id, course_id="curso-que-no-existe"
            )
            assert False, "debería haber lanzado CourseNotFoundError"
        except course_service.CourseNotFoundError:
            pass
    finally:
        session.close()


# --- Invariante crítico: TOP-50 course attempts (PASO 9/10/66) -------------


def test_sparse_topic_evidence_outside_top_50_never_participates(content_dir):
    """REGRESIÓN OBLIGATORIA (PASO 10): un curso con 51 attempts, donde un
    tópico X solo aparece en el attempt MÁS ANTIGUO (que queda fuera del
    top-50 servido por certification_history_service). Esa evidencia NUNCA
    debe participar de LearningState -- igual que el comportamiento
    histórico de v1.6.x (localStorage nunca guardaba más de 50)."""
    user_id = _create_app_user()
    session = _session()
    try:
        entries = [
            _legacy_entry(
                "oldest-with-arquitectura-evidence", MODULE_ARQUITECTURAS, TOPIC_ARQUITECTURA, 90,
                "2020-01-01T00:00:00+00:00",  # el más antiguo de todos -> queda fuera del top-50
            )
        ]
        base = datetime(2025, 1, 1, tzinfo=timezone.utc)
        for i in range(50):
            entries.append(
                _legacy_entry(
                    f"recent-{i}", MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, 50,
                    (base + timedelta(days=i)).isoformat(),
                )
            )
        certification_history_service.import_legacy_attempts(session, user_id, COURSE, entries)
        session.commit()

        # Confirma que efectivamente hay 51 attempts persistidos (nunca se
        # truncó la PERSISTENCIA, solo lo que se SIRVE/usa).
        from sqlalchemy import func, select
        from app.db.models import CertificationAttempt

        total_persisted = session.execute(
            select(func.count()).select_from(CertificationAttempt).where(CertificationAttempt.user_id == user_id)
        ).scalar_one()
        assert total_persisted == 51

        profile = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        by_topic = {s.topic_id: s for s in profile.states}
        # El tópico cuya ÚNICA evidencia quedó fuera del top-50: sin
        # observaciones, sin progreso curricular -> not_started real.
        assert by_topic[TOPIC_ARQUITECTURA].evidence.observations == 0
        assert by_topic[TOPIC_ARQUITECTURA].status == "not_started"
    finally:
        session.close()


def test_exactly_50_attempts_all_within_window_participate(content_dir):
    user_id = _create_app_user()
    session = _session()
    try:
        base = datetime(2025, 1, 1, tzinfo=timezone.utc)
        entries = [
            _legacy_entry(f"attempt-{i}", MODULE_FUNDAMENTOS, TOPIC_INTRODUCCION, 20, (base + timedelta(days=i)).isoformat())
            for i in range(50)
        ]
        certification_history_service.import_legacy_attempts(session, user_id, COURSE, entries)
        session.commit()

        profile = learning_profile_service.get_learning_profile(
            settings=_settings(content_dir), session=session, user_id=user_id, course_id=COURSE
        )
        by_topic = {s.topic_id: s for s in profile.states}
        # Con 50 intentos reales (todos low=20), aunque la ventana de
        # observaciones sea de 3, el status sigue siendo needs_review real
        # (evidencia real dentro del top-50, nunca excluida).
        assert by_topic[TOPIC_INTRODUCCION].status == "needs_review"
        assert by_topic[TOPIC_INTRODUCCION].evidence.observations == 3
    finally:
        session.close()


# --- Duplicate topic slug entre módulos (integración completa) -------------


def test_duplicate_topic_slug_across_modules_integration(tmp_path):
    """Curriculum custom con el mismo topic slug en dos módulos distintos
    -- confirma que la integración completa (curriculum real + Postgres)
    los mantiene separados, no solo el core puro (ya cubierto en
    test_learning_state.py)."""
    course_dir = tmp_path / "01-curso-duplicado"
    course_dir.mkdir()
    module_a = course_dir / "01-modulo-a"
    module_a.mkdir()
    (module_a / "01-comun.md").write_text("# Común A\n\nContenido A.\n", encoding="utf-8")
    module_b = course_dir / "02-modulo-b"
    module_b.mkdir()
    (module_b / "01-comun.md").write_text("# Común B\n\nContenido B.\n", encoding="utf-8")

    user_id = _create_app_user()
    session = _session()
    try:
        topic_progress_service.mark_topic_progress(session, user_id, "curso-duplicado", "modulo-a", "comun", "complete")
        session.commit()
        certification_history_service.import_legacy_attempts(
            session, user_id, "curso-duplicado",
            [_legacy_entry("p1", "modulo-b", "comun", 90, "2026-01-01T00:00:00+00:00")],
        )
        session.commit()

        profile = learning_profile_service.get_learning_profile(
            settings=_settings(tmp_path), session=session, user_id=user_id, course_id="curso-duplicado"
        )
        by_module = {s.module_id: s for s in profile.states}
        assert by_module["modulo-a"].status == "progressing"
        assert by_module["modulo-a"].reason_code == "COMPLETED_NO_ASSESSMENT"
        assert by_module["modulo-b"].status == "mastered"
        assert by_module["modulo-b"].reason_code == "HIGH_CERTIFICATION_SCORE"
    finally:
        session.close()
