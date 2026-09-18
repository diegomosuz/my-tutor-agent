"""Logging estructurado mínimo, compartido por TutorService y
CheckpointService (Fase 5).

Regla dura: nunca pasar acá texto completo de la pregunta del alumno,
conversation history, prompts, Grounding Packet, API keys ni la respuesta
cruda del LLM — solo ids, provider/model, scene_id, duration_ms,
response_type/verdict, etc.
"""
from __future__ import annotations

import logging


def log_event(logger: logging.Logger, event: str, **fields: object) -> None:
    rendered = " ".join(f"{key}={value}" for key, value in fields.items())
    logger.info("%s %s", event, rendered)
