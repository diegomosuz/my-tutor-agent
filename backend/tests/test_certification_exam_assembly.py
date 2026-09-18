"""Tests de ensamblaje determinístico del examen (Fase 6, sección 56):
resolución de scope, round-robin por tópico, y que la respuesta pública de
`/prepare` nunca incluya el answer key. Ningún test hace llamadas de red ni
usa LLM para el ensamblaje (100% determinístico, sin LLM)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config import Settings
from app.models.certification import CertificationMode, CertificationScope
from app.services import certification_service
from app.services import courses as course_service

from .certification_fixtures import valid_question_bank_body_dict
from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN


def _make_multi_topic_content_dir(tmp_path: Path) -> Path:
    """curso-demo/
         01-modulo-a/  (topico-a1, topico-a2)
         02-modulo-b/  (topico-b1)
    Orden determinístico garantizado por los prefijos numéricos."""
    content_dir = tmp_path / "content"
    module_a = content_dir / "curso-demo" / "01-modulo-a"
    module_b = content_dir / "curso-demo" / "02-modulo-b"
    module_a.mkdir(parents=True)
    module_b.mkdir(parents=True)
    # Reutiliza SAMPLE_TOPIC_MARKDOWN (SRC-001..SRC-004) en los tres
    # tópicos (así los fixtures de GeneratedQuestionBankBody, que citan
    # esas mismas referencias, son válidos en cualquiera de los tres) pero
    # con un bloque final distinto por tópico: el cache key depende de
    # content_sha256 (sección 6 de la especificación), así que un
    # content_sha256 idéntico entre tópicos produciría, por diseño, el
    # mismo cache entry — igual que LessonPlan en Fase 3. Un párrafo final
    # único por tópico evita esa colisión sin alterar SRC-001..004.
    (module_a / "01-topico-a1.md").write_text(
        SAMPLE_TOPIC_MARKDOWN + "\nMarcador único del tópico A1.\n", encoding="utf-8"
    )
    (module_a / "02-topico-a2.md").write_text(
        SAMPLE_TOPIC_MARKDOWN + "\nMarcador único del tópico A2.\n", encoding="utf-8"
    )
    (module_b / "01-topico-b1.md").write_text(
        SAMPLE_TOPIC_MARKDOWN + "\nMarcador único del tópico B1.\n", encoding="utf-8"
    )
    return content_dir


def _settings(tmp_path: Path, content_dir: Path) -> Settings:
    return Settings(
        content_dir=str(content_dir),
        certification_cache_dir=str(tmp_path / "cert-cache"),
    )


def _bank_with_n_questions(n: int) -> dict:
    base = valid_question_bank_body_dict()["questions"]
    questions = []
    for i in range(n):
        q = dict(base[i % len(base)])
        q = {**q, "stem": {"text": f"Pregunta única número {i}", "source_refs": q["stem"]["source_refs"]}}
        questions.append(q)
    return {"questions": questions}


# --------------------------------------------------------------------------
# Resolución de scope
# --------------------------------------------------------------------------


def test_scope_course_resolves_all_topics_in_order(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    resolved = certification_service.resolve_scope(
        settings=settings, course_id="curso-demo", scope=CertificationScope()
    )
    assert resolved == [
        ("modulo-a", "topico-a1"),
        ("modulo-a", "topico-a2"),
        ("modulo-b", "topico-b1"),
    ]


def test_scope_module_resolves_only_that_modules_topics(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    resolved = certification_service.resolve_scope(
        settings=settings,
        course_id="curso-demo",
        scope=CertificationScope(module_ids=["modulo-b"]),
    )
    assert resolved == [("modulo-b", "topico-b1")]


def test_scope_topic_resolves_only_that_topic(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    resolved = certification_service.resolve_scope(
        settings=settings,
        course_id="curso-demo",
        scope=CertificationScope(topic_ids=["topico-a2"]),
    )
    assert resolved == [("modulo-a", "topico-a2")]


def test_scope_invalid_module_raises(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    with pytest.raises(certification_service.CertificationInvalidScopeError):
        certification_service.resolve_scope(
            settings=settings,
            course_id="curso-demo",
            scope=CertificationScope(module_ids=["no-existe"]),
        )


def test_scope_invalid_topic_raises(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    with pytest.raises(certification_service.CertificationInvalidScopeError):
        certification_service.resolve_scope(
            settings=settings,
            course_id="curso-demo",
            scope=CertificationScope(topic_ids=["no-existe"]),
        )


def test_scope_invalid_course_raises_course_not_found(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    with pytest.raises(course_service.CourseNotFoundError):
        certification_service.resolve_scope(
            settings=settings, course_id="no-existe", scope=CertificationScope()
        )


def test_scope_dedups_repeated_topic_ids(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    resolved = certification_service.resolve_scope(
        settings=settings,
        course_id="curso-demo",
        scope=CertificationScope(topic_ids=["topico-a1", "topico-a1", "topico-a2"]),
    )
    assert resolved == [("modulo-a", "topico-a1"), ("modulo-a", "topico-a2")]


# --------------------------------------------------------------------------
# Ensamblaje round-robin
# --------------------------------------------------------------------------


def test_round_robin_balances_across_topics(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(
        responses=[_bank_with_n_questions(3), _bank_with_n_questions(3), _bank_with_n_questions(3)]
    )
    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-demo",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=4,
        shuffle=False,
        provider=provider,
    )
    topic_sequence = [q.topic_id for q in response.questions]
    # round-robin: A, B, C, A (vuelve a la primera tras agotar una ronda)
    assert topic_sequence == ["topico-a1", "topico-a2", "topico-b1", "topico-a1"]


def test_round_robin_continues_with_others_when_one_topic_is_short(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(
        responses=[_bank_with_n_questions(1), _bank_with_n_questions(3), _bank_with_n_questions(3)]
    )
    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-demo",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=5,
        shuffle=False,
        provider=provider,
    )
    assert response.actual_count == 5
    topic_sequence = [q.topic_id for q in response.questions]
    assert topic_sequence.count("topico-a1") == 1  # se agotó tras la primera ronda


def test_requested_count_greater_than_available_returns_available_not_error(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(
        responses=[_bank_with_n_questions(1), _bank_with_n_questions(1), _bank_with_n_questions(1)]
    )
    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-demo",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=30,
        shuffle=False,
        provider=provider,
    )
    assert response.requested_count == 30
    assert response.actual_count == 3
    assert len(response.questions) == 3


def test_question_count_out_of_range_rejected_by_pydantic():
    from pydantic import ValidationError

    from app.models.certification import CertificationPrepareRequest

    with pytest.raises(ValidationError):
        CertificationPrepareRequest(question_count=0)
    with pytest.raises(ValidationError):
        CertificationPrepareRequest(question_count=31)


def test_deterministic_order_without_shuffle(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)

    provider_a = FakeLLMProvider(
        responses=[_bank_with_n_questions(3), _bank_with_n_questions(3), _bank_with_n_questions(3)]
    )
    response_a = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-demo",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=6,
        shuffle=False,
        provider=provider_a,
    )
    ids_a = [q.question_id for q in response_a.questions]

    # Segunda preparación: mismos bancos (cache hit), shuffle=False de nuevo.
    provider_b = FakeLLMProvider(responses=[])
    response_b = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-demo",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=6,
        shuffle=False,
        provider=provider_b,
    )
    ids_b = [q.question_id for q in response_b.questions]
    assert ids_a == ids_b


def test_shuffle_preserves_question_set_just_reorders(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(responses=[_bank_with_n_questions(6)])

    response_no_shuffle = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-demo",
        mode=CertificationMode.practice,
        scope=CertificationScope(topic_ids=["topico-a1"]),
        question_count=6,
        shuffle=False,
        provider=provider,
    )
    response_shuffled = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-demo",
        mode=CertificationMode.practice,
        scope=CertificationScope(topic_ids=["topico-a1"]),
        question_count=6,
        shuffle=True,
        seed=42,
        provider=FakeLLMProvider(responses=[]),  # cache hit, no debería llamarse
    )
    ids_plain = {q.question_id for q in response_no_shuffle.questions}
    ids_shuffled = {q.question_id for q in response_shuffled.questions}
    assert ids_plain == ids_shuffled  # mismo conjunto de preguntas


def test_public_prepare_response_never_contains_answer_key(tmp_path):
    content_dir = _make_multi_topic_content_dir(tmp_path)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-demo",
        mode=CertificationMode.practice,
        scope=CertificationScope(topic_ids=["topico-a1"]),
        question_count=2,
        shuffle=False,
        provider=provider,
    )
    serialized = response.model_dump_json()
    assert "correct_option_ids" not in serialized
    assert "explanation" not in serialized
    assert "derivation_refs" not in serialized
    assert "competency" not in serialized
    parsed = json.loads(serialized)
    for question in parsed["questions"]:
        assert set(question.keys()) == {
            "bank_id",
            "question_id",
            "course_id",
            "module_id",
            "topic_id",
            "question_type",
            "question_style",
            "stem",
            "options",
        }
        for option in question["options"]:
            assert set(option.keys()) == {"option_id", "text"}
