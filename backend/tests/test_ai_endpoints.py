"""Tests HTTP de los endpoints de IA (Fase 3): GET /api/ai/status y
POST /api/courses/{course_id}/modules/{module_id}/topics/{topic_id}/lesson.

Usa el fixture `client` (ver conftest.py), que ya aísla tanto el
filesystem de cursos como la cache de LessonPlans en directorios
temporales. El provider LLM real se reemplaza con FakeLLMProvider vía
monkeypatch de `app.services.lesson_generator.get_llm_provider`: ningún
test de este archivo hace llamadas de red.
"""
from __future__ import annotations

from .fakes import FakeLLMProvider

# El tópico "introduccion" del fixture `content_dir` (ver conftest.py)
# produce exactamente estos dos SourceBlock:
#   SRC-001 heading   "Introducción"
#   SRC-002 paragraph "Contenido de prueba para el tema de introducción."
_LESSON_BODY_FOR_FIXTURE_TOPIC = {
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
            "narration": [
                {
                    "text": "Este es el contenido de prueba del tema de introducción.",
                    "source_refs": ["SRC-002"],
                }
            ],
            "visual": {
                "visual_type": "hero",
                "layout_hint": "centered",
                "source_refs": ["SRC-002"],
                "description": "Mostrar el título como texto destacado.",
            },
            "interaction": None,
        }
    ],
    "recap": [{"text": "Repaso del tema de introducción.", "source_refs": ["SRC-002"]}],
}


def test_ai_status_without_credential(client):
    response = client.get("/api/ai/status")
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is False
    assert body["provider"] == "pwc"
    assert body["prompt_version"] == "lesson-v2"
    assert "api_key" not in str(body).lower()
    assert "authorization" not in str(body).lower()


def test_lesson_endpoint_without_credential_returns_503(client):
    response = client.post(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion/lesson"
    )
    assert response.status_code == 503
    body = response.json()
    detail = str(body).lower()
    assert "api_key" not in detail
    assert "bearer" not in detail


def test_lesson_endpoint_topic_not_found_returns_404(client):
    response = client.post(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/no-existe/lesson"
    )
    assert response.status_code == 404


def test_lesson_endpoint_generates_and_caches(client, monkeypatch):
    fake_provider = FakeLLMProvider(
        model="fake-model",
        responses=[_LESSON_BODY_FOR_FIXTURE_TOPIC, _LESSON_BODY_FOR_FIXTURE_TOPIC],
    )
    monkeypatch.setattr(
        "app.services.lesson_generator.get_llm_provider", lambda settings: fake_provider
    )

    first = client.post(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion/lesson"
    )
    assert first.status_code == 200
    first_body = first.json()
    assert first_body["cached"] is False
    assert first_body["provider"] == "fake"
    assert first_body["course_id"] == "curso-de-prueba"
    assert first_body["module_id"] == "fundamentos"
    assert first_body["topic_id"] == "introduccion"
    assert len(first_body["scenes"]) == 1
    assert len(fake_provider.calls) == 1

    second = client.post(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion/lesson"
    )
    assert second.status_code == 200
    second_body = second.json()
    assert second_body["cached"] is True
    assert len(fake_provider.calls) == 1  # no se volvió a llamar al provider

    third = client.post(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion/lesson",
        json={"force_regenerate": True},
    )
    assert third.status_code == 200
    assert third.json()["cached"] is False
    assert len(fake_provider.calls) == 2
