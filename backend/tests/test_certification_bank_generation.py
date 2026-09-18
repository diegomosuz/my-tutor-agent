"""Tests de app/services/certification_service.py: generación (con
FakeLLMProvider), validación de grounding, cache en filesystem y
reintentos acotados de un QuestionBank. Ningún test hace llamadas de red
(sección 55 de la especificación de Fase 6)."""
from __future__ import annotations

import copy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.services import certification_service
from app.services.llm_provider import LLMAuthError, LLMResponseError, LLMUpstreamError

from .certification_fixtures import (
    build_sample_canonical,
    multiple_choice_question_dict,
    single_choice_question_dict,
    valid_question_bank_body_dict,
)
from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN


def _make_content_dir(tmp_path: Path, markdown: str = SAMPLE_TOPIC_MARKDOWN) -> Path:
    content_dir = tmp_path / "content"
    module = content_dir / "curso-demo" / "modulo-demo"
    module.mkdir(parents=True)
    (module / "topico-demo.md").write_text(markdown, encoding="utf-8")
    return content_dir


def _settings(tmp_path: Path, content_dir: Path | None = None) -> Settings:
    return Settings(
        content_dir=str(content_dir or _make_content_dir(tmp_path)),
        certification_cache_dir=str(tmp_path / "cert-cache"),
    )


def _generate(settings: Settings, provider: FakeLLMProvider, **kwargs):
    return certification_service.get_or_generate_question_bank(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        provider=provider,
        **kwargs,
    )


# --------------------------------------------------------------------------
# 1/2. Preguntas válidas
# --------------------------------------------------------------------------


def test_valid_single_choice_bank(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank = _generate(settings, provider)
    assert bank.questions[0].question_type == "single_choice"
    assert bank.questions[0].question_id == "Q-001"


def test_valid_multiple_choice_bank(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank = _generate(settings, provider)
    assert bank.questions[1].question_type == "multiple_choice"
    assert bank.questions[1].question_id == "Q-002"


def test_bank_id_and_ids_come_from_backend_not_llm(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank = _generate(settings, provider)
    assert bank.course_id == "curso-demo"
    assert bank.module_id == "modulo-demo"
    assert bank.topic_id == "topico-demo"
    assert bank.provider == "fake"
    assert bank.prompt_version == settings.certification_prompt_version
    assert len(bank.bank_id) == 64  # sha256 hex digest


# --------------------------------------------------------------------------
# 3-6. source_refs / derivation_refs inválidas -> rechazado tras reintentos
# --------------------------------------------------------------------------


def test_invalid_source_ref_in_stem_is_rejected_after_retries(tmp_path):
    settings = _settings(tmp_path)
    bad_body = valid_question_bank_body_dict()
    bad_body["questions"][0]["stem"]["source_refs"] = ["SRC-999"]
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])
    with pytest.raises(certification_service.GenerationFailedError):
        _generate(settings, provider)
    assert len(provider.calls) == 3


def test_invalid_source_ref_in_explanation_is_rejected_after_retries(tmp_path):
    settings = _settings(tmp_path)
    bad_body = valid_question_bank_body_dict()
    bad_body["questions"][0]["explanation"][0]["source_refs"] = ["SRC-999"]
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])
    with pytest.raises(certification_service.GenerationFailedError):
        _generate(settings, provider)


def test_invalid_competency_ref_is_rejected_after_retries(tmp_path):
    settings = _settings(tmp_path)
    bad_body = valid_question_bank_body_dict()
    bad_body["questions"][0]["competency"]["source_refs"] = ["SRC-999"]
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])
    with pytest.raises(certification_service.GenerationFailedError):
        _generate(settings, provider)


def test_invalid_option_derivation_ref_is_rejected_after_retries(tmp_path):
    settings = _settings(tmp_path)
    bad_body = valid_question_bank_body_dict()
    bad_body["questions"][0]["options"][1]["derivation_refs"] = ["SRC-999"]
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])
    with pytest.raises(certification_service.GenerationFailedError):
        _generate(settings, provider)


# --------------------------------------------------------------------------
# 12. Stem duplicado (normalizado) rechazado
# --------------------------------------------------------------------------


def test_duplicate_normalized_stem_is_rejected_after_retries(tmp_path):
    settings = _settings(tmp_path)
    bad_body = valid_question_bank_body_dict()
    # Mismo stem que la primera pregunta, con mayúsculas/puntuación distinta:
    # debe normalizar igual y detectarse como duplicado.
    bad_body["questions"][1]["stem"] = {
        "text": "¿Qué es Kubernetes según el material?  ",
        "source_refs": ["SRC-002"],
    }
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])
    with pytest.raises(certification_service.GenerationFailedError):
        _generate(settings, provider)


# --------------------------------------------------------------------------
# 13. application válida cuando está fundada en la fuente
# --------------------------------------------------------------------------


def test_application_style_question_valid_when_source_based(tmp_path):
    settings = _settings(tmp_path)
    body = valid_question_bank_body_dict()
    body["questions"][0]["question_style"] = "application"
    provider = FakeLLMProvider(responses=[body])
    bank = _generate(settings, provider)
    assert bank.questions[0].question_style == "application"


# --------------------------------------------------------------------------
# 15. Fuente corta puede devolver menos preguntas (incluso 0)
# --------------------------------------------------------------------------


def test_short_source_may_return_fewer_questions(tmp_path):
    settings = _settings(tmp_path)
    sparse_body = {"questions": [single_choice_question_dict()]}
    provider = FakeLLMProvider(responses=[sparse_body])
    bank = _generate(settings, provider)
    assert len(bank.questions) == 1


def test_source_may_return_zero_questions(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[{"questions": []}])
    bank = _generate(settings, provider)
    assert bank.questions == []


# --------------------------------------------------------------------------
# 16-19. Cache
# --------------------------------------------------------------------------


def test_cache_hit_does_not_call_provider_again(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    first = _generate(settings, provider)
    second = _generate(settings, provider)
    assert first.bank_id == second.bank_id
    assert len(provider.calls) == 1  # la segunda vez fue cache hit


def test_content_sha_change_causes_cache_miss(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir=content_dir)
    provider_a = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank_a = _generate(settings, provider_a)

    (content_dir / "curso-demo" / "modulo-demo" / "topico-demo.md").write_text(
        SAMPLE_TOPIC_MARKDOWN + "\n## Extra\n\nContenido nuevo.\n", encoding="utf-8"
    )
    provider_b = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank_b = _generate(settings, provider_b)
    assert bank_a.bank_id != bank_b.bank_id
    assert len(provider_b.calls) == 1


def test_different_provider_name_produces_different_cache_entry(tmp_path):
    settings = _settings(tmp_path)
    provider_a = FakeLLMProvider(model="model-x", responses=[valid_question_bank_body_dict()])
    bank_a = _generate(settings, provider_a)

    provider_b = FakeLLMProvider(model="model-x", responses=[valid_question_bank_body_dict()])
    provider_b.name = "other-fake"
    bank_b = _generate(settings, provider_b)
    assert bank_a.bank_id != bank_b.bank_id
    assert len(provider_b.calls) == 1


def test_different_model_produces_different_cache_entry(tmp_path):
    settings = _settings(tmp_path)
    provider_a = FakeLLMProvider(model="model-x", responses=[valid_question_bank_body_dict()])
    bank_a = _generate(settings, provider_a)

    provider_b = FakeLLMProvider(model="model-y", responses=[valid_question_bank_body_dict()])
    bank_b = _generate(settings, provider_b)
    assert bank_a.bank_id != bank_b.bank_id
    assert len(provider_b.calls) == 1


def test_different_certification_prompt_version_produces_different_cache_entry(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    settings_a = _settings(tmp_path, content_dir=content_dir)
    settings_a.certification_prompt_version = "certification-v1"
    provider_a = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank_a = _generate(settings_a, provider_a)

    settings_b = _settings(tmp_path, content_dir=content_dir)
    settings_b.certification_cache_dir = settings_a.certification_cache_dir
    settings_b.certification_prompt_version = "certification-v2"
    provider_b = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank_b = _generate(settings_b, provider_b)
    assert bank_a.bank_id != bank_b.bank_id
    assert len(provider_b.calls) == 1


# --------------------------------------------------------------------------
# 20. Reintentos acotados
# --------------------------------------------------------------------------


def test_retries_on_invalid_response_then_succeeds(tmp_path):
    settings = _settings(tmp_path)
    bad_body = valid_question_bank_body_dict()
    bad_body["questions"][0]["stem"]["source_refs"] = ["SRC-999"]
    provider = FakeLLMProvider(responses=[bad_body, valid_question_bank_body_dict()])
    bank = _generate(settings, provider)
    assert len(provider.calls) == 2
    assert len(bank.questions) == 2


def test_never_retries_more_than_max_attempts(tmp_path):
    settings = _settings(tmp_path)
    bad_body = valid_question_bank_body_dict()
    bad_body["questions"][0]["stem"]["source_refs"] = ["SRC-999"]
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body, valid_question_bank_body_dict()])
    with pytest.raises(certification_service.GenerationFailedError):
        _generate(settings, provider)
    assert len(provider.calls) == 3  # nunca llega al 4to intento


def test_auth_error_is_never_retried(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[LLMAuthError("credencial rechazada")])
    with pytest.raises(LLMAuthError):
        _generate(settings, provider)
    assert len(provider.calls) == 1


def test_upstream_error_is_retried_with_same_messages(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(
        responses=[LLMUpstreamError("timeout"), valid_question_bank_body_dict()]
    )
    bank = _generate(settings, provider)
    assert len(provider.calls) == 2
    assert provider.calls[0] == provider.calls[1]
    assert len(bank.questions) == 2


def test_force_regenerate_calls_provider_again(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    _generate(settings, provider)
    provider2 = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank = _generate(settings, provider2, force_regenerate=True)
    assert len(provider2.calls) == 1
    assert len(bank.questions) == 2
