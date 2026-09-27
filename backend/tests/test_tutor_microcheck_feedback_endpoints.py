"""Tests HTTP del endpoint `/tutor/micro-check/feedback` (v1.8.0, Bloque
4). Usa el fixture `client` (ver conftest.py) y `FakeLLMProvider` vía
monkeypatch: ningún test hace llamadas de red."""
from __future__ import annotations

from .fakes import FakeLLMProvider
from .tutor_fixtures import valid_answer_with_micro_check_reply_dict, valid_microcheck_feedback_dict

_BASE = "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion"
_TUTOR_URL = f"{_BASE}/tutor"
_FEEDBACK_URL = f"{_BASE}/tutor/micro-check/feedback"


def test_feedback_without_credential_returns_503(client):
    response = client.post(
        _FEEDBACK_URL,
        json={"micro_check_question": "¿Qué es esto?", "student_answer": "una respuesta"},
    )
    assert response.status_code == 503


def test_feedback_invalid_topic_returns_404(client):
    response = client.post(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/no-existe/tutor/micro-check/feedback",
        json={"micro_check_question": "¿Qué es esto?", "student_answer": "una respuesta"},
    )
    assert response.status_code == 404


def test_feedback_oversized_answer_returns_422(client):
    response = client.post(
        _FEEDBACK_URL,
        json={"micro_check_question": "x", "student_answer": "a" * 4001},
    )
    assert response.status_code == 422


def test_feedback_empty_answer_returns_422(client):
    response = client.post(
        _FEEDBACK_URL,
        json={"micro_check_question": "x", "student_answer": ""},
    )
    assert response.status_code == 422


def test_feedback_correct_via_fake_provider(client, monkeypatch):
    fake_provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("correct")])
    monkeypatch.setattr(
        "app.services.tutor_microcheck_feedback_service.get_llm_provider", lambda settings: fake_provider
    )
    response = client.post(
        _FEEDBACK_URL,
        json={"micro_check_question": "¿Qué es la introducción?", "student_answer": "Es el tema inicial."},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] == "correct"
    assert body["feedback"]["source_refs"] == ["SRC-002"]


def test_feedback_response_never_contains_secret_like_strings(client, monkeypatch):
    fake_provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("correct")])
    monkeypatch.setattr(
        "app.services.tutor_microcheck_feedback_service.get_llm_provider", lambda settings: fake_provider
    )
    response = client.post(
        _FEEDBACK_URL,
        json={"micro_check_question": "¿Qué es la introducción?", "student_answer": "Es el tema inicial."},
    )
    body_text = str(response.json()).lower()
    for forbidden in ["api_key", "authorization", "bearer", "system_prompt", "user_id"]:
        assert forbidden not in body_text


def test_feedback_client_cannot_send_answer_key_or_score(client, monkeypatch):
    """PARTE 32/58: campos extra ("correct_answer"/"score"/"learning_status")
    enviados por un cliente hostil son ignorados silenciosamente (Pydantic
    extra="ignore" por default) -- nunca influyen en el veredicto real."""
    fake_provider = FakeLLMProvider(responses=[valid_microcheck_feedback_dict("correct")])
    monkeypatch.setattr(
        "app.services.tutor_microcheck_feedback_service.get_llm_provider", lambda settings: fake_provider
    )
    response = client.post(
        _FEEDBACK_URL,
        json={
            "micro_check_question": "¿Qué es la introducción?",
            "student_answer": "Es el tema inicial.",
            "correct_answer": "una respuesta cualquiera",
            "score": 100,
            "learning_status": "mastered",
        },
    )
    assert response.status_code == 200
    user_prompt = fake_provider.calls[0][1]["content"]
    assert "correct_answer" not in user_prompt
    assert "una respuesta cualquiera" not in user_prompt


# --------------------------------------------------------------------------
# Integración: el Tutor conversacional puede generar micro_check real
# --------------------------------------------------------------------------


def test_tutor_answer_can_include_micro_check_via_fake_provider(client, monkeypatch):
    fake_provider = FakeLLMProvider(responses=[valid_answer_with_micro_check_reply_dict(["SRC-002"], ["SRC-002"])])
    monkeypatch.setattr("app.services.tutor_service.get_llm_provider", lambda settings: fake_provider)
    response = client.post(_TUTOR_URL, json={"message": "¿Qué es la introducción?"})
    assert response.status_code == 200
    body = response.json()
    assert body["micro_check"] is not None
    assert body["micro_check"]["kind"] == "conceptual"
    assert "question" in body["micro_check"]


def test_tutor_answer_without_micro_check_field_still_works(client, monkeypatch):
    """Backward compat: un TutorReplyBody sin micro_check (tutor-v6 style)
    sigue funcionando exactamente igual."""
    from .tutor_fixtures import valid_answer_reply_dict

    fake_provider = FakeLLMProvider(responses=[valid_answer_reply_dict(["SRC-002"])])
    monkeypatch.setattr("app.services.tutor_service.get_llm_provider", lambda settings: fake_provider)
    response = client.post(_TUTOR_URL, json={"message": "¿Qué es la introducción?"})
    assert response.status_code == 200
    assert response.json()["micro_check"] is None
