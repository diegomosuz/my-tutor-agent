"""Tests de app/services/checkpoint_service.py (Fase 5): evaluación de
checkpoints de comprensión, validación de grounding y la regla dura de que
`expected_answer` NUNCA es autoridad. Usa FakeLLMProvider: ningún test hace
llamadas de red.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.models.tutor import CheckpointEvaluationBody
from app.services import checkpoint_service, lesson_generator
from app.services.llm_provider import LLMConfigurationError
from app.services.llm_retry import GenerationFailedError

from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN, valid_lesson_body_dict
from .tutor_fixtures import lesson_body_with_reflection_scene, valid_checkpoint_evaluation_dict


def _make_content_dir(tmp_path: Path, markdown: str = SAMPLE_TOPIC_MARKDOWN) -> Path:
    content_dir = tmp_path / "content"
    module = content_dir / "curso-demo" / "modulo-demo"
    module.mkdir(parents=True)
    (module / "topico-demo.md").write_text(markdown, encoding="utf-8")
    return content_dir


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        content_dir=str(_make_content_dir(tmp_path)), lesson_cache_dir=str(tmp_path / "cache")
    )


def _seed_lesson(settings, lesson_body: dict | None = None, provider: FakeLLMProvider | None = None):
    """Genera (y cachea) una LessonPlan de prueba para poder evaluar
    checkpoints contra ella. Devuelve el provider usado (mismo name/model
    que debe reutilizarse para la evaluación, ya que la cache se indexa por
    provider+model)."""
    lesson_provider = provider or FakeLLMProvider(responses=[lesson_body or valid_lesson_body_dict()])
    lesson_generator.generate_lesson(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        provider=lesson_provider,
    )
    return lesson_provider


def _evaluate(settings, provider, scene_id="SCENE-002", answer="Kubernetes orquesta contenedores."):
    return checkpoint_service.evaluate_checkpoint(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        scene_id=scene_id,
        answer=answer,
        provider=provider,
    )


# --------------------------------------------------------------------------
# 1-4. Cada verdict válido
# --------------------------------------------------------------------------


@pytest.mark.parametrize("verdict", ["correct", "partially_correct", "incorrect", "not_assessable"])
def test_each_verdict_is_valid(tmp_path, verdict):
    settings = _settings(tmp_path)
    _seed_lesson(settings)
    eval_provider = FakeLLMProvider(responses=[valid_checkpoint_evaluation_dict(verdict)])
    result = _evaluate(settings, eval_provider)
    assert result.verdict.value == verdict
    assert len(result.feedback) >= 1


# --------------------------------------------------------------------------
# 5. feedback con SRC inexistente rechazado (con reintentos)
# --------------------------------------------------------------------------


def test_feedback_with_nonexistent_src_rejected(tmp_path):
    settings = _settings(tmp_path)
    _seed_lesson(settings)
    bad = valid_checkpoint_evaluation_dict(refs=["SRC-999"])
    eval_provider = FakeLLMProvider(responses=[bad, bad, bad])
    with pytest.raises(GenerationFailedError):
        _evaluate(settings, eval_provider)
    assert len(eval_provider.calls) == 3


# --------------------------------------------------------------------------
# 6. ideal_answer con SRC inexistente rechazado
# --------------------------------------------------------------------------


def test_ideal_answer_with_nonexistent_src_rejected(tmp_path):
    settings = _settings(tmp_path)
    _seed_lesson(settings)
    bad = valid_checkpoint_evaluation_dict()
    bad["ideal_answer"]["source_refs"] = ["SRC-999"]
    eval_provider = FakeLLMProvider(responses=[bad, bad, bad])
    with pytest.raises(GenerationFailedError):
        _evaluate(settings, eval_provider)


# --------------------------------------------------------------------------
# 7. escena inexistente
# --------------------------------------------------------------------------


def test_scene_not_found(tmp_path):
    settings = _settings(tmp_path)
    _seed_lesson(settings)
    eval_provider = FakeLLMProvider(responses=[])
    with pytest.raises(checkpoint_service.CheckpointSceneNotFoundError):
        _evaluate(settings, eval_provider, scene_id="SCENE-999")
    assert len(eval_provider.calls) == 0  # nunca llegó a llamar al LLM


# --------------------------------------------------------------------------
# 8. escena sin interaction
# --------------------------------------------------------------------------


def test_scene_without_interaction_rejected(tmp_path):
    settings = _settings(tmp_path)
    _seed_lesson(settings)  # SCENE-001 tiene interaction=None
    eval_provider = FakeLLMProvider(responses=[])
    with pytest.raises(checkpoint_service.CheckpointNotComprehensionCheckError):
        _evaluate(settings, eval_provider, scene_id="SCENE-001")


# --------------------------------------------------------------------------
# 9. reflection no se evalúa como checkpoint
# --------------------------------------------------------------------------


def test_reflection_scene_rejected(tmp_path):
    settings = _settings(tmp_path)
    _seed_lesson(settings, lesson_body=lesson_body_with_reflection_scene())
    eval_provider = FakeLLMProvider(responses=[])
    with pytest.raises(checkpoint_service.CheckpointNotComprehensionCheckError):
        _evaluate(settings, eval_provider, scene_id="SCENE-001")


# --------------------------------------------------------------------------
# 10. expected_answer no se utiliza como autoridad
# --------------------------------------------------------------------------


def test_expected_answer_passed_only_as_generated_context_not_authority(tmp_path):
    settings = _settings(tmp_path)
    _seed_lesson(settings)  # SCENE-002.interaction.expected_answer = "El Pod." (ver lesson_fixtures)
    eval_provider = FakeLLMProvider(responses=[valid_checkpoint_evaluation_dict("correct")])
    _evaluate(settings, eval_provider)

    sent_user_message = eval_provider.calls[0][1]["content"]
    # El texto de expected_answer llega marcado como contexto generado, NO
    # como autoridad, y el system prompt debe decirlo explícitamente.
    assert "GENERATED CLASS CONTEXT" in sent_user_message
    assert "NO es autoridad" in sent_user_message or "NO autoridad" in sent_user_message
    sent_system_message = eval_provider.calls[0][0]["content"]
    assert "NUNCA es autoridad" in sent_system_message or "gana siempre" in sent_system_message


def test_no_cached_lesson_plan_raises_not_found(tmp_path):
    settings = _settings(tmp_path)
    # No se generó ninguna LessonPlan todavía.
    eval_provider = FakeLLMProvider(configured=True, responses=[])
    with pytest.raises(checkpoint_service.CheckpointLessonPlanNotFoundError):
        _evaluate(settings, eval_provider)


def test_checkpoint_existence_checks_happen_before_provider_config(tmp_path):
    """Igual que /lesson (Fase 3): un 404/409 de existencia debe poder
    responderse incluso sin credencial configurada."""
    settings = _settings(tmp_path)
    _seed_lesson(settings)
    unconfigured = FakeLLMProvider(configured=False, responses=[])
    with pytest.raises(checkpoint_service.CheckpointSceneNotFoundError):
        _evaluate(settings, unconfigured, scene_id="SCENE-999")
    with pytest.raises(checkpoint_service.CheckpointNotComprehensionCheckError):
        _evaluate(settings, unconfigured, scene_id="SCENE-001")


# --------------------------------------------------------------------------
# 11. provider error controlado (sin credencial)
# --------------------------------------------------------------------------


def test_provider_not_configured_raises_after_scene_checks_pass(tmp_path):
    settings = _settings(tmp_path)
    _seed_lesson(settings)
    unconfigured = FakeLLMProvider(configured=False, responses=[])
    with pytest.raises(LLMConfigurationError):
        _evaluate(settings, unconfigured, scene_id="SCENE-002")


# --------------------------------------------------------------------------
# 12. retries limitados
# --------------------------------------------------------------------------


def test_retries_are_bounded(tmp_path):
    settings = _settings(tmp_path)
    _seed_lesson(settings)
    bad = valid_checkpoint_evaluation_dict(refs=["SRC-999"])
    eval_provider = FakeLLMProvider(responses=[bad] * 10)
    with pytest.raises(GenerationFailedError):
        _evaluate(settings, eval_provider)
    assert len(eval_provider.calls) == 3


# --------------------------------------------------------------------------
# Invariantes adicionales del modelo Pydantic
# --------------------------------------------------------------------------


def test_feedback_required_by_pydantic():
    bad = valid_checkpoint_evaluation_dict()
    bad["feedback"] = []
    with pytest.raises(ValidationError):
        CheckpointEvaluationBody.model_validate(bad)


def test_ideal_answer_is_optional():
    body = valid_checkpoint_evaluation_dict()
    body["ideal_answer"] = None
    parsed = CheckpointEvaluationBody.model_validate(body)
    assert parsed.ideal_answer is None
