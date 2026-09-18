"""Logging estructurado mínimo, compartido por todos los servicios
backend (Fase 5, extendido en Fase 7 con request_id).

Regla dura: nunca pasar acá texto completo de la pregunta del alumno,
conversation history, prompts, Grounding Packet, API keys ni la respuesta
cruda del LLM — solo ids, provider/model, scene_id, duration_ms,
response_type/verdict, etc.
"""
from __future__ import annotations

import logging
from contextvars import ContextVar

# Seteada por RequestIDMiddleware (app/middleware.py) al principio de cada
# request HTTP; log_event la incluye automáticamente si está presente, sin
# que cada servicio tenga que pasarla a mano en cada llamado.
current_request_id: ContextVar[str | None] = ContextVar("current_request_id", default=None)


def log_event(logger: logging.Logger, event: str, **fields: object) -> None:
    request_id = current_request_id.get()
    if request_id is not None:
        fields = {"request_id": request_id, **fields}
    rendered = " ".join(f"{key}={value}" for key, value in fields.items())
    logger.info("%s %s", event, rendered)
