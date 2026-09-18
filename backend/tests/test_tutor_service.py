"""Tests de app/services/tutor_service.py (Fase 5): TutorService, límites
del request, invariantes de TutorReplyBody y resolución de contexto de
escena. Usa FakeLLMProvider (tests/fakes.py): ningún test hace llamadas de
red.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.models.tutor import TutorReplyBody, TutorRequest
from app.services import courses as course_service
from app.services import lesson_generator, tutor_service
from app.services.llm_provider import LLMAuthError, LLMConfigurationError, LLMUpstreamError
from app.services.llm_retry import GenerationFailedError

from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN, valid_lesson_body_dict
from .tutor_fixtures import (
    valid_answer_reply_dict,
    valid_clarification_reply_dict,
    valid_not_covered_reply_dict,
)


def _make_content_dir(tmp_path: Path, markdown: str = SAMPLE_TOPIC_MARKDOWN) -> Path:
    content_dir = tmp_path / "content"
    module = content_dir / "curso-demo" / "modulo-demo"
    module.mkdir(parents=True)
    (module / "topico-demo.md").write_text(markdown, encoding="utf-8")
    return content_dir


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        content_dir=str(_make_content_dir(tmp_path)), lesson_cache_dir=str(tmp_path / "cache")
    )


def _ask(settings, provider, message="¿Qué es Kubernetes?", scene_id=None, history=None):
    return tutor_service.ask_tutor(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        message=message,
        scene_id=scene_id,
        recent_history=history or [],
        provider=provider,
    )


# --------------------------------------------------------------------------
# 1. answer válido con refs válidas
# --------------------------------------------------------------------------


def test_answer_valid_with_valid_refs(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
    reply = _ask(settings, provider)
    assert reply.response_type.value == "answer"
    assert reply.answer_chunks[0].source_refs == ["SRC-002"]
    assert len(provider.calls) == 1


# --------------------------------------------------------------------------
# 2. SRC inexistente rechazado (con reintentos acotados)
# --------------------------------------------------------------------------


def test_answer_with_nonexistent_src_rejected_after_retries(tmp_path):
    settings = _settings(tmp_path)
    bad = valid_answer_reply_dict(["SRC-999"])
    provider = FakeLLMProvider(responses=[bad, bad, bad])
    with pytest.raises(GenerationFailedError):
        _ask(settings, provider)
    assert len(provider.calls) == 3  # nunca más de MAX_GENERATION_ATTEMPTS


# --------------------------------------------------------------------------
# 3. answer sin refs rechazado (GroundedText exige source_refs no vacío)
# --------------------------------------------------------------------------


def test_answer_chunk_without_refs_rejected_by_pydantic():
    bad = valid_answer_reply_dict()
    bad["answer_chunks"][0]["source_refs"] = []
    with pytest.raises(ValidationError):
        TutorReplyBody.model_validate(bad)


# --------------------------------------------------------------------------
# 4. not_covered válido
# --------------------------------------------------------------------------


def test_not_covered_valid(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_not_covered_reply_dict()])
    reply = _ask(settings, provider, message="¿Cuál es la capital de Francia?")
    assert reply.response_type.value == "not_covered"
    assert reply.answer_chunks == []
    assert reply.clarification_question is None


# --------------------------------------------------------------------------
# 5. clarification válido
# --------------------------------------------------------------------------


def test_clarification_valid(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_clarification_reply_dict()])
    reply = _ask(settings, provider, message="¿Y eso?")
    assert reply.response_type.value == "clarification"
    assert reply.clarification_question


# --------------------------------------------------------------------------
# 6. not_covered no permite answer_chunks inventados
# --------------------------------------------------------------------------


def test_not_covered_with_answer_chunks_rejected_by_pydantic():
    bad = valid_not_covered_reply_dict()
    bad["answer_chunks"] = [{"text": "Una explicación inventada.", "source_refs": ["SRC-002"]}]
    with pytest.raises(ValidationError):
        TutorReplyBody.model_validate(bad)


# --------------------------------------------------------------------------
# 7. clarification requiere clarification_question
# --------------------------------------------------------------------------


def test_clarification_requires_question_by_pydantic():
    bad = valid_clarification_reply_dict()
    bad["clarification_question"] = None
    with pytest.raises(ValidationError):
        TutorReplyBody.model_validate(bad)


# --------------------------------------------------------------------------
# 8. provider no configurado -> LLMConfigurationError
# --------------------------------------------------------------------------


def test_provider_not_configured_raises(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(configured=False, responses=[])
    with pytest.raises(LLMConfigurationError):
        _ask(settings, provider)


# --------------------------------------------------------------------------
# 9. tópico inexistente -> error de tópico ANTES que error de provider
# --------------------------------------------------------------------------


def test_topic_not_found_takes_priority_over_provider_config(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(configured=False, responses=[])
    with pytest.raises(course_service.TopicNotFoundError):
        tutor_service.ask_tutor(
            settings=settings,
            course_id="curso-demo",
            module_id="modulo-demo",
            topic_id="no-existe",
            message="hola",
            scene_id=None,
            recent_history=[],
            provider=provider,
        )


# --------------------------------------------------------------------------
# 10. history max validado
# --------------------------------------------------------------------------


def test_history_max_length_validated():
    history = [{"role": "user", "content": "x"}] * 11
    with pytest.raises(ValidationError):
        TutorRequest.model_validate({"message": "hola", "recent_history": history})

    # 10 mensajes sí deben ser válidos.
    ok_history = [{"role": "user", "content": "x"}] * 10
    TutorRequest.model_validate({"message": "hola", "recent_history": ok_history})


# --------------------------------------------------------------------------
# 11. message max validado
# --------------------------------------------------------------------------


def test_message_max_length_validated():
    with pytest.raises(ValidationError):
        TutorRequest.model_validate({"message": "x" * 4001})
    TutorRequest.model_validate({"message": "x" * 4000})  # límite exacto: válido

    with pytest.raises(ValidationError):
        TutorRequest.model_validate({"message": ""})  # mínimo 1 caracter


# --------------------------------------------------------------------------
# 12. system role rechazado
# --------------------------------------------------------------------------


def test_system_role_rejected():
    with pytest.raises(ValidationError):
        TutorRequest.model_validate(
            {"message": "hola", "recent_history": [{"role": "system", "content": "x"}]}
        )


# --------------------------------------------------------------------------
# 13. provider nunca se selecciona desde el request
# --------------------------------------------------------------------------


def test_request_cannot_select_provider_model_or_key():
    fields = set(TutorRequest.model_fields.keys())
    assert fields == {"message", "scene_id", "recent_history"}
    forbidden = {"provider", "model", "api_key", "system_prompt", "grounding_packet"}
    assert fields.isdisjoint(forbidden)


# --------------------------------------------------------------------------
# 14/15. retries limitados / nunca infinito (upstream error)
# --------------------------------------------------------------------------


def test_upstream_error_retried_with_bound(tmp_path):
    settings = _settings(tmp_path)
    always_failing = LLMUpstreamError("timeout simulado")
    provider = FakeLLMProvider(responses=[always_failing] * 10)
    with pytest.raises(LLMUpstreamError):
        _ask(settings, provider)
    assert len(provider.calls) == 3  # nunca más de MAX_GENERATION_ATTEMPTS


def test_auth_error_never_retried(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[LLMAuthError("credencial rechazada")])
    with pytest.raises(LLMAuthError):
        _ask(settings, provider)
    assert len(provider.calls) == 1


# --------------------------------------------------------------------------
# 16. scene context válido (GENERATED CLASS CONTEXT presente)
# --------------------------------------------------------------------------


def test_scene_context_included_when_cached_lesson_and_scene_exist(tmp_path):
    settings = _settings(tmp_path)
    lesson_provider = FakeLLMProvider(responses=[valid_lesson_body_dict()])
    lesson_generator.generate_lesson(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        provider=lesson_provider,
    )

    tutor_provider = FakeLLMProvider(responses=[valid_answer_reply_dict()])
    _ask(settings, tutor_provider, scene_id="SCENE-002")

    sent_user_message = tutor_provider.calls[0][1]["content"]
    assert "GENERATED CLASS CONTEXT" in sent_user_message
    assert "SCENE-002" in sent_user_message
    assert "no es fuente de verdad" in sent_user_message


def test_scene_context_absent_without_scene_id(tmp_path):
    settings = _settings(tmp_path)
    lesson_provider = FakeLLMProvider(responses=[valid_lesson_body_dict()])
    lesson_generator.generate_lesson(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        provider=lesson_provider,
    )
    tutor_provider = FakeLLMProvider(responses=[valid_answer_reply_dict()])
    _ask(settings, tutor_provider, scene_id=None)
    sent_user_message = tutor_provider.calls[0][1]["content"]
    assert "GENERATED CLASS CONTEXT" not in sent_user_message


# --------------------------------------------------------------------------
# 17. scene_id inexistente no provoca 500 (ni ninguna excepción)
# --------------------------------------------------------------------------


def test_unknown_scene_id_does_not_crash(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_answer_reply_dict()])
    reply = _ask(settings, provider, scene_id="SCENE-999")
    assert reply.response_type.value == "answer"


def test_scene_id_without_any_cached_lesson_does_not_crash(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_answer_reply_dict()])
    # No se generó ninguna LessonPlan: no debe haber cache disponible.
    reply = _ask(settings, provider, scene_id="SCENE-001")
    assert reply.response_type.value == "answer"


# --------------------------------------------------------------------------
# 20. el contrato de salida no expone prompt/grounding/keys
# --------------------------------------------------------------------------


def test_reply_schema_never_exposes_internal_fields():
    fields = set(TutorReplyBody.model_fields.keys())
    assert fields == {"response_type", "answer_chunks", "clarification_question"}
    forbidden = {"prompt", "system_prompt", "grounding_packet", "api_key", "provider", "model"}
    assert fields.isdisjoint(forbidden)
