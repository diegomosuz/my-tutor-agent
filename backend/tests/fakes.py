"""Fakes para tests de Fase 3. Ninguno hace llamadas de red reales.

`FakeLLMProvider` implementa el mismo contrato que
`app/services/llm_provider.py:LLMProvider`, pero en vez de llamar a un
proveedor real devuelve (o lanza) los valores precargados en `responses`,
en orden: uno por cada llamada a `generate_structured`. Registra además
todos los mensajes recibidos en `calls`, útil para verificar, por ejemplo,
que un cache hit NO dispara ninguna llamada al provider.
"""
from __future__ import annotations

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
