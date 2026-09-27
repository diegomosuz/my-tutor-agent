"""Tests de `app/services/tutor_microcheck_feedback_service.py` (v1.8.0,
Bloque 4). Usa `FakeLLMProvider`: ningún test hace llamadas de red.

Cubre la Parte Q de la especificación del bloque (tests 84-92)."""
from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.services import courses as course_service
from app.services import tutor_microcheck_feedback_service
from app.services.llm_provider import LLMConfigurationError
from app.services.llm_retry import GenerationFailedError

from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN
from .tutor_fixtures import valid_microcheck_feedback_dict

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
    return Settings(content_dir=str(_make_content_dir(tmp_path)), lesson_cache_dir=str(tmp_path / "cache"))


def _evaluate(settings, provider, question="¿Qué es Kubernetes?", answer="Es un orquestador de contenedores."):
    return tutor_microcheck_feedback_service.evaluate_microcheck_feedback(
        settings=settings,
        course_id=COURSE,
        module_id=MODULE,
        topic_id=TOPIC,
        micro_check_question=question,
        student_answer=answer,
        provider=provider,
    )


# --------------------------------------------------------------------------
# PASO 84-86: los tres veredictos formativos
# --------------------------------------------------------------------------


def test_correct_feedback(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("correct")])
    result = _evaluate(settings, provider)
    assert result.verdict.value == "correct"
    assert result.feedback.source_refs == ["SRC-002"]


def test_partially_correct_feedback(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("partially_correct")])
    result = _evaluate(settings, provider)
    assert result.verdict.value == "partially_correct"


def test_needs_revision_feedback(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("needs_revision")])
    result = _evaluate(settings, provider)
    assert result.verdict.value == "needs_revision"


def test_unclear_feedback(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("unclear")])
    result = _evaluate(settings, provider)
    assert result.verdict.value == "unclear"


# --------------------------------------------------------------------------
# PASO 87: sin score numérico -- estructuralmente imposible
# --------------------------------------------------------------------------


def test_feedback_body_has_no_score_field():
    from app.models.tutor import TutorMicroCheckFeedbackBody

    assert set(TutorMicroCheckFeedbackBody.model_fields.keys()) == {"verdict", "feedback"}


def test_verdict_enum_never_reuses_learning_state_or_checkpoint_vocabulary():
    from app.models.tutor import MicroCheckVerdict

    values = {v.value for v in MicroCheckVerdict}
    for forbidden in ["mastered", "needs_review", "passed", "failed", "not_assessable", "incorrect"]:
        assert forbidden not in values


# --------------------------------------------------------------------------
# PASO 88-89: no mastery/status mutation (a nivel de contrato -- la prueba
# de mutación real contra Postgres vive en test_tutor_adaptive_behavior.py)
# --------------------------------------------------------------------------


# --------------------------------------------------------------------------
# PASO 90: tópico inválido rechazado
# --------------------------------------------------------------------------


def test_invalid_topic_raises_topic_not_found(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("correct")])
    with pytest.raises(course_service.TopicNotFoundError):
        tutor_microcheck_feedback_service.evaluate_microcheck_feedback(
            settings=settings, course_id=COURSE, module_id=MODULE, topic_id="no-existe",
            micro_check_question="x", student_answer="y", provider=provider,
        )


def test_invalid_topic_checked_before_credential(tmp_path):
    """Mismo criterio que ask_tutor/evaluate_checkpoint: un tópico
    inexistente da 404 incluso sin ninguna API key configurada."""
    settings = _settings(tmp_path)
    unconfigured = FakeLLMProvider(configured=False)
    with pytest.raises(course_service.TopicNotFoundError):
        tutor_microcheck_feedback_service.evaluate_microcheck_feedback(
            settings=settings, course_id=COURSE, module_id=MODULE, topic_id="no-existe",
            micro_check_question="x", student_answer="y", provider=unconfigured,
        )


def test_without_credential_raises_llm_configuration_error(tmp_path):
    settings = _settings(tmp_path)
    unconfigured = FakeLLMProvider(configured=False)
    with pytest.raises(LLMConfigurationError):
        _evaluate(settings, unconfigured)


# --------------------------------------------------------------------------
# PASO 91: fallo de DB -- cubierto de punta a punta en test_tutor_adaptive_behavior.py
# (esta función acepta session=None/user_id=None -- ver PASO 81, el
# feedback builder no tiene un failure mode de DB propio: reutiliza
# exactamente el de tutor_learning_context_service, ya probado en Bloque 1/2).
# --------------------------------------------------------------------------


def test_works_without_identity_no_tone_policy(tmp_path):
    """session/user_id opcionales (igual criterio que ask_tutor): sin
    identidad, no hay TeachingPolicy para el tono, pero el feedback sigue
    generándose con éxito."""
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("correct")])
    result = _evaluate(settings, provider)
    assert result.verdict.value == "correct"
    # El prompt no debe incluir TEACHING POLICY sin identidad resuelta.
    user_prompt = provider.calls[0][1]["content"]
    assert "TEACHING POLICY" not in user_prompt


# --------------------------------------------------------------------------
# PASO 92: respuesta del alumno malformada/demasiado larga rechazada con seguridad
# --------------------------------------------------------------------------


def test_feedback_request_rejects_oversized_answer():
    from app.models.tutor import TutorMicroCheckFeedbackRequest

    with pytest.raises(ValidationError):
        TutorMicroCheckFeedbackRequest(micro_check_question="x", student_answer="a" * 4001)


def test_feedback_request_rejects_empty_answer():
    from app.models.tutor import TutorMicroCheckFeedbackRequest

    with pytest.raises(ValidationError):
        TutorMicroCheckFeedbackRequest(micro_check_question="x", student_answer="")


def test_feedback_request_rejects_oversized_question():
    from app.models.tutor import TutorMicroCheckFeedbackRequest

    with pytest.raises(ValidationError):
        TutorMicroCheckFeedbackRequest(micro_check_question="x" * 1001, student_answer="y")


def test_feedback_request_has_no_answer_key_or_score_fields():
    from app.models.tutor import TutorMicroCheckFeedbackRequest

    fields = set(TutorMicroCheckFeedbackRequest.model_fields.keys())
    assert fields == {"micro_check_question", "student_answer"}


# --------------------------------------------------------------------------
# Grounding: source_refs inexistentes rechazados (con reintentos)
# --------------------------------------------------------------------------


def test_nonexistent_src_rejected_after_retries(tmp_path):
    settings = _settings(tmp_path)
    bad = valid_microcheck_feedback_dict("correct", refs=["SRC-999"])
    provider = FakeLLMProvider(responses=[bad, bad, bad])
    with pytest.raises(GenerationFailedError):
        _evaluate(settings, provider)
    assert len(provider.calls) == 3


# --------------------------------------------------------------------------
# v1.8.0 Bloque 5 -- Parte J (PASO 46): fallo real de Postgres durante la
# resolución de TeachingPolicy (tono) propaga error real, nunca feedback
# falso desde un estado por defecto.
# --------------------------------------------------------------------------


def test_db_outage_during_tone_resolution_propagates_real_error(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.orm import Session

    from tests.conftest import TEST_DATABASE_URL

    settings = _settings(tmp_path)
    user_id = uuid.uuid4()
    unreachable_url = TEST_DATABASE_URL.replace(":5432/", ":59999/")
    broken_engine = create_engine(unreachable_url)
    broken_session = Session(broken_engine)
    try:
        provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("correct")])
        with pytest.raises(SQLAlchemyError):
            tutor_microcheck_feedback_service.evaluate_microcheck_feedback(
                settings=settings, course_id=COURSE, module_id=MODULE, topic_id=TOPIC,
                micro_check_question="x", student_answer="y",
                session=broken_session, user_id=user_id, provider=provider,
            )
        # Nunca debe haber llegado a llamar al proveedor LLM: la falla de
        # tono ocurre ANTES de generar el feedback.
        assert len(provider.calls) == 0
    finally:
        broken_session.close()
        broken_engine.dispose()
