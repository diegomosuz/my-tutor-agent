"""Contrato de POST /api/speech (Fase 7). El frontend NUNCA puede enviar
API key, model, voice ni instructions — esos son configuración exclusiva
del backend (`Settings`)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
