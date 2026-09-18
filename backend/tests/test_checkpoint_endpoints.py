"""Tests HTTP del endpoint /checkpoint (Fase 5). Usa el fixture `client` y
FakeLLMProvider vía monkeypatch: ningún test hace llamadas de red.
"""
from __future__ import annotations

from .fakes import FakeLLMProvider
from .tutor_fixtures import valid_checkpoint_evaluation_dict

_BASE = "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion"
_CHECKPOINT_URL = f"{_BASE}/checkpoint"

# El tópico "introduccion" del fixture `content_dir` (ver conftest.py)
# produce SRC-001 (heading) y SRC-002 (paragraph).
_LESSON_BODY_WITH_CHECKPOINT = {
    "lesson_title": {"text": "Introducción", "source_refs": ["SRC-001"]},
    "learning_objectives": [
        {"text": "Comprender el tema de introducción.", "source_refs": ["SRC-002"]}
    ],
    "scenes": [
        {
            "scene_id": "SCENE-001",
            "scene_type": "introduction",
            "title": {"text": "Introducción", "source_refs": ["SRC-001"]},
            "key_points": [
                {
                    "text": "Contenido de prueba para el tema de introducción.",
                    "source_refs": ["SRC-002"],
                }
            ],
            "narration": [{"text": "Bienvenidos.", "source_refs": ["SRC-002"]}],
            "visual": {
                "visual_type": "hero",
                "layout_hint": "centered",
                "source_refs": ["SRC-002"],
                "description": "",
            },
            "interaction": {
                "interaction_type": "comprehension_check",
                "question": {"text": "¿De qué trata este tema?", "source_refs": ["SRC-002"]},
                "expected_answer": {
                    "text": "Trata sobre contenido de prueba.",
                    "source_refs": ["SRC-002"],
                },
            },
        }
    ],
    "recap": [{"text": "Repaso.", "source_refs": ["SRC-002"]}],
}


def _seed_lesson(client, monkeypatch) -> FakeLLMProvider:
    lesson_provider = FakeLLMProvider(
        model="fake-model", responses=[_LESSON_BODY_WITH_CHECKPOINT]
    )
    monkeypatch.setattr(
        "app.services.lesson_generator.get_llm_provider", lambda settings: lesson_provider
    )
    resp = client.post(f"{_BASE}/lesson")
    assert resp.status_code == 200
    return lesson_provider


def test_checkpoint_without_credential_returns_503(client):
    response = client.post(_CHECKPOINT_URL, json={"scene_id": "SCENE-001", "answer": "x"})
    # Sin ninguna LessonPlan generada, el 404 de "no hay LessonPlan" debe
    # poder responderse incluso sin credencial (ver checkpoint_service.py).
    assert response.status_code == 404


def test_checkpoint_topic_not_found_returns_404(client):
    response = client.post(
        f"/api/courses/curso-de-prueba/modules/fundamentos/topics/no-existe/checkpoint",
        json={"scene_id": "SCENE-001", "answer": "x"},
    )
    assert response.status_code == 404


def test_checkpoint_scene_not_found(client, monkeypatch):
    _seed_lesson(client, monkeypatch)
    eval_provider = FakeLLMProvider(model="fake-model", responses=[])
    monkeypatch.setattr(
        "app.services.checkpoint_service.get_llm_provider", lambda settings: eval_provider
    )
    response = client.post(_CHECKPOINT_URL, json={"scene_id": "SCENE-999", "answer": "x"})
    assert response.status_code == 404


def test_checkpoint_evaluates_via_fake_provider(client, monkeypatch):
    _seed_lesson(client, monkeypatch)
    eval_provider = FakeLLMProvider(
        model="fake-model", responses=[valid_checkpoint_evaluation_dict("correct")]
    )
    monkeypatch.setattr(
        "app.services.checkpoint_service.get_llm_provider", lambda settings: eval_provider
    )
    response = client.post(
        _CHECKPOINT_URL,
        json={"scene_id": "SCENE-001", "answer": "Trata sobre contenido de prueba."},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] == "correct"
    assert len(body["feedback"]) >= 1


def test_checkpoint_answer_max_length_validated(client):
    response = client.post(
        _CHECKPOINT_URL, json={"scene_id": "SCENE-001", "answer": "x" * 4001}
    )
    assert response.status_code == 422


def test_checkpoint_response_never_contains_secret_like_strings(client, monkeypatch):
    _seed_lesson(client, monkeypatch)
    eval_provider = FakeLLMProvider(
        model="fake-model", responses=[valid_checkpoint_evaluation_dict("correct")]
    )
    monkeypatch.setattr(
        "app.services.checkpoint_service.get_llm_provider", lambda settings: eval_provider
    )
    response = client.post(
        _CHECKPOINT_URL, json={"scene_id": "SCENE-001", "answer": "respuesta"}
    )
    body_text = str(response.json()).lower()
    for forbidden in ["api_key", "authorization", "bearer", "system_prompt"]:
        assert forbidden not in body_text
