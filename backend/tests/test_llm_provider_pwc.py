"""Tests de PwCGenAIProvider. Mockean httpx.post: NUNCA hacen llamadas de
red reales."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest
from pydantic import BaseModel

from app.config import Settings
from app.services.llm_provider import (
    LLMAuthError,
    LLMResponseError,
    LLMUpstreamError,
    PwCGenAIProvider,
)


class _Sample(BaseModel):
    value: str


def _settings(**overrides) -> Settings:
    defaults = dict(
        pwc_genai_base_url="https://genai-sharedservice-americas.pwcinternal.com",
        pwc_genai_api_key="secret-pwc-key-123",
        pwc_genai_model="openai.gpt-4o-2024-11-20",
    )
    defaults.update(overrides)
    return Settings(**defaults)


def _mock_response(status_code: int, json_body: object = None, raise_on_json: bool = False):
    response = MagicMock()
    response.status_code = status_code
    if raise_on_json:
        response.json.side_effect = ValueError("not json")
    else:
        response.json.return_value = json_body
    return response


def test_sends_correct_url_headers_payload_and_parses_content():
    ok_body = {"choices": [{"message": {"content": json.dumps({"value": "hola"})}}]}
    response = _mock_response(200, ok_body)

    with patch("app.services.llm_provider.httpx.post", return_value=response) as mock_post:
        provider = PwCGenAIProvider(_settings())
        result = provider.generate_structured(
            messages=[{"role": "user", "content": "hi"}], response_model=_Sample
        )

    assert result == _Sample(value="hola")

    mock_post.assert_called_once()
    _, kwargs = mock_post.call_args
    called_url = mock_post.call_args.args[0] if mock_post.call_args.args else kwargs.get("url")
    assert called_url == "https://genai-sharedservice-americas.pwcinternal.com/chat/completions"
    assert kwargs["headers"]["Authorization"] == "Bearer secret-pwc-key-123"
    assert kwargs["headers"]["Accept"] == "application/json"
    assert kwargs["headers"]["Content-Type"] == "application/json"
    assert kwargs["json"]["model"] == "openai.gpt-4o-2024-11-20"
    assert kwargs["json"]["messages"] == [{"role": "user", "content": "hi"}]
    assert kwargs["json"]["temperature"] == 0
    assert "timeout" in kwargs


def test_accepts_json_wrapped_in_fence():
    fenced = "```json\n" + json.dumps({"value": "cercado"}) + "\n```"
    ok_body = {"choices": [{"message": {"content": fenced}}]}
    response = _mock_response(200, ok_body)

    with patch("app.services.llm_provider.httpx.post", return_value=response):
        provider = PwCGenAIProvider(_settings())
        result = provider.generate_structured(messages=[], response_model=_Sample)

    assert result == _Sample(value="cercado")


def test_http_401_raises_auth_error_without_leaking_key():
    response = _mock_response(401, {"error": "unauthorized"})
    with patch("app.services.llm_provider.httpx.post", return_value=response):
        provider = PwCGenAIProvider(_settings())
        with pytest.raises(LLMAuthError) as exc_info:
            provider.generate_structured(messages=[], response_model=_Sample)
    assert "secret-pwc-key-123" not in str(exc_info.value)


def test_http_500_raises_upstream_error():
    response = _mock_response(500, {"error": "boom"})
    with patch("app.services.llm_provider.httpx.post", return_value=response):
        provider = PwCGenAIProvider(_settings())
        with pytest.raises(LLMUpstreamError):
            provider.generate_structured(messages=[], response_model=_Sample)


def test_timeout_raises_upstream_error():
    with patch(
        "app.services.llm_provider.httpx.post",
        side_effect=httpx.TimeoutException("timed out"),
    ):
        provider = PwCGenAIProvider(_settings())
        with pytest.raises(LLMUpstreamError):
            provider.generate_structured(messages=[], response_model=_Sample)


def test_connection_error_raises_upstream_error():
    with patch(
        "app.services.llm_provider.httpx.post",
        side_effect=httpx.ConnectError("refused"),
    ):
        provider = PwCGenAIProvider(_settings())
        with pytest.raises(LLMUpstreamError):
            provider.generate_structured(messages=[], response_model=_Sample)


def test_empty_choices_raises_response_error():
    response = _mock_response(200, {"choices": []})
    with patch("app.services.llm_provider.httpx.post", return_value=response):
        provider = PwCGenAIProvider(_settings())
        with pytest.raises(LLMResponseError):
            provider.generate_structured(messages=[], response_model=_Sample)


def test_missing_message_content_raises_response_error():
    response = _mock_response(200, {"choices": [{"message": {}}]})
    with patch("app.services.llm_provider.httpx.post", return_value=response):
        provider = PwCGenAIProvider(_settings())
        with pytest.raises(LLMResponseError):
            provider.generate_structured(messages=[], response_model=_Sample)


def test_invalid_json_body_raises_response_error():
    response = _mock_response(200, raise_on_json=True)
    with patch("app.services.llm_provider.httpx.post", return_value=response):
        provider = PwCGenAIProvider(_settings())
        with pytest.raises(LLMResponseError):
            provider.generate_structured(messages=[], response_model=_Sample)


def test_content_not_valid_json_raises_response_error():
    ok_body = {"choices": [{"message": {"content": "esto no es JSON"}}]}
    response = _mock_response(200, ok_body)
    with patch("app.services.llm_provider.httpx.post", return_value=response):
        provider = PwCGenAIProvider(_settings())
        with pytest.raises(LLMResponseError):
            provider.generate_structured(messages=[], response_model=_Sample)


def test_is_configured_uses_gen_ai_api_key_fallback():
    settings = _settings(pwc_genai_api_key="", gen_ai_api_key="fallback-key")
    provider = PwCGenAIProvider(settings)
    assert provider.is_configured() is True


def test_is_configured_false_without_any_key():
    settings = _settings(pwc_genai_api_key="", gen_ai_api_key="")
    provider = PwCGenAIProvider(settings)
    assert provider.is_configured() is False


def test_pwc_genai_api_key_takes_priority_over_fallback():
    settings = _settings(pwc_genai_api_key="primary-key", gen_ai_api_key="fallback-key")
    ok_body = {"choices": [{"message": {"content": json.dumps({"value": "x"})}}]}
    response = _mock_response(200, ok_body)
    with patch("app.services.llm_provider.httpx.post", return_value=response) as mock_post:
        provider = PwCGenAIProvider(settings)
        provider.generate_structured(messages=[], response_model=_Sample)
    _, kwargs = mock_post.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer primary-key"
