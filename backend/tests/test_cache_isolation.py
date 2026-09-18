"""Tests de regresión de aislamiento de cache (Fase 7, sección 2/53).

Dos tópicos distintos con EXACTAMENTE el mismo Markdown producen el mismo
content_sha256. Antes de Fase 7, la cache key de LessonPlan/QuestionBank
dependía solo de content_sha256 + provider + model + prompt_version — sin
identidad de curso/módulo/tópico. Esto significaba que el segundo tópico
en pedir una LessonPlan/QuestionBank con el mismo hash recibía un cache
HIT que en realidad era el documento cacheado del PRIMER tópico, con su
course_id/module_id/topic_id/lesson_id (o bank_id) todavía adentro —
un leak de identidad real, no solo teórico.
"""
from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.services import certification_service, lesson_generator

from .certification_fixtures import valid_question_bank_body_dict
from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN, valid_lesson_body_dict


def _make_two_topics_same_content(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    module_a = content_dir / "course-a" / "module-a"
    module_b = content_dir / "course-a" / "module-b"
    module_a.mkdir(parents=True)
    module_b.mkdir(parents=True)
    (module_a / "topic-a.md").write_text(SAMPLE_TOPIC_MARKDOWN, encoding="utf-8")
    (module_b / "topic-b.md").write_text(SAMPLE_TOPIC_MARKDOWN, encoding="utf-8")
    return content_dir


def test_lesson_plan_identity_never_leaks_between_topics_with_identical_content(tmp_path):
    content_dir = _make_two_topics_same_content(tmp_path)
    settings = Settings(content_dir=str(content_dir), lesson_cache_dir=str(tmp_path / "cache"))

    provider_a = FakeLLMProvider(responses=[valid_lesson_body_dict()])
    plan_a = lesson_generator.generate_lesson(
        settings=settings, course_id="course-a", module_id="module-a", topic_id="topic-a",
        provider=provider_a,
    )
    assert plan_a.cached is False

    provider_b = FakeLLMProvider(responses=[valid_lesson_body_dict()])
    plan_b = lesson_generator.generate_lesson(
        settings=settings, course_id="course-a", module_id="module-b", topic_id="topic-b",
        provider=provider_b,
    )

    # topic-b NUNCA puede devolver la identidad de topic-a, sin importar
    # si el contenido produjo el mismo content_sha256.
    assert plan_b.module_id == "module-b"
    assert plan_b.topic_id == "topic-b"
    assert plan_b.lesson_id != plan_a.lesson_id
    # Cada tópico genera su propia LessonPlan de forma independiente: el
    # segundo NO debe ser un cache-hit del primero (son entidades distintas
    # aunque compartan content_sha256).
    assert plan_b.cached is False
    assert len(provider_b.calls) == 1


def test_lesson_plan_cache_hit_still_works_for_the_same_topic(tmp_path):
    content_dir = _make_two_topics_same_content(tmp_path)
    settings = Settings(content_dir=str(content_dir), lesson_cache_dir=str(tmp_path / "cache"))

    provider = FakeLLMProvider(responses=[valid_lesson_body_dict()])
    first = lesson_generator.generate_lesson(
        settings=settings, course_id="course-a", module_id="module-a", topic_id="topic-a",
        provider=provider,
    )
    assert first.cached is False

    second = lesson_generator.generate_lesson(
        settings=settings, course_id="course-a", module_id="module-a", topic_id="topic-a",
        provider=provider,
    )
    assert second.cached is True
    assert len(provider.calls) == 1  # nunca se volvió a llamar al LLM


def test_question_bank_identity_never_leaks_between_topics_with_identical_content(tmp_path):
    content_dir = _make_two_topics_same_content(tmp_path)
    settings = Settings(
        content_dir=str(content_dir), certification_cache_dir=str(tmp_path / "cert-cache")
    )

    provider_a = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank_a = certification_service.get_or_generate_question_bank(
        settings=settings, course_id="course-a", module_id="module-a", topic_id="topic-a",
        provider=provider_a,
    )

    provider_b = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank_b = certification_service.get_or_generate_question_bank(
        settings=settings, course_id="course-a", module_id="module-b", topic_id="topic-b",
        provider=provider_b,
    )

    assert bank_b.module_id == "module-b"
    assert bank_b.topic_id == "topic-b"
    assert bank_b.bank_id != bank_a.bank_id
    assert len(provider_b.calls) == 1


def test_question_bank_cache_hit_still_works_for_the_same_topic(tmp_path):
    content_dir = _make_two_topics_same_content(tmp_path)
    settings = Settings(
        content_dir=str(content_dir), certification_cache_dir=str(tmp_path / "cert-cache")
    )

    provider = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    first = certification_service.get_or_generate_question_bank(
        settings=settings, course_id="course-a", module_id="module-a", topic_id="topic-a",
        provider=provider,
    )
    second = certification_service.get_or_generate_question_bank(
        settings=settings, course_id="course-a", module_id="module-a", topic_id="topic-a",
        provider=provider,
    )
    assert first.bank_id == second.bank_id
    assert len(provider.calls) == 1


def test_certification_items_per_topic_change_causes_cache_miss(tmp_path):
    content_dir = _make_two_topics_same_content(tmp_path)
    settings_a = Settings(
        content_dir=str(content_dir), certification_cache_dir=str(tmp_path / "cert-cache")
    )
    settings_a.certification_items_per_topic = 6
    provider_a = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank_a = certification_service.get_or_generate_question_bank(
        settings=settings_a, course_id="course-a", module_id="module-a", topic_id="topic-a",
        provider=provider_a,
    )

    settings_b = Settings(
        content_dir=str(content_dir), certification_cache_dir=str(tmp_path / "cert-cache")
    )
    settings_b.certification_items_per_topic = 8
    provider_b = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank_b = certification_service.get_or_generate_question_bank(
        settings=settings_b, course_id="course-a", module_id="module-a", topic_id="topic-a",
        provider=provider_b,
    )

    assert bank_a.bank_id != bank_b.bank_id
    assert len(provider_b.calls) == 1
