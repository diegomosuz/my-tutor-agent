"""Tests de app/services/lesson_generator.py: ensamblado de LessonPlan,
validación de grounding, cache en filesystem y reintentos acotados.

Usa FakeLLMProvider (tests/fakes.py): ningún test de este archivo hace
llamadas de red.
"""
from __future__ import annotations

import copy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.services import courses as course_service
from app.services import lesson_generator
from app.services.llm_provider import LLMAuthError, LLMResponseError, LLMUpstreamError

from .fakes import FakeConcurrentLLMProvider, FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN, valid_lesson_body_dict


def _make_content_dir(tmp_path: Path, markdown: str = SAMPLE_TOPIC_MARKDOWN) -> Path:
    content_dir = tmp_path / "content"
    module = content_dir / "curso-demo" / "modulo-demo"
    module.mkdir(parents=True)
    (module / "topico-demo.md").write_text(markdown, encoding="utf-8")
    return content_dir


def _settings(tmp_path: Path, content_dir: Path | None = None) -> Settings:
    return Settings(
        content_dir=str(content_dir or _make_content_dir(tmp_path)),
        lesson_cache_dir=str(tmp_path / "cache"),
    )


def _generate(settings: Settings, provider: FakeLLMProvider, **kwargs):
    return lesson_generator.generate_lesson(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        provider=provider,
        **kwargs,
    )


# --------------------------------------------------------------------------
# 1. LessonPlan válida
# --------------------------------------------------------------------------


def test_valid_generation_produces_lesson_plan(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(model="model-x", responses=[valid_lesson_body_dict()])

    plan = _generate(settings, provider)

    assert plan.provider == "fake"
    assert plan.model == "model-x"
    assert plan.course_id == "curso-demo"
    assert plan.module_id == "modulo-demo"
    assert plan.topic_id == "topico-demo"
    assert plan.cached is False
    assert len(plan.scenes) == 2
    assert plan.scenes[0].scene_id == "SCENE-001"
    assert len(provider.calls) == 1


# --------------------------------------------------------------------------
# 12/13. content_sha256 coincide con canonical; course/module/topic del backend
# --------------------------------------------------------------------------


def test_content_sha256_and_ids_come_from_backend_not_llm(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    canonical = course_service.get_canonical_topic(
        settings.content_path, "curso-demo", "modulo-demo", "topico-demo"
    )
    provider = FakeLLMProvider(responses=[valid_lesson_body_dict()])

    plan = _generate(settings, provider)

    assert plan.content_sha256 == canonical.content_sha256
    assert plan.course_id == canonical.course_id
    assert plan.module_id == canonical.module_id
    assert plan.topic_id == canonical.topic_id


# --------------------------------------------------------------------------
# 2. SRC inexistente => rechazo
# --------------------------------------------------------------------------


def test_nonexistent_source_ref_is_rejected_after_retries(tmp_path):
    settings = _settings(tmp_path)
    bad_body = copy.deepcopy(valid_lesson_body_dict())
    bad_body["lesson_title"]["source_refs"] = ["SRC-999"]
    # El provider fake siempre devuelve el mismo cuerpo inválido: se agota
    # el presupuesto de reintentos y se rechaza.
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])

    with pytest.raises(lesson_generator.LessonGenerationError):
        _generate(settings, provider)

    assert len(provider.calls) == lesson_generator.MAX_GENERATION_ATTEMPTS


# --------------------------------------------------------------------------
# 3. GroundedText sin refs => rechazo (validación Pydantic)
# --------------------------------------------------------------------------


def test_grounded_text_without_refs_is_rejected(tmp_path):
    settings = _settings(tmp_path)
    bad_body = copy.deepcopy(valid_lesson_body_dict())
    bad_body["lesson_title"]["source_refs"] = []
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])

    with pytest.raises(lesson_generator.LessonGenerationError):
        _generate(settings, provider)


# --------------------------------------------------------------------------
# 4. scene_id duplicados => rechazo
# --------------------------------------------------------------------------


def test_duplicate_scene_ids_are_rejected(tmp_path):
    settings = _settings(tmp_path)
    bad_body = copy.deepcopy(valid_lesson_body_dict())
    bad_body["scenes"][1]["scene_id"] = "SCENE-001"
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])

    with pytest.raises(lesson_generator.LessonGenerationError):
        _generate(settings, provider)


# --------------------------------------------------------------------------
# 5. scene_id fuera de secuencia => rechazo
# --------------------------------------------------------------------------


def test_out_of_sequence_scene_ids_are_rejected(tmp_path):
    settings = _settings(tmp_path)
    bad_body = copy.deepcopy(valid_lesson_body_dict())
    bad_body["scenes"][1]["scene_id"] = "SCENE-005"
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])

    with pytest.raises(lesson_generator.LessonGenerationError):
        _generate(settings, provider)


# --------------------------------------------------------------------------
# 6/7. Cache hit / force_regenerate
# --------------------------------------------------------------------------


def test_cache_hit_does_not_call_provider_again(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_lesson_body_dict()])

    first = _generate(settings, provider)
    assert first.cached is False
    assert len(provider.calls) == 1

    second = _generate(settings, provider)
    assert second.cached is True
    assert len(provider.calls) == 1  # el provider NO se volvió a llamar

    # El contenido pedagógico es idéntico entre ambas respuestas.
    assert second.lesson_title == first.lesson_title
    assert second.content_sha256 == first.content_sha256


def test_force_regenerate_calls_provider_again(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(
        responses=[valid_lesson_body_dict(), valid_lesson_body_dict()]
    )

    first = _generate(settings, provider)
    assert len(provider.calls) == 1

    second = _generate(settings, provider, force_regenerate=True)
    assert second.cached is False
    assert len(provider.calls) == 2


# --------------------------------------------------------------------------
# 8. Cambio de SHA (contenido) => cache miss
# --------------------------------------------------------------------------


def test_content_change_causes_cache_miss(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(
        responses=[valid_lesson_body_dict(), valid_lesson_body_dict()]
    )

    first = _generate(settings, provider)
    assert len(provider.calls) == 1

    # Cambiamos el contenido Markdown real del tópico.
    topic_file = content_dir / "curso-demo" / "modulo-demo" / "topico-demo.md"
    topic_file.write_text(SAMPLE_TOPIC_MARKDOWN + "\nUna línea nueva.\n", encoding="utf-8")

    second = _generate(settings, provider)
    assert second.cached is False
    assert len(provider.calls) == 2
    assert second.content_sha256 != first.content_sha256


# --------------------------------------------------------------------------
# 9. Cambio de provider/model => cache diferente
# --------------------------------------------------------------------------


def test_different_provider_name_produces_different_cache_entry(tmp_path):
    settings = _settings(tmp_path)
    provider_a = FakeLLMProvider(model="model-x", responses=[valid_lesson_body_dict()])
    plan_a = _generate(settings, provider_a)
    assert plan_a.cached is False

    provider_b = FakeLLMProvider(model="model-x", responses=[valid_lesson_body_dict()])
    provider_b.name = "other-fake"  # simula un provider distinto
    plan_b = _generate(settings, provider_b)
    assert plan_b.cached is False  # cache miss: provider distinto
    assert len(provider_b.calls) == 1


def test_different_model_produces_different_cache_entry(tmp_path):
    settings = _settings(tmp_path)
    provider_a = FakeLLMProvider(model="model-x", responses=[valid_lesson_body_dict()])
    plan_a = _generate(settings, provider_a)
    assert plan_a.cached is False

    provider_b = FakeLLMProvider(model="model-y", responses=[valid_lesson_body_dict()])
    plan_b = _generate(settings, provider_b)
    assert plan_b.cached is False  # cache miss: modelo distinto
    assert len(provider_b.calls) == 1


def test_different_lesson_prompt_version_produces_different_cache_entry(tmp_path):
    """Fase 6: LESSON_PROMPT_VERSION pasó de lesson-v1 a lesson-v2 (nueva
    REGLA 13 sobre comprehension_check). Un cambio de prompt_version debe
    invalidar la cache existente, igual que un cambio de provider/modelo."""
    settings_v1 = _settings(tmp_path)
    settings_v1.lesson_prompt_version = "lesson-v1"
    provider_a = FakeLLMProvider(model="model-x", responses=[valid_lesson_body_dict()])
    plan_a = _generate(settings_v1, provider_a)
    assert plan_a.cached is False

    settings_v2 = _settings(tmp_path, content_dir=Path(settings_v1.content_dir))
    settings_v2.lesson_cache_dir = settings_v1.lesson_cache_dir
    settings_v2.lesson_prompt_version = "lesson-v2"
    provider_b = FakeLLMProvider(model="model-x", responses=[valid_lesson_body_dict()])
    plan_b = _generate(settings_v2, provider_b)
    assert plan_b.cached is False  # cache miss: prompt_version distinto
    assert len(provider_b.calls) == 1


# --------------------------------------------------------------------------
# 10/11. Retry ante JSON/contrato inválido; no retry infinito
# --------------------------------------------------------------------------


def test_retries_on_invalid_response_then_succeeds(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(
        responses=[
            LLMResponseError("JSON inválido simulado"),
            valid_lesson_body_dict(),
        ]
    )

    plan = _generate(settings, provider)

    assert len(provider.calls) == 2
    # El segundo mensaje enviado incluye la corrección, pero conserva el
    # AUTHORIZED SOURCE original (no lo reemplaza).
    second_call_messages = provider.calls[1]
    assert any("Tu respuesta anterior no cumplió" in m["content"] for m in second_call_messages)
    assert any("AUTHORIZED SOURCE" in m["content"] for m in second_call_messages)
    assert len(plan.scenes) == 2


def test_never_retries_more_than_max_attempts(tmp_path):
    settings = _settings(tmp_path)
    always_invalid = LLMResponseError("siempre inválido")
    provider = FakeLLMProvider(responses=[always_invalid] * 10)

    with pytest.raises(lesson_generator.LessonGenerationError):
        _generate(settings, provider)

    assert len(provider.calls) == lesson_generator.MAX_GENERATION_ATTEMPTS


def test_auth_error_is_never_retried(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[LLMAuthError("credencial rechazada")])

    with pytest.raises(LLMAuthError):
        _generate(settings, provider)

    assert len(provider.calls) == 1


def test_upstream_error_is_retried_with_same_messages(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(
        responses=[LLMUpstreamError("timeout simulado"), valid_lesson_body_dict()]
    )

    plan = _generate(settings, provider)

    assert len(provider.calls) == 2
    # El reintento por error upstream reenvía EXACTAMENTE los mismos
    # mensajes (sin agregar un mensaje de corrección).
    assert provider.calls[0] == provider.calls[1]
    assert len(plan.scenes) == 2


# --------------------------------------------------------------------------
# 14. visual_type inválido => rechazo
# --------------------------------------------------------------------------


def test_invalid_visual_type_is_rejected(tmp_path):
    settings = _settings(tmp_path)
    bad_body = copy.deepcopy(valid_lesson_body_dict())
    bad_body["scenes"][0]["visual"]["visual_type"] = "not_a_real_type"
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])

    with pytest.raises(lesson_generator.LessonGenerationError):
        _generate(settings, provider)


# --------------------------------------------------------------------------
# 17. source_refs inválidos en VisualPlan => rechazo
# --------------------------------------------------------------------------


def test_invalid_visual_source_refs_are_rejected(tmp_path):
    settings = _settings(tmp_path)
    bad_body = copy.deepcopy(valid_lesson_body_dict())
    bad_body["scenes"][0]["visual"]["source_refs"] = ["SRC-999"]
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])

    with pytest.raises(lesson_generator.LessonGenerationError):
        _generate(settings, provider)


# --------------------------------------------------------------------------
# 15. Interaction grounded correctamente / referencia inválida rechazada
# --------------------------------------------------------------------------


def test_interaction_with_invalid_ref_is_rejected(tmp_path):
    settings = _settings(tmp_path)
    bad_body = copy.deepcopy(valid_lesson_body_dict())
    bad_body["scenes"][1]["interaction"]["question"]["source_refs"] = ["SRC-999"]
    provider = FakeLLMProvider(responses=[bad_body, bad_body, bad_body])

    with pytest.raises(lesson_generator.LessonGenerationError):
        _generate(settings, provider)


def test_interaction_grounded_correctly_is_accepted(tmp_path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_lesson_body_dict()])

    plan = _generate(settings, provider)

    interaction = plan.scenes[1].interaction
    assert interaction is not None
    assert interaction.question.source_refs == ["SRC-004"]
    assert interaction.expected_answer is not None
    assert interaction.expected_answer.source_refs == ["SRC-004"]


# --------------------------------------------------------------------------
# 16. Tópico pequeño puede producir pocas escenas (no hay mínimo obligatorio)
# --------------------------------------------------------------------------


def test_small_topic_can_produce_a_single_scene(tmp_path):
    settings = _settings(tmp_path)
    small_body = copy.deepcopy(valid_lesson_body_dict())
    small_body["scenes"] = [small_body["scenes"][0]]  # una sola escena
    small_body["recap"] = []
    provider = FakeLLMProvider(responses=[small_body])

    plan = _generate(settings, provider)

    assert len(plan.scenes) == 1
    assert plan.scenes[0].scene_id == "SCENE-001"


def test_empty_scenes_is_rejected_by_pydantic():
    from app.models.lesson import GeneratedLessonBody

    bad_body = copy.deepcopy(valid_lesson_body_dict())
    bad_body["scenes"] = []
    with pytest.raises(ValidationError):
        GeneratedLessonBody.model_validate(bad_body)


# --------------------------------------------------------------------------
# Single-flight (v1.1.0, bloque de performance, PARTE 8/16): dos requests
# casi simultáneos por la MISMA LessonPlan deben producir UNA sola llamada
# real al proveedor — mismo invariante que certification/speech.
# --------------------------------------------------------------------------


def test_concurrent_requests_same_topic_call_provider_once(tmp_path):
    import threading

    marker = "marcador único de esta lección"
    content_dir = _make_content_dir(tmp_path, SAMPLE_TOPIC_MARKDOWN + f"\n{marker}\n")
    settings = _settings(tmp_path, content_dir)
    provider = FakeConcurrentLLMProvider(
        routes={marker: valid_lesson_body_dict()}, delays={marker: 0.15}
    )

    results = []
    errors = []

    def _call():
        try:
            results.append(_generate(settings, provider))
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=_call) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert not errors
    assert len(provider.calls) == 1
    assert len(results) == 4
