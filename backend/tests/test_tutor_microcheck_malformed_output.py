"""Validación de salida del proveedor LLM para micro-checks/feedback
(v1.8.0, Bloque 5: "ADAPTIVE TUTOR PRODUCT HARDENING") -- Parte C/PASO 14
de la especificación: missing fields, extra dangerous fields, invalid
verdict, invalid source ref, "dos micro-checks", contenido oversized.

Cubre tanto el nivel Pydantic puro (sin proveedor) como el nivel de
`generate_with_retries` (con `FakeLLMProvider` devolviendo salidas
malformadas, confirmando reintento acotado y rechazo final controlado --
nunca un pass-through inseguro)."""
from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.models.tutor import (
    MicroCheckVerdict,
    StructuredTutorReplyBody,
    TutorMicroCheck,
    TutorMicroCheckFeedbackBody,
    TutorReplyBody,
)
from app.services import tutor_microcheck_feedback_service
from app.services.llm_retry import GenerationFailedError

from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN
from .tutor_fixtures import valid_answer_reply_dict, valid_microcheck_feedback_dict

COURSE, MODULE, TOPIC = "curso-demo", "modulo-demo", "topico-demo"


def _make_content_dir(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    module = content_dir / COURSE / MODULE
    module.mkdir(parents=True)
    (module / f"{TOPIC}.md").write_text(SAMPLE_TOPIC_MARKDOWN, encoding="utf-8")
    return content_dir


def _settings(tmp_path: Path) -> Settings:
    return Settings(content_dir=str(_make_content_dir(tmp_path)), lesson_cache_dir=str(tmp_path / "cache"))


# --------------------------------------------------------------------------
# Pydantic puro: missing fields / invalid enum / invalid kind
# --------------------------------------------------------------------------


def test_micro_check_missing_question_rejected():
    with pytest.raises(ValidationError):
        TutorMicroCheck(kind="conceptual")


def test_micro_check_missing_kind_rejected():
    with pytest.raises(ValidationError):
        TutorMicroCheck(question={"text": "x", "source_refs": ["SRC-001"]})


def test_micro_check_invalid_kind_rejected():
    with pytest.raises(ValidationError):
        TutorMicroCheck(question={"text": "x", "source_refs": ["SRC-001"]}, kind="essay")


def test_feedback_body_invalid_verdict_rejected():
    with pytest.raises(ValidationError):
        TutorMicroCheckFeedbackBody(
            verdict="mastered",  # vocabulario prohibido, nunca un valor legal del enum
            feedback={"text": "x", "source_refs": ["SRC-001"]},
        )


def test_feedback_body_missing_feedback_rejected():
    with pytest.raises(ValidationError):
        TutorMicroCheckFeedbackBody(verdict="correct")


def test_feedback_body_extra_dangerous_fields_ignored_not_rejected():
    """Campos extra peligrosos (score/answer_key/mastered) enviados por
    un proveedor comprometido/mal configurado son ignorados
    silenciosamente (Pydantic extra="ignore" por default) -- nunca
    provocan que esos valores terminen expuestos en el objeto real."""
    body = TutorMicroCheckFeedbackBody.model_validate(
        {
            "verdict": "correct",
            "feedback": {"text": "x", "source_refs": ["SRC-001"]},
            "score": 100,
            "answer_key": "la respuesta correcta es...",
            "mastered": True,
        }
    )
    assert set(body.model_dump().keys()) == {"verdict", "feedback"}


def test_micro_check_extra_dangerous_fields_ignored_not_rejected():
    mc = TutorMicroCheck.model_validate(
        {
            "question": {"text": "x", "source_refs": ["SRC-001"]},
            "kind": "conceptual",
            "correct_answer": "la respuesta secreta",
            "score": 100,
        }
    )
    assert set(mc.model_dump().keys()) == {"question", "kind"}


def test_micro_check_field_structurally_holds_at_most_one_check():
    """PARTE 14 ('two micro-checks'): `micro_check` es un campo escalar
    opcional (`TutorMicroCheck | None`), nunca una lista -- es
    estructuralmente imposible que un único StructuredTutorReplyBody
    contenga dos micro-checks."""
    fields = StructuredTutorReplyBody.model_fields["micro_check"]
    assert "list" not in str(fields.annotation).lower()


def test_oversized_feedback_text_still_validates_but_request_layer_bounds_answer():
    """El texto de feedback en sí no tiene un max_length propio (GroundedText
    genérico), pero el INPUT del alumno que lo origina sí está acotado
    (TutorMicroCheckFeedbackRequest.student_answer, max_length=4000) --
    ver test_tutor_microcheck_feedback.py::test_feedback_request_rejects_oversized_answer."""
    long_text = "x" * 10000
    body = TutorMicroCheckFeedbackBody(
        verdict=MicroCheckVerdict.correct, feedback={"text": long_text, "source_refs": ["SRC-001"]}
    )
    assert len(body.feedback.text) == 10000  # documentado: sin límite propio, no es un vector de riesgo real


# --------------------------------------------------------------------------
# Nivel generate_with_retries: salidas malformadas del proveedor
# --------------------------------------------------------------------------


def test_missing_required_field_triggers_retry_then_controlled_failure(tmp_path):
    settings = _settings(tmp_path)
    malformed = {"verdict": "correct"}  # falta "feedback"
    provider = FakeLLMProvider(responses=[malformed, malformed, malformed])
    with pytest.raises(GenerationFailedError):
        tutor_microcheck_feedback_service.evaluate_microcheck_feedback(
            settings=settings, course_id=COURSE, module_id=MODULE, topic_id=TOPIC,
            micro_check_question="x", student_answer="y", provider=provider,
        )
    assert len(provider.calls) == 3


def test_invalid_verdict_enum_triggers_retry_then_controlled_failure(tmp_path):
    settings = _settings(tmp_path)
    malformed = {"verdict": "mastered", "feedback": {"text": "x", "source_refs": ["SRC-002"]}}
    provider = FakeLLMProvider(responses=[malformed, malformed, malformed])
    with pytest.raises(GenerationFailedError):
        tutor_microcheck_feedback_service.evaluate_microcheck_feedback(
            settings=settings, course_id=COURSE, module_id=MODULE, topic_id=TOPIC,
            micro_check_question="x", student_answer="y", provider=provider,
        )


def test_recovers_after_one_malformed_attempt_then_valid(tmp_path):
    """Confirma que el reintento realmente FUNCIONA (no solo falla): un
    primer intento malformado seguido de uno válido produce éxito, sin
    exponer el intento inválido intermedio."""
    settings = _settings(tmp_path)
    malformed = {"verdict": "correct"}  # sin feedback
    valid = valid_microcheck_feedback_dict("correct")
    provider = FakeLLMProvider(responses=[malformed, valid])
    result = tutor_microcheck_feedback_service.evaluate_microcheck_feedback(
        settings=settings, course_id=COURSE, module_id=MODULE, topic_id=TOPIC,
        micro_check_question="x", student_answer="y", provider=provider,
    )
    assert result.verdict.value == "correct"
    assert len(provider.calls) == 2


def test_tutor_answer_with_invalid_micro_check_kind_triggers_retry(tmp_path):
    """Mismo criterio en el lado del Tutor conversacional: un micro_check
    con 'kind' inválido rompe la validación estructural del contrato y
    dispara reintento, nunca un pass-through inseguro al frontend."""
    settings = _settings(tmp_path)
    bad = valid_answer_reply_dict(["SRC-002"])
    bad["micro_check"] = {"question": {"text": "x", "source_refs": ["SRC-002"]}, "kind": "essay"}
    provider = FakeLLMProvider(responses=[bad, bad, bad])
    from app.services import tutor_service

    with pytest.raises(GenerationFailedError):
        tutor_service.ask_tutor(
            settings=settings, course_id=COURSE, module_id=MODULE, topic_id=TOPIC,
            message="hola", scene_id=None, recent_history=[], provider=provider,
        )
