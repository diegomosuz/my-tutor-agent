"""Reintentos acotados y genéricos para generación LLM estructurada +
validación de grounding (Fase 5).

`app/services/lesson_generator.py` (Fase 3) ya tiene su propio bucle de
reintentos, ya probado; no se tocó para no arriesgar una regresión en
código existente. Este módulo generaliza el mismo patrón (1 intento
inicial + hasta 2 correcciones; sin retry ante errores de auth/config) para
reutilizarlo desde `TutorService` y `CheckpointService`, evitando
duplicar la lógica dos veces más.
"""
from __future__ import annotations

from typing import Callable, TypeVar

from pydantic import BaseModel, ValidationError

from app.services.llm_provider import (
    LLMAuthError,
    LLMConfigurationError,
    LLMProvider,
    LLMResponseError,
    LLMUpstreamError,
)

ModelT = TypeVar("ModelT", bound=BaseModel)

MAX_GENERATION_ATTEMPTS = 3


class ValidationFailure(Exception):
    """Una función `validate` la lanza cuando el cuerpo generado no pasa
    grounding/invariantes de dominio. `problems` alimenta el mensaje de
    corrección del siguiente intento."""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("; ".join(problems))


class GenerationFailedError(Exception):
    """La generación no produjo una respuesta válida tras agotar los
    reintentos permitidos (JSON/contrato inválido o grounding inválido de
    forma persistente)."""


def generate_with_retries(
    *,
    provider: LLMProvider,
    messages: list[dict[str, str]],
    response_model: type[ModelT],
    validate: Callable[[ModelT], None],
    build_correction_message: Callable[[list[str]], dict[str, str]],
    max_attempts: int = MAX_GENERATION_ATTEMPTS,
    on_retry: Callable[[int, str], None] | None = None,
) -> ModelT:
    """Genera `response_model` con el `provider` dado, validando con
    `validate` (debe lanzar `ValidationFailure` si el cuerpo no es
    aceptable). Reintenta ante contrato/grounding inválido agregando un
    mensaje de corrección (`build_correction_message`), sin reemplazar los
    mensajes ya enviados. Nunca reintenta ante `LLMAuthError` /
    `LLMConfigurationError`. Reintenta (reenviando los mismos mensajes) ante
    `LLMUpstreamError`. Acotado a `max_attempts` intentos totales — nunca un
    loop infinito.
    """
    attempt_messages = list(messages)
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            body = provider.generate_structured(
                messages=attempt_messages, response_model=response_model
            )
        except (LLMAuthError, LLMConfigurationError):
            raise  # errores no recuperables: nunca reintentar
        except LLMUpstreamError as exc:
            last_error = exc
            if attempt >= max_attempts:
                raise
            if on_retry:
                on_retry(attempt, "upstream_error")
            continue
        except (LLMResponseError, ValidationError) as exc:
            last_error = exc
            if attempt >= max_attempts:
                raise GenerationFailedError(
                    f"El proveedor no devolvió una respuesta válida tras {attempt} intentos."
                ) from exc
            attempt_messages = attempt_messages + [build_correction_message([str(exc)])]
            if on_retry:
                on_retry(attempt, "invalid_contract")
            continue

        try:
            validate(body)
        except ValidationFailure as exc:
            last_error = exc
            if attempt >= max_attempts:
                raise GenerationFailedError(
                    f"La respuesta no pasó la validación de grounding tras {attempt} "
                    f"intentos: {exc.problems}"
                ) from exc
            attempt_messages = attempt_messages + [build_correction_message(exc.problems)]
            if on_retry:
                on_retry(attempt, "grounding_invalid")
            continue

        return body

    # No debería alcanzarse: el loop siempre retorna o lanza.
    raise GenerationFailedError(f"No se pudo generar una respuesta válida: {last_error}")
