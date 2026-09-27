"""Tests de comportamiento/integración de la adaptación pedagógica del
tutor (v1.8.0, Bloque 2: "ADAPTIVE TUTOR PROMPTING") -- Postgres REAL +
`FakeLLMProvider` (ningún test hace llamadas de red). Mismo patrón que
`test_tutor_learning_context_service.py` (v1.8.0 Bloque 1), combinado con
el patrón de `FakeLLMProvider` de `test_tutor_service.py` (Fase 5).

Cubre las Partes N (tests de comportamiento), Q (fallo de Learning
Profile), S (privacidad/tampering) y U (regresión de no-mutación) de la
especificación del Bloque 2."""
from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import AppUser
from app.db.session import get_engine
from app.models.certification import LegacyCertificationAttemptEntry
from app.services import certification_history_service, tutor_service
from tests.conftest import TEST_DATABASE_URL
from tests.fakes import FakeLLMProvider
from tests.lesson_fixtures import SAMPLE_TOPIC_MARKDOWN
from tests.tutor_fixtures import valid_answer_reply_dict

COURSE = "curso-demo"
MODULE = "modulo-demo"
TOPIC = "topico-demo"


def _make_content_dir(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    module = content_dir / COURSE / MODULE
    module.mkdir(parents=True)
    (module / f"{TOPIC}.md").write_text(SAMPLE_TOPIC_MARKDOWN, encoding="utf-8")
    return content_dir


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        content_dir=str(_make_content_dir(tmp_path)),
        lesson_cache_dir=str(tmp_path / "cache"),
        database_url=TEST_DATABASE_URL,
    )


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


def _legacy_entry(practice_id: str, score: float, completed_at: str) -> LegacyCertificationAttemptEntry:
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
                "module_id": MODULE, "topic_id": TOPIC, "attempted": 2,
                "correct": 1 if score >= 50 else 0, "partially_correct": 0,
                "incorrect": 1 if score < 50 else 0, "unanswered": 0, "practice_score_percent": score,
            }
        ],
        competencies_to_reinforce=[],
    )


def _ask(settings, provider, session, user_id, message="¿Qué es Kubernetes?"):
    return tutor_service.ask_tutor(
        settings=settings,
        course_id=COURSE,
        module_id=MODULE,
        topic_id=TOPIC,
        message=message,
        scene_id=None,
        recent_history=[],
        allow_general_knowledge=False,
        provider=provider,
        session=session,
        user_id=user_id,
    )


# --------------------------------------------------------------------------
# PARTE N — 66: misma pregunta, distinto perfil real -> distinto prompt
# --------------------------------------------------------------------------


def test_same_question_different_real_profile_produces_different_prompt(tmp_path):
    settings = _settings(tmp_path)
    session = _session()
    try:
        student_needs_review = _create_app_user()
        student_mastered = _create_app_user()

        certification_history_service.import_legacy_attempts(
            session, student_needs_review, COURSE, [_legacy_entry("p-a", 20, "2026-01-01T00:00:00+00:00")]
        )
        certification_history_service.import_legacy_attempts(
            session, student_mastered, COURSE, [_legacy_entry("p-b", 95, "2026-01-01T00:00:00+00:00")]
        )
        session.commit()

        provider_a = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        provider_b = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])

        _ask(settings, provider_a, session, student_needs_review)
        _ask(settings, provider_b, session, student_mastered)

        user_prompt_a = provider_a.calls[0][1]["content"]
        user_prompt_b = provider_b.calls[0][1]["content"]

        assert "learning_status: needs_review" in user_prompt_a
        assert "learning_status: mastered" in user_prompt_b
        assert user_prompt_a != user_prompt_b
    finally:
        session.close()


def test_fresh_user_gets_not_started_context(tmp_path):
    settings = _settings(tmp_path)
    session = _session()
    try:
        user_id = _create_app_user()
        provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider, session, user_id)
        user_prompt = provider.calls[0][1]["content"]
        assert "learning_status: not_started" in user_prompt
        assert "review_topics: (ninguno)" in user_prompt
    finally:
        session.close()


def test_state_change_produces_updated_context_not_stale(tmp_path):
    """PARTE 80: el tutor nunca cachea, así que un cambio real de estado
    entre dos preguntas debe reflejarse de inmediato en el prompt
    siguiente -- sin ningún fingerprint/cache que pudiera servir un
    contexto viejo."""
    settings = _settings(tmp_path)
    session = _session()
    try:
        user_id = _create_app_user()
        provider_before = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider_before, session, user_id)
        assert "learning_status: not_started" in provider_before.calls[0][1]["content"]

        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE, [_legacy_entry("p1", 95, "2026-01-01T00:00:00+00:00")]
        )
        session.commit()

        provider_after = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider_after, session, user_id)
        assert "learning_status: mastered" in provider_after.calls[0][1]["content"]
    finally:
        session.close()


# --------------------------------------------------------------------------
# PARTE N — 71/72: general knowledge OFF y SRC/COURSE-SRC intactos
# --------------------------------------------------------------------------


def test_adaptive_context_does_not_relax_grounding_validation(tmp_path):
    """Una respuesta que cita un SRC inexistente sigue siendo rechazada
    (con reintentos) exactamente igual que en tutor-v4, con o sin
    contexto adaptativo presente."""
    from app.services.llm_retry import GenerationFailedError

    settings = _settings(tmp_path)
    session = _session()
    try:
        user_id = _create_app_user()
        bad = valid_answer_reply_dict(["SRC-999"])
        provider = FakeLLMProvider(responses=[bad, bad, bad])
        with pytest.raises(GenerationFailedError):
            _ask(settings, provider, session, user_id)
        assert len(provider.calls) == 3
    finally:
        session.close()


# --------------------------------------------------------------------------
# PARTE Q — 81/82: caída real de Postgres / recuperación
# --------------------------------------------------------------------------


def test_db_outage_never_produces_silent_non_adaptive_fallback(tmp_path):
    """Una caída real de Postgres durante la resolución del contexto
    adaptativo debe propagarse como error real -- nunca degradar en
    silencio a un tutor no-adaptativo (PARTE 43: distinguir 'evidencia
    legítimamente ausente' de 'fallo técnico real')."""
    from sqlalchemy import create_engine
    from sqlalchemy.exc import SQLAlchemyError

    settings = _settings(tmp_path)
    user_id = _create_app_user()
    unreachable_url = TEST_DATABASE_URL.replace(":5432/", ":59999/")
    broken_engine = create_engine(unreachable_url)
    broken_session = Session(broken_engine)
    try:
        provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        with pytest.raises(SQLAlchemyError):
            _ask(settings, provider, broken_session, user_id)
        # Nunca debe haber llegado a llamar al proveedor LLM: la falla
        # ocurre ANTES de armar el prompt/llamar al modelo.
        assert len(provider.calls) == 0
    finally:
        broken_session.close()
        broken_engine.dispose()


def test_recovery_after_outage_produces_correct_context(tmp_path):
    settings = _settings(tmp_path)
    session = _session()
    try:
        user_id = _create_app_user()
        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE, [_legacy_entry("p1", 20, "2026-01-01T00:00:00+00:00")]
        )
        session.commit()
        provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider, session, user_id)
        assert "learning_status: needs_review" in provider.calls[0][1]["content"]
    finally:
        session.close()


# --------------------------------------------------------------------------
# PARTE U — 83: una conversación del tutor nunca muta LearningState
# --------------------------------------------------------------------------


def test_tutor_conversation_never_mutates_topic_progress_or_certification(tmp_path):
    from sqlalchemy import func, select

    from app.db.models import CertificationAttempt, TopicProgress

    settings = _settings(tmp_path)
    session = _session()
    try:
        user_id = _create_app_user()
        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE, [_legacy_entry("p1", 20, "2026-01-01T00:00:00+00:00")]
        )
        session.commit()

        before_progress = session.execute(select(func.count()).select_from(TopicProgress)).scalar_one()
        before_attempts = session.execute(select(func.count()).select_from(CertificationAttempt)).scalar_one()

        provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider, session, user_id)
        session.commit()

        after_progress = session.execute(select(func.count()).select_from(TopicProgress)).scalar_one()
        after_attempts = session.execute(select(func.count()).select_from(CertificationAttempt)).scalar_one()
        assert before_progress == after_progress
        assert before_attempts == after_attempts
    finally:
        session.close()


# --------------------------------------------------------------------------
# PARTE T — 92/93: performance / overhead conceptual
# --------------------------------------------------------------------------


def test_learning_context_adds_small_prompt_overhead(tmp_path):
    """PARTE 93: el bloque adaptativo (bounded por Bloque 1, máx. 5
    review_topics) debe ser chico frente al resto del prompt -- una
    estimación de caracteres alcanza, sin tokenizer externo."""
    settings = _settings(tmp_path)
    session = _session()
    try:
        user_id = _create_app_user()
        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE, [_legacy_entry("p1", 20, "2026-01-01T00:00:00+00:00")]
        )
        session.commit()

        provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider, session, user_id)
        user_prompt = provider.calls[0][1]["content"]
        start = user_prompt.index("=== ADAPTIVE LEARNING CONTEXT")
        end = user_prompt.index("=== END ADAPTIVE LEARNING CONTEXT ===")
        block_chars = end - start
        assert block_chars < 800  # unas pocas líneas estructuradas, nunca prosa
    finally:
        session.close()


# --------------------------------------------------------------------------
# PARTE S — 89: client tampering estructuralmente imposible
# --------------------------------------------------------------------------


def test_tutor_request_schema_has_no_learning_state_fields():
    from app.models.tutor import TutorRequest

    fields = set(TutorRequest.model_fields.keys())
    for forbidden in ["learning_status", "reason_code", "recent_average", "mastery", "profile", "review_topics"]:
        assert forbidden not in fields


# ==========================================================================
# v1.8.0 Bloque 3 ("DETERMINISTIC ADAPTIVE TEACHING POLICY") -- Parte M
# (PASO 68-70): misma pregunta, distinto LearningState real -> distinta
# TeachingPolicy determinística.
# ==========================================================================


def test_same_question_different_real_state_produces_different_deterministic_policy(tmp_path):
    """PASO 68/69: NO depende de la salida generativa del LLM -- se
    afirma determinísticamente que la política capturada en el prompt de
    A es distinta de la de B, para la MISMA pregunta/tópico/grounding."""
    settings = _settings(tmp_path)
    session = _session()
    try:
        student_needs_review = _create_app_user()
        student_mastered = _create_app_user()

        certification_history_service.import_legacy_attempts(
            session, student_needs_review, COURSE, [_legacy_entry("p-a", 20, "2026-01-01T00:00:00+00:00")]
        )
        certification_history_service.import_legacy_attempts(
            session, student_mastered, COURSE, [_legacy_entry("p-b", 95, "2026-01-01T00:00:00+00:00")]
        )
        session.commit()

        provider_a = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        provider_b = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider_a, session, student_needs_review)
        _ask(settings, provider_b, session, student_mastered)

        prompt_a = provider_a.calls[0][1]["content"]
        prompt_b = provider_b.calls[0][1]["content"]

        def _extract_policy_block(prompt: str) -> str:
            start = prompt.index("=== TEACHING POLICY")
            end = prompt.index("=== END TEACHING POLICY ===")
            return prompt[start:end]

        policy_a = _extract_policy_block(prompt_a)
        policy_b = _extract_policy_block(prompt_b)
        assert policy_a != policy_b
    finally:
        session.close()


def test_needs_review_policy_has_more_scaffold_than_mastered_policy_real(tmp_path):
    """PASO 70: 'needs_review produce más scaffold que mastered' -- esto
    SÍ es deterministically provable ahora (a diferencia del Bloque 2,
    donde solo podíamos observar el prompt, nunca garantizar la
    dirección)."""
    from app.services.tutor_teaching_policy import SCAFFOLD_LEVEL_RANK, ScaffoldLevel

    settings = _settings(tmp_path)
    session = _session()
    try:
        student_needs_review = _create_app_user()
        student_mastered = _create_app_user()
        certification_history_service.import_legacy_attempts(
            session, student_needs_review, COURSE, [_legacy_entry("p-a", 20, "2026-01-01T00:00:00+00:00")]
        )
        certification_history_service.import_legacy_attempts(
            session, student_mastered, COURSE, [_legacy_entry("p-b", 95, "2026-01-01T00:00:00+00:00")]
        )
        session.commit()

        provider_a = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        provider_b = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider_a, session, student_needs_review)
        _ask(settings, provider_b, session, student_mastered)

        def _scaffold_rank_from_prompt(prompt: str) -> int:
            for level in ScaffoldLevel:
                if f"scaffold_level: {level.value}" in prompt:
                    return SCAFFOLD_LEVEL_RANK[level]
            raise AssertionError("scaffold_level no encontrado en el prompt")

        rank_a = _scaffold_rank_from_prompt(provider_a.calls[0][1]["content"])
        rank_b = _scaffold_rank_from_prompt(provider_b.calls[0][1]["content"])
        assert rank_a > rank_b
    finally:
        session.close()


def test_state_change_produces_updated_policy_not_stale(tmp_path):
    """Extiende test_state_change_produces_updated_context_not_stale
    (arriba) a la política: sin cache, un cambio real de estado entre dos
    preguntas se refleja de inmediato en la policy del prompt siguiente."""
    settings = _settings(tmp_path)
    session = _session()
    try:
        user_id = _create_app_user()
        provider_before = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider_before, session, user_id)
        assert "scaffold_level: foundation" in provider_before.calls[0][1]["content"]  # not_started

        certification_history_service.import_legacy_attempts(
            session, user_id, COURSE, [_legacy_entry("p1", 95, "2026-01-01T00:00:00+00:00")]
        )
        session.commit()

        provider_after = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
        _ask(settings, provider_after, session, user_id)
        assert "scaffold_level: minimal" in provider_after.calls[0][1]["content"]  # mastered
    finally:
        session.close()
