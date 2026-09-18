"""Tests HTTP del endpoint /tutor (Fase 5). Usa el fixture `client` (ver
conftest.py), que aísla filesystem de cursos y cache de lecciones en
directorios temporales. El provider real se reemplaza con FakeLLMProvider
vía monkeypatch: ningún test de este archivo hace llamadas de red.
"""
from __future__ import annotations

from .fakes import FakeLLMProvider
from .tutor_fixtures import valid_answer_reply_dict, valid_not_covered_reply_dict

_TUTOR_URL = "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion/tutor"


def test_tutor_without_credential_returns_503(client):
    response = client.post(_TUTOR_URL, json={"message": "¿Qué es esto?"})
    assert response.status_code == 503
    detail = str(response.json()).lower()
    assert "api_key" not in detail
    assert "bearer" not in detail


def test_tutor_topic_not_found_returns_404(client):
    response = client.post(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/no-existe/tutor",
        json={"message": "hola"},
    )
    assert response.status_code == 404


def test_tutor_system_role_in_history_returns_422(client):
    response = client.post(
        _TUTOR_URL,
        json={"message": "hola", "recent_history": [{"role": "system", "content": "x"}]},
    )
    assert response.status_code == 422


def test_tutor_message_too_long_returns_422(client):
    response = client.post(_TUTOR_URL, json={"message": "x" * 4001})
    assert response.status_code == 422


def test_tutor_too_much_history_returns_422(client):
    history = [{"role": "user", "content": "x"}] * 11
    response = client.post(_TUTOR_URL, json={"message": "hola", "recent_history": history})
    assert response.status_code == 422


def test_tutor_answer_via_fake_provider(client, monkeypatch):
    fake_provider = FakeLLMProvider(
        model="fake-model",
        responses=[valid_answer_reply_dict(["SRC-002"])],
    )
    monkeypatch.setattr(
        "app.services.tutor_service.get_llm_provider", lambda settings: fake_provider
    )

    response = client.post(_TUTOR_URL, json={"message": "¿Qué es la introducción?"})
    assert response.status_code == 200
    body = response.json()
    assert body["response_type"] == "answer"
    assert body["answer_chunks"][0]["source_refs"] == ["SRC-002"]
    assert len(fake_provider.calls) == 1


def test_tutor_not_covered_via_fake_provider(client, monkeypatch):
    fake_provider = FakeLLMProvider(responses=[valid_not_covered_reply_dict()])
    monkeypatch.setattr(
        "app.services.tutor_service.get_llm_provider", lambda settings: fake_provider
    )
    response = client.post(_TUTOR_URL, json={"message": "¿Cuál es la capital de Francia?"})
    assert response.status_code == 200
    body = response.json()
    assert body["response_type"] == "not_covered"
    assert body["answer_chunks"] == []


def test_tutor_response_never_contains_secret_like_strings(client, monkeypatch):
    fake_provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
    monkeypatch.setattr(
        "app.services.tutor_service.get_llm_provider", lambda settings: fake_provider
    )
    response = client.post(_TUTOR_URL, json={"message": "¿Qué es la introducción?"})
    body_text = str(response.json()).lower()
    for forbidden in ["api_key", "authorization", "bearer", "system_prompt"]:
        assert forbidden not in body_text
