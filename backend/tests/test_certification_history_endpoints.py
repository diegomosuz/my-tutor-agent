"""Tests HTTP de /api/courses/{course_id}/certification/history +
legacy-import (v1.7.0, Bloque 3). Reutiliza el mismo patrón de
`test_certification_endpoints.py` (FakeLLMProvider vía monkeypatch, fixture
`client` con Postgres real)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from .test_certification_endpoints import _patch_provider, valid_question_bank_body_dict

_PREPARE_URL = "/api/courses/curso-de-prueba/certification/prepare"
_EVALUATE_URL = "/api/courses/curso-de-prueba/certification/evaluate"
_HISTORY_URL = "/api/courses/curso-de-prueba/certification/history"
_IMPORT_URL = "/api/courses/curso-de-prueba/certification/legacy-import"


def _prepare_and_evaluate(client, monkeypatch, headers=None):
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    prepare = client.post(
        _PREPARE_URL,
        json={"mode": "simulation", "scope": {"topic_ids": ["introduccion"]}, "question_count": 2, "shuffle": False},
        headers=headers,
    )
    body = prepare.json()
    answers = [{"bank_id": q["bank_id"], "question_id": q["question_id"], "selected_option_ids": ["A"]} for q in body["questions"]]
    evaluate = client.post(
        _EVALUATE_URL,
        json={"answers": answers, "practice_id": body["practice_id"], "mode": "simulation"},
        headers=headers,
    )
    return body["practice_id"], answers, evaluate


def test_history_empty_for_never_touched_course(client):
    response = client.get(_HISTORY_URL)
    assert response.status_code == 200
    assert response.json() == {"course_id": "curso-de-prueba", "attempts": []}


def test_history_404_for_nonexistent_course(client):
    response = client.get("/api/courses/curso-que-no-existe/certification/history")
    assert response.status_code == 404


def test_evaluate_persists_and_history_reflects_it(client, monkeypatch):
    practice_id, _answers, evaluate = _prepare_and_evaluate(client, monkeypatch)
    assert evaluate.status_code == 200

    history = client.get(_HISTORY_URL)
    assert history.status_code == 200
    attempts = history.json()["attempts"]
    assert len(attempts) == 1
    assert attempts[0]["attempt_id"] == practice_id
    assert attempts[0]["origin"] == "server_evaluated"
    assert "question_results" not in attempts[0]


def test_evaluate_retry_same_practice_id_never_duplicates_or_degrades(client, monkeypatch):
    """PASO 25/26: un reintento (red perdida, doble click) con el MISMO
    practice_id nunca crea una segunda fila ni sobrescribe la evidencia ya
    persistida -- ni siquiera si las respuestas reenviadas producen un
    score recalculado distinto (primer-submit-gana, ver
    docs/SERVER_SIDE_PROFILE_V1_7.md)."""
    practice_id, answers, first = _prepare_and_evaluate(client, monkeypatch)
    first_score = first.json()["practice_score_percent"]

    # Mismo practice_id, respuestas DISTINTAS (todas vacías -> score 0) --
    # el resultado RECALCULADO en esta respuesta puede diferir (se
    # recomputa siempre, es una función pura de las respuestas), pero la
    # evidencia PERSISTIDA nunca debe cambiar.
    retried_answers = [{**a, "selected_option_ids": []} for a in answers]
    retry = client.post(
        _EVALUATE_URL,
        json={"answers": retried_answers, "practice_id": practice_id, "mode": "simulation"},
    )
    assert retry.status_code == 200
    assert retry.json()["practice_score_percent"] != first_score  # recompute reflects nuevas respuestas

    history = client.get(_HISTORY_URL).json()
    assert len(history["attempts"]) == 1
    assert history["attempts"][0]["score_percentage"] == first_score  # pero lo persistido nunca cambió


def test_reset_history(client, monkeypatch):
    _prepare_and_evaluate(client, monkeypatch)
    assert len(client.get(_HISTORY_URL).json()["attempts"]) == 1

    reset = client.delete(_HISTORY_URL)
    assert reset.status_code == 204
    assert client.get(_HISTORY_URL).json()["attempts"] == []


def test_reset_history_404_invalid_course(client):
    response = client.delete("/api/courses/curso-que-no-existe/certification/history")
    assert response.status_code == 404


def test_two_dev_users_isolated(client, monkeypatch):
    _prepare_and_evaluate(client, monkeypatch, headers={"X-Dev-User": "student-a"})
    a_history = client.get(_HISTORY_URL, headers={"X-Dev-User": "student-a"}).json()
    b_history = client.get(_HISTORY_URL, headers={"X-Dev-User": "student-b"}).json()
    assert len(a_history["attempts"]) == 1
    assert b_history["attempts"] == []


# --- Legacy import ----------------------------------------------------------


def _legacy_payload(practice_id="legacy-1", score=60.0, module_id="fundamentos", topic_id="introduccion"):
    return {
        "attempts": [
            {
                "practice_id": practice_id,
                "mode": "practice",
                "question_count": 2,
                "answered_count": 2,
                "correct_count": 1,
                "partial_count": 0,
                "incorrect_count": 1,
                "unanswered_count": 0,
                "score_percentage": score,
                "completed_at": "2025-01-01T00:00:00+00:00",
                "performance_by_topic": [
                    {
                        "module_id": module_id,
                        "topic_id": topic_id,
                        "attempted": 2,
                        "correct": 1,
                        "partially_correct": 0,
                        "incorrect": 1,
                        "unanswered": 0,
                        "practice_score_percent": score,
                    }
                ],
                "competencies_to_reinforce": [],
            }
        ]
    }


def test_legacy_import_creates_history(client):
    response = client.post(_IMPORT_URL, json=_legacy_payload())
    assert response.status_code == 200
    attempts = response.json()["attempts"]
    assert len(attempts) == 1
    assert attempts[0]["origin"] == "legacy_import"


def test_legacy_import_404_invalid_course(client):
    response = client.post("/api/courses/curso-que-no-existe/certification/legacy-import", json=_legacy_payload())
    assert response.status_code == 404


def test_legacy_import_skips_stale_topic_but_keeps_attempt(client):
    response = client.post(_IMPORT_URL, json=_legacy_payload(module_id="modulo-fantasma", topic_id="topico-fantasma"))
    assert response.status_code == 200
    attempts = response.json()["attempts"]
    assert len(attempts) == 1
    assert attempts[0]["performance_by_topic"] == []


def test_legacy_import_never_degrades_server_evaluated(client, monkeypatch):
    practice_id, _answers, _evaluate = _prepare_and_evaluate(client, monkeypatch)
    original_score = client.get(_HISTORY_URL).json()["attempts"][0]["score_percentage"]

    client.post(_IMPORT_URL, json=_legacy_payload(practice_id=practice_id, score=1.0))

    history = client.get(_HISTORY_URL).json()["attempts"]
    assert len(history) == 1
    assert history[0]["origin"] == "server_evaluated"
    assert history[0]["score_percentage"] == original_score


def test_legacy_import_idempotent(client):
    payload = _legacy_payload()
    client.post(_IMPORT_URL, json=payload)
    client.post(_IMPORT_URL, json=payload)
    history = client.get(_HISTORY_URL).json()["attempts"]
    assert len(history) == 1


def test_legacy_import_rejects_invalid_score_range(client):
    payload = _legacy_payload(score=150.0)
    response = client.post(_IMPORT_URL, json=payload)
    assert response.status_code == 422


def test_legacy_import_caps_entry_count(client):
    payload = {"attempts": [_legacy_payload(practice_id=f"legacy-{i}")["attempts"][0] for i in range(201)]}
    response = client.post(_IMPORT_URL, json=payload)
    assert response.status_code == 422


# --- Seguridad: el cliente nunca puede declarar un score arbitrario -------


def test_client_cannot_forge_score_via_extra_fields(client, monkeypatch):
    """PASO 106/E de los criterios de aprobación: un campo `score`/
    `practice_score_percent` inventado en el body de /evaluate es
    simplemente ignorado por Pydantic (no declarado en
    `EvaluateSimulationRequest`) -- el score persistido SIEMPRE es el que
    calculó el evaluador determinístico a partir de `answers` reales."""
    _patch_provider(monkeypatch, [valid_question_bank_body_dict()])
    prepare = client.post(
        _PREPARE_URL,
        json={"mode": "simulation", "scope": {"topic_ids": ["introduccion"]}, "question_count": 2, "shuffle": False},
    )
    body = prepare.json()
    # Todas las respuestas deliberadamente vacías (0% real) + un intento de
    # inyectar campos de score/veredicto falsos en el body.
    answers = [{"bank_id": q["bank_id"], "question_id": q["question_id"], "selected_option_ids": []} for q in body["questions"]]
    response = client.post(
        _EVALUATE_URL,
        json={
            "answers": answers,
            "practice_id": body["practice_id"],
            "mode": "simulation",
            "score": 100,
            "practice_score_percent": 100,
            "correct": 999,
        },
    )
    assert response.status_code == 200
    assert response.json()["practice_score_percent"] == 0.0

    history = client.get(_HISTORY_URL).json()["attempts"]
    assert history[0]["score_percentage"] == 0.0


def test_history_returns_503_never_500_when_postgres_unreachable(content_dir, tmp_path):
    """PASO 32/78: Postgres caído -> 503 limpio, nunca "0 attempts" fingido
    ni un 500 crudo (mismo handler global de SQLAlchemyError, Bloque 2)."""

    def _override_settings() -> Settings:
        return Settings(
            content_dir=str(content_dir),
            lesson_cache_dir=str(tmp_path / "lesson-cache"),
            certification_cache_dir=str(tmp_path / "cert-cache"),
            speech_cache_dir=str(tmp_path / "speech-cache"),
            database_url="postgresql+psycopg://baduser:badpass@nonexistent-host-pwc-tutor:5432/nodb",
        )

    app.dependency_overrides[get_settings] = _override_settings
    try:
        response = TestClient(app).get(_HISTORY_URL)
        assert response.status_code == 503
        assert "no está disponible" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()
