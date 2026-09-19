"""Tests de OpenAIProvider. Mockean el SDK de OpenAI (openai.OpenAI):
NUNCA hacen llamadas de red reales."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import openai
import pytest
from pydantic import BaseModel

from app.config import Settings
from app.services.llm_provider import (
    LLMAuthError,
    LLMConfigurationError,
    LLMResponseError,
    LLMUpstreamError,
    OpenAIProvider,
)


class _Sample(BaseModel):
    value: str


def _settings(**overrides) -> Settings:
    defaults = dict(openai_api_key="sk-test-key-123", openai_model="gpt-test-model")
    defaults.update(overrides)
    return Settings(**defaults)


def _fake_completion(parsed=None, refusal=None):
    message = SimpleNamespace(parsed=parsed, refusal=refusal)
    choice = SimpleNamespace(message=message)
    return SimpleNamespace(choices=[choice])


def _install_fake_client(monkeypatch, fake_client):
    monkeypatch.setattr("openai.OpenAI", lambda api_key=None: fake_client)


def test_api_key_and_model_from_settings_are_used(monkeypatch):
    fake_client = MagicMock()
    fake_client.chat.completions.parse.return_value = _fake_completion(
        parsed=_Sample(value="ok")
    )
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings(openai_api_key="sk-abc", openai_model="gpt-fake"))
    result = provider.generate_structured(
        messages=[{"role": "user", "content": "hola"}], response_model=_Sample
    )

    assert result == _Sample(value="ok")
    fake_client.chat.completions.parse.assert_called_once()
    _, kwargs = fake_client.chat.completions.parse.call_args
    assert kwargs["model"] == "gpt-fake"
    assert kwargs["messages"] == [{"role": "user", "content": "hola"}]
    assert kwargs["response_format"] is _Sample
    assert kwargs["temperature"] == 0


def test_structured_output_result_converted_to_expected_contract(monkeypatch):
    fake_client = MagicMock()
    fake_client.chat.completions.parse.return_value = _fake_completion(
        parsed=_Sample(value="estructurado")
    )
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    result = provider.generate_structured(messages=[], response_model=_Sample)
    assert isinstance(result, _Sample)
    assert result.value == "estructurado"


def test_refusal_raises_response_error(monkeypatch):
    fake_client = MagicMock()
    fake_client.chat.completions.parse.return_value = _fake_completion(
        parsed=None, refusal="No puedo ayudar con eso."
    )
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    with pytest.raises(LLMResponseError):
        provider.generate_structured(messages=[], response_model=_Sample)


def test_empty_choices_raises_response_error(monkeypatch):
    fake_client = MagicMock()
    fake_client.chat.completions.parse.return_value = SimpleNamespace(choices=[])
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    with pytest.raises(LLMResponseError):
        provider.generate_structured(messages=[], response_model=_Sample)


def test_authentication_error_converted_to_llm_auth_error(monkeypatch):
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    response = httpx.Response(status_code=401, request=request)
    sdk_error = openai.AuthenticationError("invalid api key", response=response, body=None)

    fake_client = MagicMock()
    fake_client.chat.completions.parse.side_effect = sdk_error
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings(openai_api_key="sk-secret-value"))
    with pytest.raises(LLMAuthError) as exc_info:
        provider.generate_structured(messages=[], response_model=_Sample)
    assert "sk-secret-value" not in str(exc_info.value)


def test_timeout_error_converted_to_upstream_error(monkeypatch):
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    sdk_error = openai.APITimeoutError(request=request)

    fake_client = MagicMock()
    fake_client.chat.completions.parse.side_effect = sdk_error
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    with pytest.raises(LLMUpstreamError):
        provider.generate_structured(messages=[], response_model=_Sample)


def test_connection_error_converted_to_upstream_error(monkeypatch):
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    sdk_error = openai.APIConnectionError(request=request)

    fake_client = MagicMock()
    fake_client.chat.completions.parse.side_effect = sdk_error
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    with pytest.raises(LLMUpstreamError):
        provider.generate_structured(messages=[], response_model=_Sample)


def test_server_error_converted_to_upstream_error(monkeypatch):
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    response = httpx.Response(status_code=500, request=request)
    sdk_error = openai.APIStatusError("server error", response=response, body=None)

    fake_client = MagicMock()
    fake_client.chat.completions.parse.side_effect = sdk_error
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    with pytest.raises(LLMUpstreamError):
        provider.generate_structured(messages=[], response_model=_Sample)


def test_missing_api_key_raises_configuration_error():
    provider = OpenAIProvider(_settings(openai_api_key=""))
    assert provider.is_configured() is False
    with pytest.raises(LLMConfigurationError):
        provider.generate_structured(messages=[], response_model=_Sample)


def test_missing_model_raises_configuration_error(monkeypatch):
    fake_client = MagicMock()
    _install_fake_client(monkeypatch, fake_client)
    provider = OpenAIProvider(_settings(openai_model=""))
    with pytest.raises(LLMConfigurationError):
        provider.generate_structured(messages=[], response_model=_Sample)


# --------------------------------------------------------------------------
# v1.0.1 — bug real corregido: un HTTP 200 que luego no cumple el contrato
# structured-output NUNCA debe clasificarse como LLMUpstreamError (ver
# docs/RELEASE_NOTES_v1.0.1.md). Estos tests fallaban con el código viejo:
# las tres excepciones de acá terminaban como LLMUpstreamError.
# --------------------------------------------------------------------------


def test_length_finish_reason_is_invalid_response_not_upstream(monkeypatch):
    """finish_reason=length (el modelo se truncó armando el structured
    output) significa que SÍ hubo una respuesta HTTP completa — es un
    contrato inválido, nunca un problema de red/proveedor."""
    fake_completion = MagicMock()
    sdk_error = openai.LengthFinishReasonError(completion=fake_completion)

    fake_client = MagicMock()
    fake_client.chat.completions.parse.side_effect = sdk_error
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    with pytest.raises(LLMResponseError):
        provider.generate_structured(messages=[], response_model=_Sample)


def test_content_filter_finish_reason_is_invalid_response_not_upstream(monkeypatch):
    sdk_error = openai.ContentFilterFinishReasonError()

    fake_client = MagicMock()
    fake_client.chat.completions.parse.side_effect = sdk_error
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    with pytest.raises(LLMResponseError):
        provider.generate_structured(messages=[], response_model=_Sample)


def test_unexpected_sdk_exception_is_invalid_response_not_upstream(monkeypatch):
    """Bug real (v1.0.1): antes de este fix, CUALQUIER excepción no
    reconocida durante client.chat.completions.parse() (ej. un error de
    validación Pydantic al interpretar el JSON del modelo contra el
    schema, lanzado dentro del propio SDK después de recibir HTTP 200) se
    reclasificaba como LLMUpstreamError, produciendo logs y un 502 falsos
    para una llamada que en realidad respondió 200. Ahora se clasifica
    correctamente como LLMResponseError (contrato/respuesta inválida)."""
    fake_client = MagicMock()
    fake_client.chat.completions.parse.side_effect = ValueError(
        "algo inesperado del parseo interno del SDK"
    )
    _install_fake_client(monkeypatch, fake_client)

    provider = OpenAIProvider(_settings())
    with pytest.raises(LLMResponseError) as exc_info:
        provider.generate_structured(messages=[], response_model=_Sample)
    assert "ValueError" in str(exc_info.value)
