"""Single-flight / in-flight request deduplication (v1.1.0, bloque de
performance).

Problema real observado (voz neural, pero el mismo patrón existe en
LessonPlan y QuestionBank): dos requests casi simultáneos para la MISMA
cache key hacen ambos "leer cache -> MISS -> generar -> escribir cache" sin
ningún lock entre medio, así que ambos terminan llamando al proveedor real
por el mismo contenido exacto.

`SingleFlight` deduplica llamadas concurrentes DENTRO DE ESTE PROCESO: si
dos threads piden la misma key al mismo tiempo, solo el primero ("líder")
ejecuta la función; el resto ("seguidores") espera y reutiliza su resultado
(o su excepción, si el líder falló). Nunca deduplica entre procesos ni
instancias distintas — el producto corre un backend local de una sola
instancia (ver docs/PERFORMANCE.md), así que esto es suficiente.

Implementado con `threading.Lock`/`threading.Event` (no asyncio: todo el
backend es síncrono — FastAPI despacha los endpoints `def` a su threadpool,
y los providers LLM/TTS usan httpx/el SDK de OpenAI de forma bloqueante).
"""
from __future__ import annotations

import threading
from typing import Callable, Generic, TypeVar

T = TypeVar("T")


class _InFlightCall(Generic[T]):
    __slots__ = ("_event", "_result", "_exception")

    def __init__(self) -> None:
        self._event = threading.Event()
        self._result: T | None = None
        self._exception: BaseException | None = None

    def set_result(self, result: T) -> None:
        self._result = result
        self._event.set()

    def set_exception(self, exc: BaseException) -> None:
        self._exception = exc
        self._event.set()

    def wait(self) -> T:
        self._event.wait()
        if self._exception is not None:
            raise self._exception
        return self._result  # type: ignore[return-value]


class SingleFlight:
    """Registro de llamadas en curso, por key, para un proceso backend."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._inflight: dict[str, _InFlightCall] = {}

    def call(self, key: str, fn: Callable[[], T], *, on_wait: Callable[[], None] | None = None) -> T:
        """Ejecuta `fn()` deduplicado por `key`.

        Si ya hay una llamada en curso para esta key, este thread NUNCA
        ejecuta `fn` — espera el resultado (o la excepción) de la llamada
        líder. `on_wait` (opcional) se invoca una vez, solo en los threads
        que terminan esperando, útil para logging (`*_singleflight_wait`).

        La entrada in-flight se limpia siempre (éxito o excepción) apenas
        el líder termina, así que no hay memory leak ni estado que se
        acumule entre requests."""
        with self._lock:
            existing = self._inflight.get(key)
            if existing is not None:
                is_leader = False
            else:
                existing = _InFlightCall()
                self._inflight[key] = existing
                is_leader = True

        if not is_leader:
            if on_wait is not None:
                on_wait()
            return existing.wait()

        try:
            result = fn()
        except BaseException as exc:
            existing.set_exception(exc)
            raise
        else:
            existing.set_result(result)
            return result
        finally:
            with self._lock:
                if self._inflight.get(key) is existing:
                    del self._inflight[key]
