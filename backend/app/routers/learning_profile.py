"""Endpoint de Learning Profile server-side (v1.7.0, Bloque 4). Responde
"¿cuál es el estado de aprendizaje actual de este usuario para cada
tópico de este curso, y por qué?" — 100% derivado en cada request, sin
LLM, sin persistir `LearningState` (ver
`app/services/learning_state.py`/`learning_profile_service.py`).

Regla dura (idéntica en espíritu a progress.py/certification.py): este
endpoint nunca acepta un `user_id` del cliente -- el usuario actual se
resuelve SIEMPRE vía `get_current_app_user`."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.models import AppUser
from app.db.session import get_db_session
from app.dependencies import get_current_app_user
from app.models.learning_profile import (
    LearningProfileResponse,
    LearningProfileSummary,
    LearningProfileTopicEntry,
)
from app.services import courses as course_service
from app.services import learning_profile_service

router = APIRouter(prefix="/api/courses", tags=["learning-profile"])

_COURSE_NOT_FOUND = "Curso '{}' no encontrado"


@router.get("/{course_id}/learning-profile", response_model=LearningProfileResponse)
def get_learning_profile(
    course_id: str,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> LearningProfileResponse:
    try:
        profile = learning_profile_service.get_learning_profile(
            settings=settings, session=session, user_id=user.id, course_id=course_id
        )
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=_COURSE_NOT_FOUND.format(course_id))

    topics = [
        LearningProfileTopicEntry(
            module_id=curriculum_topic.module_id,
            topic_id=curriculum_topic.topic_id,
            module_title=curriculum_topic.module_title,
            topic_title=curriculum_topic.topic_title,
            curricular_status=state.evidence.status,
            learning_status=state.status,
            reason_code=state.reason_code,
            recent_average=state.evidence.recent_average,
            observation_count=state.evidence.observations,
        )
        # `states` se derivó iterando `curriculum_topics` en el mismo
        # orden (ver learning_profile_service.py) -- zip seguro por
        # construcción, nunca por índice arbitrario.
        for curriculum_topic, state in zip(profile.curriculum_topics, profile.states)
    ]

    return LearningProfileResponse(
        course_id=course_id,
        summary=LearningProfileSummary(
            total_topics=profile.summary.total_topics,
            not_started=profile.summary.not_started,
            progressing=profile.summary.progressing,
            needs_review=profile.summary.needs_review,
            mastered=profile.summary.mastered,
        ),
        topics=topics,
    )
