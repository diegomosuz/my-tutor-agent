"""Tests unitarios de `app/services/singleflight.py` (v1.1.0, bloque de
performance, PARTE 8/16). Sin red, sin fakes de dominio — ejercita la
clase genérica directamente con threads reales y `time.sleep` corto."""
from __future__ import annotations

import threading
import time

import pytest

from app.services.singleflight import SingleFlight


def test_only_leader_executes_fn_for_same_key():
    sf = SingleFlight()
    call_count = 0
    lock = threading.Lock()

    def slow_fn():
        nonlocal call_count
        with lock:
            call_count += 1
        time.sleep(0.15)
        return "result"

    results: list[str] = []
    threads = [threading.Thread(target=lambda: results.append(sf.call("k", slow_fn))) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert call_count == 1
    assert results == ["result"] * 5


def test_different_keys_never_deduplicate():
    sf = SingleFlight()
    call_count = 0
    lock = threading.Lock()

    def fn():
        nonlocal call_count
        with lock:
            call_count += 1
        time.sleep(0.05)
        return "ok"

    t1 = threading.Thread(target=lambda: sf.call("a", fn))
    t2 = threading.Thread(target=lambda: sf.call("b", fn))
    t1.start()
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)

    assert call_count == 2


def test_followers_receive_leader_exception():
    sf = SingleFlight()

    def failing_fn():
        time.sleep(0.1)
        raise ValueError("boom")

    errors: list[Exception] = []

    def _run():
        try:
            sf.call("k", failing_fn)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=_run) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert len(errors) == 3
    assert all(isinstance(e, ValueError) for e in errors)


def test_entry_cleared_after_success_allows_sequential_reexecution():
    sf = SingleFlight()
    calls = []

    def fn():
        calls.append(1)
        return len(calls)

    first = sf.call("k", fn)
    second = sf.call("k", fn)  # secuencial: la entrada anterior ya se limpió

    assert first == 1
    assert second == 2  # se ejecutó fn() de nuevo, no reutilizó el resultado viejo


def test_entry_cleared_after_exception_allows_retry():
    sf = SingleFlight()

    def failing_once():
        raise RuntimeError("fails")

    with pytest.raises(RuntimeError):
        sf.call("k", failing_once)

    # Si la entrada no se limpiara tras la excepción, este segundo intento
    # (misma key, secuencial) se quedaría esperando un resultado que nunca
    # va a llegar (deadlock) — timeout del propio test es la red de
    # seguridad, pero con la limpieza correcta ni hace falta.
    result = sf.call("k", lambda: "recovered")
    assert result == "recovered"


def test_on_wait_called_only_for_followers():
    sf = SingleFlight()
    wait_calls = []
    lock = threading.Lock()

    def slow_fn():
        time.sleep(0.15)
        return "done"

    def leader():
        sf.call("k", slow_fn, on_wait=lambda: wait_calls.append("leader"))

    def follower():
        time.sleep(0.02)  # asegura que arranque después del líder
        sf.call("k", slow_fn, on_wait=lambda: wait_calls.append("follower"))

    t1 = threading.Thread(target=leader)
    t2 = threading.Thread(target=follower)
    t1.start()
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)

    assert wait_calls == ["follower"]


def test_no_deadlock_with_many_concurrent_followers():
    """No debe haber deadlock ni starvation con varios followers esperando
    al mismo líder — todos deben desbloquearse dentro de un timeout
    razonable (no un sleep largo: la propia latencia del líder es corta)."""
    sf = SingleFlight()

    def fn():
        time.sleep(0.05)
        return "ok"

    results: list[str] = []
    lock = threading.Lock()

    def _run():
        r = sf.call("shared-key", fn)
        with lock:
            results.append(r)

    threads = [threading.Thread(target=_run) for _ in range(20)]
    started_at = time.monotonic()
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)
    elapsed = time.monotonic() - started_at

    assert len(results) == 20
    assert elapsed < 4.0  # generoso; el trabajo real toma ~0.05s
