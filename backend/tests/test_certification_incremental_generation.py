"""Tests del hardening de preparación de certificación (v1.0.1): generación
incremental/demand-driven, early stop, tolerancia a fallos por tópico, y
clasificación correcta de errores LLM. Ningún test hace llamadas de red
(usa `FakeLLMProvider`, igual patrón que el resto de la suite de
certificación) ni depende de OPENAI_API_KEY real (ver PARTE 15 de la
especificación de v1.0.1)."""
from __future__ import annotations

import logging
from pathlib import Path

import pytest

from app.config import Settings
from app.models.certification import CertificationMode, CertificationScope
from app.services import certification_service
from app.services.llm_provider import LLMAuthError, LLMResponseError, LLMUpstreamError
from app.services.llm_retry import GenerationFailedError

from .certification_fixtures import valid_question_bank_body_dict
from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN


def _make_many_topics_content_dir(
    tmp_path: Path, *, n_modules: int, n_topics_per_module: int
) -> Path:
    """curso-grande/01-modulo-1..N/01-topico-1..M — cada tópico con
    contenido único (evita colisión de content_sha256/cache key entre
    tópicos distintos, mismo patrón que el resto de la suite)."""
    content_dir = tmp_path / "content"
    for m in range(1, n_modules + 1):
        module_dir = content_dir / "curso-grande" / f"{m:02d}-modulo-{m}"
        module_dir.mkdir(parents=True)
        for t in range(1, n_topics_per_module + 1):
            (module_dir / f"{t:02d}-topico-{m}-{t}.md").write_text(
                SAMPLE_TOPIC_MARKDOWN + f"\nMarcador único módulo {m} tópico {t}.\n",
                encoding="utf-8",
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
# A. Curso con 30 tópicos, requested_count=5: NUNCA deben generarse 30
#    bancos (FakeLLMProvider revienta con AssertionError si se le pide una
#    llamada de más de las precargadas — señal directa e inequívoca).
# --------------------------------------------------------------------------


def test_large_course_does_not_generate_all_topic_banks(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=6, n_topics_per_module=5)
    settings = _settings(tmp_path, content_dir)
    # Con 5 preguntas pedidas sobre "curso completo" y 30 tópicos
    # candidatos, target_topic_coverage = min(5, 30) = 5. Cada banco trae 3
    # preguntas (15 disponibles tras 5 tópicos) >= 5 pedidas: alcanza para
    # el early stop apenas se cubren esos 5 tópicos. Si el algoritmo
    # intentara un 6to tópico, FakeLLMProvider lanza AssertionError.
    provider = FakeLLMProvider(responses=[_bank_with_n_questions(3) for _ in range(5)])

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=5,
        shuffle=False,
        provider=provider,
    )

    assert len(provider.calls) == 5  # nunca 30
    assert response.actual_count == 5


# --------------------------------------------------------------------------
# B. Selección round-robin/representativa determinística entre módulos.
# --------------------------------------------------------------------------


def test_round_robin_covers_multiple_modules_before_repeating(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=3, n_topics_per_module=3)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(responses=[_bank_with_n_questions(2) for _ in range(3)])

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=3,
        shuffle=False,
        provider=provider,
    )

    module_sequence = [q.module_id for q in response.questions]
    # 3 módulos distintos cubiertos antes de repetir ninguno — nunca
    # concentrado en "modulo-1".
    assert len(set(module_sequence)) == 3


def test_round_robin_ordering_is_deterministic_across_runs(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=4, n_topics_per_module=2)
    settings = _settings(tmp_path, content_dir)

    provider_a = FakeLLMProvider(responses=[_bank_with_n_questions(2) for _ in range(4)])
    response_a = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=4,
        shuffle=False,
        provider=provider_a,
    )
    # Segunda corrida: mismos bancos ya cacheados, provider sin respuestas
    # precargadas — si intentara generar de nuevo, revienta.
    provider_b = FakeLLMProvider(responses=[])
    response_b = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=4,
        shuffle=False,
        provider=provider_b,
    )
    assert [q.topic_id for q in response_a.questions] == [q.topic_id for q in response_b.questions]


# --------------------------------------------------------------------------
# C. Early stop: una vez disponibles suficientes preguntas, no se sigue
#    generando (verificado por el log certification_early_stop y por
#    call-count, igual criterio que el test A).
# --------------------------------------------------------------------------


def test_early_stop_is_logged_once_sufficient_questions_available(tmp_path, caplog):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=10, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(responses=[_bank_with_n_questions(6) for _ in range(5)])

    with caplog.at_level(logging.INFO, logger="pwc_tutor.certification"):
        response = certification_service.prepare_exam(
            settings=settings,
            course_id="curso-grande",
            mode=CertificationMode.practice,
            scope=CertificationScope(),
            question_count=5,
            shuffle=False,
            provider=provider,
        )

    assert response.actual_count == 5
    assert len(provider.calls) == 5  # de los 10 módulos candidatos, nunca los 10
    assert "certification_early_stop" in caplog.text
    assert "certification_bank_generation_skipped" in caplog.text


# --------------------------------------------------------------------------
# D. Primer tópico falla, los siguientes funcionan: debe devolver 200 si
#    llega a requested_count.
# --------------------------------------------------------------------------


def test_first_topic_fails_others_succeed_still_returns_enough_questions(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=5, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)
    # El primer candidato falla las 3 veces permitidas (MAX_GENERATION_ATTEMPTS)
    # con un error de contrato — se salta. Los siguientes 4 responden bien
    # a la primera.
    bad = LLMResponseError("contrato inválido")
    provider = FakeLLMProvider(
        responses=[bad, bad, bad]
        + [_bank_with_n_questions(3), _bank_with_n_questions(3), _bank_with_n_questions(3), _bank_with_n_questions(3)]
    )

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=5,
        shuffle=False,
        provider=provider,
    )

    assert response.actual_count == 5
    topic_ids = {q.topic_id for q in response.questions}
    assert "topico-1-1" not in topic_ids  # el que falló nunca aparece


# --------------------------------------------------------------------------
# E. Tópico intermedio falla DESPUÉS de que ya hay suficientes preguntas:
#    ni siquiera debería intentarse (el early stop ya cortó el loop).
# --------------------------------------------------------------------------


def test_topic_that_would_fail_is_never_attempted_after_early_stop(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=5, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)
    # Si el algoritmo intentara un 6to candidato (no debería, solo hay 5),
    # o si intentara más de los 5 necesarios, FakeLLMProvider revienta al
    # quedarse sin respuestas precargadas — igual que el test A, pero acá
    # el punto es que NINGUNA respuesta de error está en la cola: si el
    # motor intentase un candidato de más, no habría ni siquiera un error
    # que devolver, directamente un AssertionError del fake.
    provider = FakeLLMProvider(responses=[_bank_with_n_questions(3) for _ in range(5)])

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=5,
        shuffle=False,
        provider=provider,
    )
    assert response.actual_count == 5
    assert len(provider.calls) == 5


# --------------------------------------------------------------------------
# F. Bancos ya cacheados se usan ANTES de llamar al LLM.
# --------------------------------------------------------------------------


def test_cached_banks_are_reused_before_calling_llm(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=3, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)

    # Primera preparación: genera y cachea los 3 bancos.
    provider_first = FakeLLMProvider(responses=[_bank_with_n_questions(3) for _ in range(3)])
    certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=9,
        shuffle=False,
        provider=provider_first,
    )
    assert len(provider_first.calls) == 3

    # Segunda preparación: mismo scope/config — TODO debe salir de cache,
    # cero llamadas nuevas al provider.
    provider_second = FakeLLMProvider(responses=[])
    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=9,
        shuffle=False,
        provider=provider_second,
    )
    assert len(provider_second.calls) == 0
    assert response.actual_count == 9


# --------------------------------------------------------------------------
# G. Todos los candidatos fallan por contrato inválido (nunca error de
#    red): debe ser CertificationInsufficientQuestionsError, NUNCA un
#    falso "provider error".
# --------------------------------------------------------------------------


def test_all_topics_fail_with_invalid_contract_raises_insufficient_questions(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=2, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)
    bad = LLMResponseError("contrato inválido")
    # 3 intentos por tópico x 2 tópicos = 6 respuestas malas.
    provider = FakeLLMProvider(responses=[bad] * 6)

    with pytest.raises(certification_service.CertificationInsufficientQuestionsError):
        certification_service.prepare_exam(
            settings=settings,
            course_id="curso-grande",
            mode=CertificationMode.practice,
            scope=CertificationScope(),
            question_count=5,
            shuffle=False,
            provider=provider,
        )


# --------------------------------------------------------------------------
# H. Provider HTTP/network realmente caído en TODOS los candidatos: debe
#    conservar la clasificación de provider error (LLMUpstreamError),
#    nunca CertificationInsufficientQuestionsError.
# --------------------------------------------------------------------------


def test_all_topics_fail_with_real_upstream_error_preserves_provider_error(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=2, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)
    upstream = LLMUpstreamError("timeout de red")
    provider = FakeLLMProvider(responses=[upstream] * 6)

    with pytest.raises(LLMUpstreamError):
        certification_service.prepare_exam(
            settings=settings,
            course_id="curso-grande",
            mode=CertificationMode.practice,
            scope=CertificationScope(),
            question_count=5,
            shuffle=False,
            provider=provider,
        )


def test_systemic_auth_error_aborts_immediately_without_trying_other_topics(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=5, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)
    provider = FakeLLMProvider(responses=[LLMAuthError("credencial rechazada")])

    with pytest.raises(LLMAuthError):
        certification_service.prepare_exam(
            settings=settings,
            course_id="curso-grande",
            mode=CertificationMode.practice,
            scope=CertificationScope(),
            question_count=5,
            shuffle=False,
            provider=provider,
        )
    # Nunca se reintenta un error de auth (llm_retry.py), y nunca se
    # prueba con otro tópico (es sistémico): una sola llamada en total.
    assert len(provider.calls) == 1


# --------------------------------------------------------------------------
# I. Structured Output inválido en un tópico puntual: se clasifica como
#    contrato inválido (se salta ese tópico), no como caída de proveedor.
# --------------------------------------------------------------------------


def test_invalid_structured_output_on_one_topic_is_skipped_not_treated_as_outage(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=3, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)
    bad = LLMResponseError("JSON no parseable")
    provider = FakeLLMProvider(
        responses=[bad, bad, bad]  # tópico 1: agota reintentos, se salta
        + [_bank_with_n_questions(2), _bank_with_n_questions(2)]  # tópicos 2 y 3: OK
    )

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=4,
        shuffle=False,
        provider=provider,
    )
    assert response.actual_count == 4


# --------------------------------------------------------------------------
# J. source_refs de grounding inválidos: se clasifica como
#    grounding/contrato inválido (GenerationFailedError -> se salta el
#    tópico), nunca como caída de proveedor.
# --------------------------------------------------------------------------


def test_invalid_grounding_refs_are_skipped_not_treated_as_outage(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=2, n_topics_per_module=1)
    settings = _settings(tmp_path, content_dir)
    bad_grounding = valid_question_bank_body_dict()
    bad_grounding["questions"][0]["stem"]["source_refs"] = ["SRC-999"]  # no existe
    provider = FakeLLMProvider(
        responses=[bad_grounding, bad_grounding, bad_grounding]  # tópico 1: agota reintentos
        + [valid_question_bank_body_dict()]  # tópico 2: OK
    )

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=2,
        shuffle=False,
        provider=provider,
    )
    assert response.actual_count == 2


# --------------------------------------------------------------------------
# PARTE 14 — smoke de performance reproducible (sin depender de OpenAI
# real): requested=5 sobre un curso con 30 tópicos debe hacer MUCHAS menos
# generaciones que 30. Se mide en número de llamadas al provider, nunca en
# milisegundos.
# --------------------------------------------------------------------------


def test_performance_generations_stay_close_to_minimum_needed(tmp_path):
    content_dir = _make_many_topics_content_dir(tmp_path, n_modules=6, n_topics_per_module=5)
    settings = _settings(tmp_path, content_dir)
    # 30 tópicos candidatos; se precargan 10 respuestas válidas (más que
    # suficiente para cualquier resultado razonable, pero MUY lejos de 30)
    # — si el algoritmo se acercara a generar todo el scope, este test
    # fallaría con AssertionError del fake antes de llegar al assert.
    provider = FakeLLMProvider(responses=[_bank_with_n_questions(3) for _ in range(10)])

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=5,
        shuffle=False,
        provider=provider,
    )

    assert response.actual_count == 5
    # Cobertura mínima esperada: 5 tópicos distintos (target_topic_coverage
    # = min(5, 30)), nunca 30.
    assert len(provider.calls) <= 5
    assert len(provider.calls) < 30
