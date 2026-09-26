"""LearningProfileService (v1.7.0, Bloque 4): orquesta curriculum + topic
progress + Certification history y le pasa estructuras simples (nunca
SQLAlchemy rows) al core puro (`app/services/learning_state.py`).

Diseñado para poder ser invocado directamente por un futuro Adaptive
Tutor backend SIN pasar por HTTP (PASO 35 de la especificación): esta
función nunca conoce `Request`/headers/`X-Dev-User`/identity provider —
recibe siempre `user_id` ya resuelto por el trust boundary del llamador
(hoy el router, a futuro también un Tutor interno).

0 llamadas LLM. 0 side effects: es una lectura pura sobre datos ya
persistidos, nunca escribe DB, nunca actualiza timestamps, nunca crea
progreso ni evidencia.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import Settings
from app.services import certification_history_service
from app.services import courses as course_service
from app.services import topic_progress_service
from app.services.learning_state import (
    CurriculumTopicRef,
    LearningState,
    LearningStateSummary,
    derive_course_learning_states,
    summarize_learning_states,
)


class LearningProfile(BaseModel):
    """Resultado interno de la orquestación — incluye `curriculum_topics`
    (con títulos) para que el router pueda armar la respuesta pública sin
    resolver el curriculum una segunda vez."""

    course_id: str
    curriculum_topics: list[CurriculumTopicRef]
    states: list[LearningState]
    summary: LearningStateSummary


def get_learning_profile(
    *, settings: Settings, session: Session, user_id: uuid.UUID, course_id: str
) -> LearningProfile:
    """Puede lanzar `course_service.CourseNotFoundError` (curso
    inexistente, 404 en el router) o cualquier `SQLAlchemyError` real
    (Postgres caído — nunca se atrapa acá, propaga al handler global de
    `app/main.py`, Bloque 2, que responde 503 limpio)."""
    course_detail = course_service.get_course_detail(settings.content_path, course_id)

    # PASO 17/20: el universo de tópicos y su ORDEN lo define el
    # curriculum real actual -- nunca las filas de topic_progress/
    # certification_topic_results, que pueden contener evidencia stale
    # de un tópico ya eliminado/renombrado.
    curriculum_topics = [
        CurriculumTopicRef(
            module_id=module.id,
            topic_id=topic.id,
            module_title=module.title,
            topic_title=topic.title,
        )
        for module in course_detail.modules
        for topic in module.topics
    ]

    progress_rows = topic_progress_service.get_course_progress(session, user_id, course_id)
    topic_status_by_key = {(row.module_id, row.topic_id): row.status for row in progress_rows}

    # PASO 9/66/67: reutiliza el mismo servicio de Certification history
    # que YA aplica el límite de 50 attempts/curso (HISTORY_SERVE_LIMIT) --
    # nunca se implementa acá una query paralela con semántica distinta.
    # Solo los top-50 attempts participan de la ventana de 3 observaciones
    # por tópico; evidencia más antigua que ya quedó fuera de esos 50
    # nunca resucita.
    attempts = certification_history_service.get_history(session, user_id, course_id)

    states = derive_course_learning_states(course_id, curriculum_topics, topic_status_by_key, attempts)
    summary = summarize_learning_states(course_id, states)

    return LearningProfile(
        course_id=course_id, curriculum_topics=curriculum_topics, states=states, summary=summary
    )
