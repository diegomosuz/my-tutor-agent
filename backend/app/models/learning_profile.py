"""Esquemas Pydantic del contrato público de Learning Profile (v1.7.0,
Bloque 4). Ningún modelo de este archivo expone: `answers`, answer key,
`question_results`, conversación del Tutor, ni el historial completo de
Certification (para eso existe `GET .../certification/history`, ver PASO
44 — este endpoint nunca lo repite)."""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.services.learning_state import CurricularStatus, LearningStateReasonCode, LearningStateStatus


class LearningProfileSummary(BaseModel):
    total_topics: int
    not_started: int
    progressing: int
    needs_review: int
    mastered: int


class LearningProfileTopicEntry(BaseModel):
    module_id: str
    topic_id: str
    module_title: str
    topic_title: str
    curricular_status: CurricularStatus
    learning_status: LearningStateStatus
    reason_code: LearningStateReasonCode
    # Evidencia agregada funcional (nunca `answers`/answer key/question
    # results, ver PASO 43/75).
    recent_average: float | None
    observation_count: int


class LearningProfileResponse(BaseModel):
    course_id: str
    summary: LearningProfileSummary
    topics: list[LearningProfileTopicEntry] = Field(default_factory=list)
