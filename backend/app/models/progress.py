"""Esquemas Pydantic del contrato público de progreso curricular (v1.7.0,
Bloque 2). Ningún modelo de este archivo expone columnas internas
(`id`/`created_at`/`updated_at` de la fila, ni `user_id` -- la identidad
del usuario nunca viaja en el body, siempre se resuelve server-side vía
`get_current_app_user`)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Límites de sanidad (PASO 60 de la especificación): nunca un vector de DoS
# vía identificadores desproporcionados; los slugs reales de curso/módulo/
# tópico son siempre cortos.
_MAX_ID_LENGTH = 200
_MAX_LEGACY_IMPORT_ENTRIES = 500

TopicProgressStatus = Literal["in_progress", "completed"]


class TopicProgressEntry(BaseModel):
    module_id: str
    topic_id: str
    status: TopicProgressStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None


class CourseProgressResponse(BaseModel):
    course_id: str
    topics: list[TopicProgressEntry] = Field(default_factory=list)


class MarkProgressRequest(BaseModel):
    action: Literal["start", "complete"]


class LegacyImportTopicEntry(BaseModel):
    """Una entrada del documento legacy de `localStorage`
    (`pwc-tutor:learning-progress:v1`) que el frontend envía para fusionar
    con el servidor (PASO 31: nunca incluye intentos de Certification,
    evidencia de Guided Review ni VerificationContext -- exclusivamente
    progreso curricular)."""

    module_id: str = Field(min_length=1, max_length=_MAX_ID_LENGTH)
    topic_id: str = Field(min_length=1, max_length=_MAX_ID_LENGTH)
    status: TopicProgressStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None


class LegacyImportRequest(BaseModel):
    topics: list[LegacyImportTopicEntry] = Field(default_factory=list, max_length=_MAX_LEGACY_IMPORT_ENTRIES)
