"""Fakes para tests de Fase 3. Ninguno hace llamadas de red reales.

`FakeLLMProvider` implementa el mismo contrato que
`app/services/llm_provider.py:LLMProvider`, pero en vez de llamar a un
proveedor real devuelve (o lanza) los valores precargados en `responses`,
en orden: uno por cada llamada a `generate_structured`. Registra además
todos los mensajes recibidos en `calls`, útil para verificar, por ejemplo,
que un cache hit NO dispara ninguna llamada al provider.
"""
from __future__ import annotations

import threading
import time

from pydantic import BaseModel

from app.services.llm_provider import LLMProvider


class FakeLLMProvider(LLMProvider):
    name = "fake"

    def __init__(
        self,
        *,
        model: str = "fake-model",
        configured: bool = True,
        responses: list[object] | None = None,
    ) -> None:
        self._model = model
        self._configured = configured
        self._responses = list(responses or [])
        self.calls: list[list[dict[str, str]]] = []

    def is_configured(self) -> bool:
        return self._configured

    @property
    def model(self) -> str:
        return self._model

    def generate_structured(
        self, *, messages: list[dict[str, str]], response_model: type[BaseModel]
    ) -> BaseModel:
        self.calls.append(messages)
        call_index = len(self.calls) - 1
        if call_index >= len(self._responses):
            raise AssertionError(
                f"FakeLLMProvider: se recibió la llamada #{call_index + 1} pero solo "
                f"hay {len(self._responses)} respuesta(s) precargada(s)."
            )
        item = self._responses[call_index]
        if isinstance(item, Exception):
            raise item
        if isinstance(item, response_model):
            return item
        return response_model.model_validate(item)


class FakeConcurrentLLMProvider(LLMProvider):
    """Fake provider para tests de concurrencia (v1.1.0, bloque de
    performance). A diferencia de `FakeLLMProvider` (que asigna respuestas
    por ÍNDICE de llamada — solo determinístico bajo generación
    estrictamente secuencial), este fake identifica qué responder por un
    MARCADOR único que debe aparecer en el contenido de los mensajes
    recibidos (p.ej. el texto "Marcador único módulo X tópico Y." que ya
    usan los fixtures de test de certificación) — así sigue siendo
    determinístico sin importar en qué orden real llegan las llamadas
    concurrentes de threads distintos.

    Thread-safe: registra `calls` (marcadores, en el orden real de
    llegada), `current_inflight` y `max_inflight` (para verificar bounded
    concurrency), y soporta una latencia artificial configurable por
    marcador (`delays`) para poder forzar de forma determinística qué
    llamada termina primero en un test."""

    name = "fake"

    def __init__(
        self,
        *,
        model: str = "fake-model",
        configured: bool = True,
        routes: dict[str, object],
        delays: dict[str, float] | None = None,
    ) -> None:
        self._model = model
        self._configured = configured
        self._routes = routes
        self._delays = delays or {}
        self._lock = threading.Lock()
        self._inflight = 0
        self.max_inflight = 0
        self.calls: list[str] = []

    def is_configured(self) -> bool:
        return self._configured

    @property
    def model(self) -> str:
        return self._model

    def generate_structured(
        self, *, messages: list[dict[str, str]], response_model: type[BaseModel]
    ) -> BaseModel:
        content = " ".join(m.get("content", "") for m in messages)
        marker = next((mk for mk in self._routes if mk in content), None)
        if marker is None:
            raise AssertionError(
                "FakeConcurrentLLMProvider: ningún marcador conocido apareció en el "
                f"mensaje recibido (primeros 300 chars): {content[:300]!r}"
            )

        with self._lock:
            self._inflight += 1
            self.max_inflight = max(self.max_inflight, self._inflight)
            self.calls.append(marker)

        try:
            delay = self._delays.get(marker, 0.0)
            if delay:
                time.sleep(delay)
            item = self._routes[marker]
            if isinstance(item, Exception):
                raise item
            if isinstance(item, response_model):
                return item
            return response_model.model_validate(item)
        finally:
            with self._lock:
                self._inflight -= 1

    @property
    def current_inflight(self) -> int:
        with self._lock:
            return self._inflight
