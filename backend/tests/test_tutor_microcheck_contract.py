"""Tests del contrato estructural de `TutorMicroCheck` (v1.8.0, Bloque 4)
y de la integración del bloque INTERACTION POLICY en el prompt builder.
Sin DB, sin LLM -- construye objetos a mano para probar invariantes
Pydantic y renderizado determinístico.

Cubre las Partes E/F/H (contrato, response schema, prompt) y parte de la
P (tests 75-83, los que no requieren un LLM real -- los de generación
real vía FakeLLMProvider viven en test_tutor_microcheck_feedback.py)."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.tutor import (
    MicroCheckKind,
    StructuredTutorReplyBody,
    TutorMicroCheck,
    TutorReplyBody,
    TutorResponseType,
)
from app.prompts.tutor import build_tutor_messages, build_tutor_user_prompt
from app.services.tutor_interaction_policy import MicroCheckMode, TutorInteractionPolicy


def _valid_answer_kwargs(micro_check: TutorMicroCheck | None = None) -> dict:
    return {
        "response_type": TutorResponseType.answer,
        "answer_chunks": [{"text": "x", "source_refs": ["SRC-001"]}],
        "micro_check": micro_check,
    }


def _micro_check(refs: list[str] | None = None, kind: str = "conceptual") -> TutorMicroCheck:
    return TutorMicroCheck(
        question={"text": "¿Qué diferencia hay entre A y B?", "source_refs": refs or ["SRC-002"]},
        kind=kind,
    )


# --------------------------------------------------------------------------
# PASO 18-21: contrato estructural del micro-check
# --------------------------------------------------------------------------


def test_micro_check_has_only_question_and_kind():
    mc = _micro_check()
    assert set(mc.model_fields.keys()) == {"question", "kind"}


def test_micro_check_kind_is_closed_enum():
    assert set(MicroCheckKind) == {MicroCheckKind.conceptual, MicroCheckKind.application}


def test_micro_check_question_requires_source_refs():
    with pytest.raises(ValidationError):
        TutorMicroCheck(question={"text": "¿Qué es X?", "source_refs": []}, kind="conceptual")


def test_micro_check_never_has_score_or_mastery_fields():
    fields = set(TutorMicroCheck.model_fields.keys())
    for forbidden in [
        "score", "correct_answer", "answer_key", "rubric", "hidden_reasoning",
        "mastered", "needs_review", "passed", "failed", "learning_status",
    ]:
        assert forbidden not in fields


# --------------------------------------------------------------------------
# PASO 22: grounded únicamente al tópico actual (SRC-XXX, nunca COURSE-SRC-XXX)
# --------------------------------------------------------------------------


def test_micro_check_rejects_course_src_refs():
    with pytest.raises(ValidationError, match="COURSE-SRC"):
        _micro_check(refs=["COURSE-SRC-001"])


def test_micro_check_rejects_mixed_src_and_course_src_refs():
    with pytest.raises(ValidationError, match="COURSE-SRC"):
        _micro_check(refs=["SRC-001", "COURSE-SRC-002"])


def test_micro_check_accepts_multiple_src_refs():
    mc = _micro_check(refs=["SRC-001", "SRC-002"])
    assert mc.question.source_refs == ["SRC-001", "SRC-002"]


# --------------------------------------------------------------------------
# PASO 22/23: contrato de respuesta -- micro_check opcional, backward compatible
# --------------------------------------------------------------------------


def test_tutor_reply_body_micro_check_defaults_to_none():
    reply = TutorReplyBody(response_type=TutorResponseType.answer, answer_chunks=[{"text": "x", "source_refs": ["SRC-001"]}])
    assert reply.micro_check is None


def test_tutor_reply_body_accepts_valid_micro_check():
    reply = TutorReplyBody(**_valid_answer_kwargs(_micro_check()))
    assert reply.micro_check is not None
    assert reply.micro_check.kind == MicroCheckKind.conceptual


def test_structured_reply_body_accepts_valid_micro_check():
    body = StructuredTutorReplyBody(
        scope_relation="current_topic", topic_coverage="sufficient", course_coverage="insufficient",
        **_valid_answer_kwargs(_micro_check()),
    )
    assert body.micro_check is not None


@pytest.mark.parametrize("response_type", ["not_covered", "clarification", "unrelated"])
def test_micro_check_forbidden_outside_answer_response_type(response_type):
    """PASO 17: un micro-check formativo solo tiene sentido después de
    una explicación real -- nunca junto a not_covered/clarification/
    unrelated."""
    kwargs = {
        "response_type": response_type,
        "micro_check": _micro_check(),
    }
    if response_type == "clarification":
        kwargs["clarification_question"] = "¿A qué te referís?"
    with pytest.raises(ValidationError, match="micro_check"):
        TutorReplyBody(**kwargs)


def test_frontend_can_ignore_micro_check_none():
    """PASO 25: un TutorReplyBody sin micro_check serializa exactamente
    igual que en tutor-v6 (campo presente pero None -- el frontend puede
    ignorarlo con un simple check de truthiness)."""
    reply = TutorReplyBody(response_type=TutorResponseType.answer, answer_chunks=[{"text": "x", "source_refs": ["SRC-001"]}])
    dumped = reply.model_dump()
    assert dumped["micro_check"] is None


# --------------------------------------------------------------------------
# PASO 29 / Parte L: bloque INTERACTION POLICY en el prompt
# --------------------------------------------------------------------------


def _user_prompt_with_interaction_policy(policy: TutorInteractionPolicy | None) -> str:
    return build_tutor_user_prompt(
        message="hola",
        recent_history=[],
        scene_context=None,
        grounding_packet="=== AUTHORIZED SOURCE: TOPIC ===\n[SRC-001]\nx\n=== END AUTHORIZED SOURCE ===",
        interaction_policy=policy,
    )


def test_interaction_policy_block_renders_when_present():
    policy = TutorInteractionPolicy(micro_check_mode=MicroCheckMode.encouraged)
    prompt = _user_prompt_with_interaction_policy(policy)
    assert "=== INTERACTION POLICY" in prompt
    assert "micro_check_mode: encouraged" in prompt
    assert "max_micro_checks: 1" in prompt


def test_interaction_policy_block_absent_when_none():
    prompt = _user_prompt_with_interaction_policy(None)
    assert "INTERACTION POLICY" not in prompt


def test_interaction_policy_appears_after_teaching_policy():
    from app.services.tutor_teaching_policy import STANDARD_FALLBACK_POLICY

    prompt = build_tutor_user_prompt(
        message="hola",
        recent_history=[],
        scene_context=None,
        grounding_packet="packet",
        teaching_policy=STANDARD_FALLBACK_POLICY,
        interaction_policy=TutorInteractionPolicy(micro_check_mode=MicroCheckMode.optional),
    )
    teaching_idx = prompt.index("=== TEACHING POLICY")
    teaching_end = prompt.index("=== END TEACHING POLICY ===")
    interaction_idx = prompt.index("=== INTERACTION POLICY")
    assert teaching_idx < teaching_end < interaction_idx


def test_micro_check_schema_note_present_in_output_format_rules():
    prompt = _user_prompt_with_interaction_policy(TutorInteractionPolicy(micro_check_mode=MicroCheckMode.encouraged))
    assert "micro_check" in prompt
    assert "NUNCA COURSE-SRC-XXX" in prompt or "COURSE-SRC-XXX" in prompt


# --------------------------------------------------------------------------
# REGLA 24-29: reglas presentes, versión tutor-v7
# --------------------------------------------------------------------------


def test_system_prompt_contains_regla_29():
    from app.prompts.tutor import TUTOR_SYSTEM_PROMPT

    assert "REGLA 29" in TUTOR_SYSTEM_PROMPT
    assert "máximo un micro-check".upper()[:6] in TUTOR_SYSTEM_PROMPT.upper() or "Máximo UN" in TUTOR_SYSTEM_PROMPT


def test_messages_without_interaction_policy_omit_block():
    messages = build_tutor_messages(
        message="hola", recent_history=[], scene_context=None, grounding_packet="packet",
    )
    assert "=== INTERACTION POLICY" not in messages[1]["content"]
