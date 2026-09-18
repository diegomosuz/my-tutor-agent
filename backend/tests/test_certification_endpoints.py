"""Tests HTTP de los endpoints de certificación (Fase 6): /prepare,
/evaluate-question, /evaluate. Usa el fixture `client` (ver conftest.py),
que aísla filesystem de cursos y caches (lección + certificación) en
directorios temporales. El provider real se reemplaza con
FakeLLMProvider vía monkeypatch: ningún test de este archivo hace llamadas
de red.
"""
from __future__ import annotations

import json

from .fakes import FakeLLMProvider

_PREPARE_URL = "/api/courses/curso-de-prueba/certification/prepare"
_EVALUATE_QUESTION_URL = "/api/courses/curso-de-prueba/certification/evaluate-question"
_EVALUATE_URL = "/api/courses/curso-de-prueba/certification/evaluate"


def _patch_provider(monkeypatch, responses):
    fake_provider = FakeLLMProvider(responses=responses)
    monkeypatch.setattr(
        "app.services.certification_service.get_llm_provider", lambda settings: fake_provider
    )
    return fake_provider


def _question_dict(stem: str) -> dict:
    return {
        "question_type": "single_choice",
        "question_style": "conceptual",
        "stem": {"text": stem, "source_refs": ["SRC-001"]},
        "options": [
            {"option_id": "A", "text": "Opción correcta.", "derivation_refs": ["SRC-002"]},
            {"option_id": "B", "text": "Distractor uno.", "derivation_refs": ["SRC-001"]},
            {"option_id": "C", "text": "Distractor dos.", "derivation_refs": ["SRC-001"]},
        ],
        "correct_option_ids": ["A"],
        "explanation": [
            {"text": "La opción A coincide con el material.", "source_refs": ["SRC-002"]}
        ],
        "competency": {"text": "Identificar el contenido del tópico", "source_refs": ["SRC-001"]},
    }


def valid_question_bank_body_dict() -> dict:
    """Banco válido para el contenido real de `conftest.py::content_dir`
    (tópicos de prueba con solo SRC-001/SRC-002 — Markdown corto y
    genérico, no el de `certification_fixtures.py`, pensado para el
    contenido de ejemplo de Fase 3/5). Dos preguntas con stems distintos
    para no disparar la detección de duplicados."""
    return {
        "questions": [
            _question_dict("¿Qué describe el material de este tópico?"),
            _question_dict("¿Cuál de las siguientes opciones coincide con el material?"),
        ]
    }


def test_prepare_without_credential_returns_503(client):
    response = client.post(_PREPARE_URL, json={"scope": {"topic_ids": ["introduccion"]}})
    assert response.status_code == 503
    detail = str(response.json()).lower()
    assert "api_key" not in detail
    assert "bearer" not in detail


def test_prepare_course_not_found_returns_404(client, monkeypatch):
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    response = client.post(
        "/api/courses/no-existe/certification/prepare",
        json={"scope": {"topic_ids": ["introduccion"]}},
    )
    assert response.status_code == 404


def test_prepare_invalid_module_scope_returns_422(client, monkeypatch):
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    response = client.post(_PREPARE_URL, json={"scope": {"module_ids": ["no-existe"]}})
    assert response.status_code == 422


def test_prepare_invalid_topic_scope_returns_422(client, monkeypatch):
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    response = client.post(_PREPARE_URL, json={"scope": {"topic_ids": ["no-existe"]}})
    assert response.status_code == 422


def test_prepare_question_count_out_of_range_returns_422(client):
    response = client.post(
        _PREPARE_URL, json={"scope": {"topic_ids": ["introduccion"]}, "question_count": 0}
    )
    assert response.status_code == 422
    response = client.post(
        _PREPARE_URL, json={"scope": {"topic_ids": ["introduccion"]}, "question_count": 31}
    )
    assert response.status_code == 422


def test_prepare_succeeds_via_fake_provider(client, monkeypatch):
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    response = client.post(
        _PREPARE_URL,
        json={
            "mode": "practice",
            "scope": {"topic_ids": ["introduccion"]},
            "question_count": 2,
            "shuffle": False,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["requested_count"] == 2
    assert body["actual_count"] == 2
    assert len(body["questions"]) == 2
    assert body["questions"][0]["topic_id"] == "introduccion"


def test_prepare_response_never_leaks_answer_key(client, monkeypatch):
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    response = client.post(
        _PREPARE_URL,
        json={"scope": {"topic_ids": ["introduccion"]}, "question_count": 2, "shuffle": False},
    )
    raw_text = response.text
    for forbidden in [
        "correct_option_ids",
        "explanation",
        "derivation_refs",
        "competency",
        "api_key",
        "system_prompt",
    ]:
        assert forbidden not in raw_text, f"'{forbidden}' filtrado en la respuesta pública de /prepare"


def test_prepare_default_scope_uses_whole_course(client, monkeypatch):
    # El curso de prueba tiene 3 tópicos en total: fundamentos/introduccion,
    # fundamentos/componentes, arquitecturas/arquitectura-empresarial.
    fake_provider = FakeLLMProvider(
        responses=[
            valid_question_bank_body_dict(),
            valid_question_bank_body_dict(),
            valid_question_bank_body_dict(),
        ]
    )
    monkeypatch.setattr(
        "app.services.certification_service.get_llm_provider", lambda settings: fake_provider
    )
    response = client.post(_PREPARE_URL, json={"question_count": 6, "shuffle": False})
    assert response.status_code == 200
    topic_ids = {q["topic_id"] for q in response.json()["questions"]}
    assert topic_ids == {"introduccion", "componentes", "arquitectura-empresarial"}


def _prepare_and_get_bank_id(client, monkeypatch) -> tuple[str, str]:
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    response = client.post(
        _PREPARE_URL,
        json={"scope": {"topic_ids": ["introduccion"]}, "question_count": 2, "shuffle": False},
    )
    body = response.json()
    first = body["questions"][0]
    return first["bank_id"], first["question_id"]


def test_evaluate_question_returns_verdict_and_answer_key(client, monkeypatch):
    bank_id, question_id = _prepare_and_get_bank_id(client, monkeypatch)
    response = client.post(
        _EVALUATE_QUESTION_URL,
        json={"bank_id": bank_id, "question_id": question_id, "selected_option_ids": ["A"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] in {"correct", "partially_correct", "incorrect"}
    assert "correct_option_ids" in body
    assert "explanation" in body


def test_evaluate_question_unknown_bank_returns_404(client):
    response = client.post(
        _EVALUATE_QUESTION_URL,
        json={"bank_id": "0" * 64, "question_id": "Q-001", "selected_option_ids": ["A"]},
    )
    assert response.status_code == 404


def test_evaluate_question_invalid_option_returns_422(client, monkeypatch):
    bank_id, question_id = _prepare_and_get_bank_id(client, monkeypatch)
    response = client.post(
        _EVALUATE_QUESTION_URL,
        json={"bank_id": bank_id, "question_id": question_id, "selected_option_ids": ["Z"]},
    )
    assert response.status_code == 422


def test_evaluate_simulation_returns_practice_result(client, monkeypatch):
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    prepare_response = client.post(
        _PREPARE_URL,
        json={
            "mode": "simulation",
            "scope": {"topic_ids": ["introduccion"]},
            "question_count": 2,
            "shuffle": False,
        },
    )
    questions = prepare_response.json()["questions"]
    answers = [
        {"bank_id": q["bank_id"], "question_id": q["question_id"], "selected_option_ids": ["A"]}
        for q in questions
    ]
    response = client.post(_EVALUATE_URL, json={"answers": answers})
    assert response.status_code == 200
    body = response.json()
    assert body["total_questions"] == 2
    assert "practice_score_percent" in body
    assert "by_topic" in body
    assert "by_competency" in body
    assert "topics_to_reinforce" in body


def test_evaluate_simulation_empty_answers_returns_422(client):
    response = client.post(_EVALUATE_URL, json={"answers": []})
    assert response.status_code == 422
