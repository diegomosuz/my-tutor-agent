"""Tests de concurrencia acotada (waves) para `prepare_exam` (v1.1.0,
bloque de performance — ver docs/PERFORMANCE.md). Usa
`FakeConcurrentLLMProvider` (tests/fakes.py): thread-safe, resuelve la
respuesta por un marcador de contenido único por tópico (nunca por índice
de llamada, que no es determinístico bajo concurrencia real), y registra
`calls`/`current_inflight`/`max_inflight`. Ningún test depende de red ni
de OPENAI_API_KEY (letras A-L de la especificación de performance)."""
from __future__ import annotations

import logging
import threading
from pathlib import Path

import pytest

from app.config import Settings
from app.models.certification import CertificationMode, CertificationScope
from app.services import certification_service
from app.services.llm_provider import LLMAuthError, LLMResponseError

from .certification_fixtures import valid_question_bank_body_dict
from .fakes import FakeConcurrentLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN


def _marker(module_index: int) -> str:
    return f"Marcador único módulo {module_index}."


def _make_course(tmp_path: Path, *, n_modules: int) -> Path:
    """curso-grande/01-modulo-1/01-topico-1.md ... — un tópico por módulo,
    cada uno con un marcador de contenido único (nunca colisiona
    content_sha256 entre tópicos distintos, y permite que el fake
    identifique la llamada sin depender del orden de llegada)."""
    content_dir = tmp_path / "content"
    for m in range(1, n_modules + 1):
        module_dir = content_dir / "curso-grande" / f"{m:02d}-modulo-{m}"
        module_dir.mkdir(parents=True)
        (module_dir / f"01-topico-{m}.md").write_text(
            SAMPLE_TOPIC_MARKDOWN + f"\n{_marker(m)}\n", encoding="utf-8"
        )
    return content_dir


def _settings(tmp_path: Path, content_dir: Path, *, max_concurrency: int = 2) -> Settings:
    return Settings(
        content_dir=str(content_dir),
        certification_cache_dir=str(tmp_path / "cert-cache"),
        certification_max_concurrency=max_concurrency,
    )


def _bank(n: int = 3) -> dict:
    base = valid_question_bank_body_dict()["questions"]
    questions = []
    for i in range(n):
        q = dict(base[i % len(base)])
        q = {**q, "stem": {"text": f"Pregunta única {i}", "source_refs": q["stem"]["source_refs"]}}
        questions.append(q)
    return {"questions": questions}


# --------------------------------------------------------------------------
# A. 30 tópicos, requested=5, concurrency=2: no genera 30 bancos.
# --------------------------------------------------------------------------


def test_A_does_not_generate_all_30_banks(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=30)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    routes = {_marker(m): _bank(3) for m in range(1, 31)}
    provider = FakeConcurrentLLMProvider(routes=routes)

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
    assert len(provider.calls) < 30


# --------------------------------------------------------------------------
# B. Verificar max_inflight <= concurrency configurada.
# --------------------------------------------------------------------------


def test_B_max_inflight_never_exceeds_concurrency_limit(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=10)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    routes = {_marker(m): _bank(3) for m in range(1, 11)}
    delays = {_marker(m): 0.05 for m in range(1, 11)}
    provider = FakeConcurrentLLMProvider(routes=routes, delays=delays)

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=10,  # target_topic_coverage = min(10, 10) = 10: fuerza varias waves completas
        shuffle=False,
        provider=provider,
    )

    assert response.actual_count == 10
    assert provider.max_inflight <= 2
    assert provider.max_inflight >= 1


# --------------------------------------------------------------------------
# C. concurrency=1 reproduce el flujo estrictamente secuencial.
# --------------------------------------------------------------------------


def test_C_works_correctly_with_concurrency_one(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=5)
    settings = _settings(tmp_path, content_dir, max_concurrency=1)
    routes = {_marker(m): _bank(3) for m in range(1, 6)}
    provider = FakeConcurrentLLMProvider(routes=routes)

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
    assert provider.max_inflight == 1


# --------------------------------------------------------------------------
# D. Determinismo: T1 lento (300ms), T2 rápido (50ms) — el resultado
#    respeta el orden CURRICULAR de candidatos, nunca el orden en que
#    terminan las llamadas concurrentes.
# --------------------------------------------------------------------------


def test_D_result_order_is_curricular_not_completion_order(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=2)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    routes = {_marker(1): _bank(1), _marker(2): _bank(1)}
    delays = {_marker(1): 0.3, _marker(2): 0.05}  # modulo-2 termina MUCHO antes que modulo-1
    provider = FakeConcurrentLLMProvider(routes=routes, delays=delays)

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=2,
        shuffle=False,
        provider=provider,
    )

    assert [q.module_id for q in response.questions] == ["modulo-1", "modulo-2"]


# --------------------------------------------------------------------------
# E/F. Early stop entre waves: si la primera wave ya alcanza, la segunda
#      nunca arranca; si no alcanza, sí arranca.
# --------------------------------------------------------------------------


def test_E_sufficient_after_first_wave_never_starts_second(tmp_path, caplog):
    content_dir = _make_course(tmp_path, n_modules=4)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    routes = {_marker(m): _bank(2) for m in range(1, 5)}
    provider = FakeConcurrentLLMProvider(routes=routes)

    with caplog.at_level(logging.INFO, logger="pwc_tutor.certification"):
        response = certification_service.prepare_exam(
            settings=settings,
            course_id="curso-grande",
            mode=CertificationMode.practice,
            scope=CertificationScope(),
            question_count=2,  # target_topic_coverage = min(2, 4) = 2: wave1 (modulo-1/2) ya alcanza
            shuffle=False,
            provider=provider,
        )

    assert response.actual_count == 2
    assert len(provider.calls) == 2  # modulo-3/4 nunca se tocan
    assert "waves_started=1" in caplog.text


def test_F_insufficient_after_first_wave_starts_second(tmp_path, caplog):
    content_dir = _make_course(tmp_path, n_modules=4)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    routes = {_marker(m): _bank(1) for m in range(1, 5)}  # 1 pregunta cada uno -> necesita los 4
    provider = FakeConcurrentLLMProvider(routes=routes)

    with caplog.at_level(logging.INFO, logger="pwc_tutor.certification"):
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
    assert len(provider.calls) == 4
    assert "waves_started=2" in caplog.text


# --------------------------------------------------------------------------
# G. Un banco falla dentro de una wave: el resto de esa wave (y las
#    siguientes) funciona igual.
# --------------------------------------------------------------------------


def test_G_one_bank_fails_in_wave_others_continue(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=3)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    routes = {
        _marker(1): LLMResponseError("contrato inválido"),
        _marker(2): _bank(3),
        _marker(3): _bank(3),
    }
    provider = FakeConcurrentLLMProvider(routes=routes)

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=3,
        shuffle=False,
        provider=provider,
    )

    assert response.actual_count == 3
    assert all(q.module_id != "modulo-1" for q in response.questions)


# --------------------------------------------------------------------------
# H. Error sistémico (auth/config): ninguna wave nueva arranca después.
# --------------------------------------------------------------------------


def test_H_systemic_error_stops_starting_new_waves(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=4)
    settings = _settings(tmp_path, content_dir, max_concurrency=1)
    routes = {_marker(1): LLMAuthError("credencial rechazada")}
    provider = FakeConcurrentLLMProvider(routes=routes)

    with pytest.raises(LLMAuthError):
        certification_service.prepare_exam(
            settings=settings,
            course_id="curso-grande",
            mode=CertificationMode.practice,
            scope=CertificationScope(),
            question_count=4,
            shuffle=False,
            provider=provider,
        )

    assert len(provider.calls) == 1  # modulo-2/3/4 nunca se intentan


# --------------------------------------------------------------------------
# I. Cache suficiente antes de generar: cero llamadas al provider.
# --------------------------------------------------------------------------


def test_I_sufficient_cache_means_zero_provider_calls(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=5)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    warm_provider = FakeConcurrentLLMProvider(routes={_marker(m): _bank(3) for m in range(1, 6)})
    certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=3,
        shuffle=False,
        provider=warm_provider,
    )

    # Segunda corrida: mismo cache dir, provider SIN rutas cargadas — si
    # intentara generar cualquier cosa, el fake revienta con AssertionError.
    cold_provider = FakeConcurrentLLMProvider(routes={})
    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=3,
        shuffle=False,
        provider=cold_provider,
    )

    assert response.actual_count == 3
    assert cold_provider.calls == []


# --------------------------------------------------------------------------
# J. Cache parcial: se genera SOLAMENTE lo que falta (concurrency=1 para
#    una demostración precisa, sin el "hasta concurrency-1 de más" que
#    autoriza PARTE 6 de la especificación para concurrency>1).
# --------------------------------------------------------------------------


def test_J_partial_cache_generates_only_missing(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=3)
    settings = _settings(tmp_path, content_dir, max_concurrency=1)
    warm_provider = FakeConcurrentLLMProvider(routes={_marker(1): _bank(3)})
    certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=1,
        shuffle=False,
        provider=warm_provider,
    )
    assert warm_provider.calls == [_marker(1)]

    # modulo-3 NUNCA debería pedirse: con modulo-1 (cache) + modulo-2
    # (generado) ya alcanza target_topic_coverage=min(2,3)=2.
    provider_b = FakeConcurrentLLMProvider(routes={_marker(2): _bank(3)})
    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=2,
        shuffle=False,
        provider=provider_b,
    )

    assert response.actual_count == 2
    assert provider_b.calls == [_marker(2)]


# --------------------------------------------------------------------------
# K. El scope (curso/módulos/tópicos) se sigue respetando bajo concurrencia.
# --------------------------------------------------------------------------


def test_K_topic_scope_still_respected_under_concurrency(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=3)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    # Solo se pide explícitamente el tópico de modulo-2 — un provider sin
    # rutas para modulo-1/modulo-3 revienta si el scope no se respetara.
    provider = FakeConcurrentLLMProvider(routes={_marker(2): _bank(3)})

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(topic_ids=["topico-2"]),
        question_count=3,
        shuffle=False,
        provider=provider,
    )

    assert response.actual_count == 3
    assert all(q.module_id == "modulo-2" for q in response.questions)
    assert provider.calls == [_marker(2)]


def test_K_module_scope_still_respected_under_concurrency(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=4)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    provider = FakeConcurrentLLMProvider(routes={_marker(1): _bank(3), _marker(2): _bank(3)})

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(module_ids=["modulo-1", "modulo-2"]),
        question_count=6,
        shuffle=False,
        provider=provider,
    )

    assert response.actual_count == 6
    assert set(q.module_id for q in response.questions) == {"modulo-1", "modulo-2"}


# --------------------------------------------------------------------------
# L. Nunca se filtra el answer key bajo el nuevo camino de generación
#    concurrente (regresión del mismo invariante que Fase 6/v1.0.1
#    verifican en test_certification_exam_assembly.py, ejercitado acá con
#    waves reales).
# --------------------------------------------------------------------------


def test_L_no_answer_key_leak_with_concurrent_generation(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=4)
    settings = _settings(tmp_path, content_dir, max_concurrency=2)
    provider = FakeConcurrentLLMProvider(routes={_marker(m): _bank(3) for m in range(1, 5)})

    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-grande",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=4,
        shuffle=False,
        provider=provider,
    )

    dumped = response.model_dump_json()
    assert "correct_option_ids" not in dumped
    assert "explanation" not in dumped
    assert "derivation_refs" not in dumped


# --------------------------------------------------------------------------
# Single-flight a nivel de servicio (PARTE 8/16): dos preparaciones HTTP
# distintas que necesitan el MISMO QuestionBank al mismo tiempo deben
# producir UNA sola generación real — no solo dentro de las waves de una
# preparación (eso ya lo evita `pending` sin duplicados), sino ENTRE dos
# llamadas a `prepare_exam` concurrentes.
# --------------------------------------------------------------------------


def test_singleflight_dedupes_same_bank_across_concurrent_prepare_calls(tmp_path):
    content_dir = _make_course(tmp_path, n_modules=1)
    settings = _settings(tmp_path, content_dir, max_concurrency=1)
    provider = FakeConcurrentLLMProvider(routes={_marker(1): _bank(3)}, delays={_marker(1): 0.2})

    results = []
    errors = []

    def _call():
        try:
            results.append(
                certification_service.prepare_exam(
                    settings=settings,
                    course_id="curso-grande",
                    mode=CertificationMode.practice,
                    scope=CertificationScope(),
                    question_count=3,
                    shuffle=False,
                    provider=provider,
                )
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=_call) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert not errors
    assert len(provider.calls) == 1  # una sola generación real para las 4 preparaciones
    assert len(results) == 4
    assert all(r.actual_count == 3 for r in results)
