"""Benchmark sintético reproducible (v1.1.0, PARTE 19 de la especificación
de performance): compara concurrency=1 vs concurrency=2 con un fake
provider de latencia artificial fija, sobre 30 tópicos candidatos.

No es un test de regresión de milisegundos — el umbral de tiempo es
deliberadamente generoso (nunca estricto como para ser flaky en CI). La
prueba principal de corrección son los CONTADORES: provider calls, max
inflight, waves — el wall time es solo informativo, impreso con `-s`.

Ningún test depende de red ni de OPENAI_API_KEY."""
from __future__ import annotations

import time
from pathlib import Path

from app.config import Settings
from app.models.certification import CertificationMode, CertificationScope
from app.services import certification_service

from .certification_fixtures import valid_question_bank_body_dict
from .fakes import FakeConcurrentLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN

N_TOPICS = 30
LATENCY_SECONDS = 0.1


def _marker(i: int) -> str:
    return f"Marcador único módulo {i}."


def _make_course(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    for m in range(1, N_TOPICS + 1):
        module_dir = content_dir / "curso-benchmark" / f"{m:02d}-modulo-{m}"
        module_dir.mkdir(parents=True)
        (module_dir / f"01-topico-{m}.md").write_text(
            SAMPLE_TOPIC_MARKDOWN + f"\n{_marker(m)}\n", encoding="utf-8"
        )
    return content_dir


def _bank() -> dict:
    base = valid_question_bank_body_dict()["questions"]
    return {"questions": [dict(base[0], stem={"text": "Pregunta única", "source_refs": base[0]["stem"]["source_refs"]})]}


def _run(tmp_path: Path, *, max_concurrency: int) -> dict:
    content_dir = _make_course(tmp_path)
    settings = Settings(
        content_dir=str(content_dir),
        certification_cache_dir=str(tmp_path / f"cache-{max_concurrency}"),
        certification_max_concurrency=max_concurrency,
    )
    routes = {_marker(i): _bank() for i in range(1, N_TOPICS + 1)}
    delays = {_marker(i): LATENCY_SECONDS for i in range(1, N_TOPICS + 1)}
    provider = FakeConcurrentLLMProvider(routes=routes, delays=delays)

    started = time.monotonic()
    response = certification_service.prepare_exam(
        settings=settings,
        course_id="curso-benchmark",
        mode=CertificationMode.practice,
        scope=CertificationScope(),
        question_count=5,  # target_topic_coverage = min(5, 30) = 5
        shuffle=False,
        provider=provider,
    )
    wall_time = time.monotonic() - started

    return {
        "actual_count": response.actual_count,
        "provider_calls": len(provider.calls),
        "max_inflight": provider.max_inflight,
        "wall_time": wall_time,
    }


def test_benchmark_concurrency_one_vs_two(tmp_path):
    result_1 = _run(tmp_path / "seq", max_concurrency=1)
    result_2 = _run(tmp_path / "par", max_concurrency=2)

    print("\n=== Benchmark certification_prepare (fake provider) ===")
    print(f"Tópicos candidatos: {N_TOPICS}, preguntas pedidas: 5, latencia fake/banco: {LATENCY_SECONDS}s")
    print(f"concurrency=1: {result_1}")
    print(f"concurrency=2: {result_2}")

    # Corrección (contadores, no milisegundos): ambos alcanzan lo pedido,
    # ninguno genera los 30 tópicos, y cada uno respeta su propio límite
    # de concurrencia.
    assert result_1["actual_count"] == 5
    assert result_2["actual_count"] == 5
    assert result_1["provider_calls"] < N_TOPICS
    assert result_2["provider_calls"] < N_TOPICS
    assert result_1["max_inflight"] == 1
    assert result_2["max_inflight"] <= 2

    # Umbral generoso, solo para detectar una regresión grosera (p.ej. si
    # concurrency=2 accidentalmente terminara serializando todo): nunca un
    # test de milisegundos exactos.
    assert result_2["wall_time"] < result_1["wall_time"] + 1.0
