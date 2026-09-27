"""Orquestador delgado de `TutorLearningContext` (v1.8.0, Bloque 1).

Espejo intencional del par `learning_state.py` (core puro) /
`learning_profile_service.py` (orquestador) ya establecido en v1.7.0
Bloque 4: este módulo es la ÚNICA pieza de la fundación que conoce
`Settings`/`Session`/`user_id`, y su único trabajo es resolver el
`LearningProfile` real vía `learning_profile_service.get_learning_profile`
-- NUNCA reinterpreta filas de `topic_progress`/`certification_attempts`
directamente, y nunca llama a un LLM.

Diseñado para que un futuro `TutorService` (Bloque 2) pueda invocar
`build(...)` en-proceso, sin HTTP y sin refactor: misma forma que
`learning_profile_service.get_learning_profile` (mismos parámetros
`settings`/`session`/`user_id`/`course_id`, más `module_id`/`topic_id`
para identificar el tópico actual).

0 llamadas LLM. 0 side effects: lectura pura sobre datos ya persistidos.
Puede lanzar `course_service.CourseNotFoundError` o cualquier
`SQLAlchemyError` real (Postgres caído) -- nunca se atrapan acá, nunca se
reemplazan por un `TutorLearningContext` "vacío" o por defecto: un fallo
de infraestructura debe propagarse como error real, nunca disfrazarse de
"alumno sin progreso" (ver PASO de privacidad/confiabilidad, Parte E/K de
la especificación de Bloque 1)."""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.config import Settings
from app.services import learning_profile_service
from app.services.tutor_learning_context import TutorLearningContext, build_tutor_learning_context


def build(
    *,
    settings: Settings,
    session: Session,
    user_id: uuid.UUID,
    course_id: str,
    module_id: str,
    topic_id: str,
) -> TutorLearningContext:
    profile = learning_profile_service.get_learning_profile(
        settings=settings, session=session, user_id=user_id, course_id=course_id
    )
    return build_tutor_learning_context(profile, module_id=module_id, topic_id=topic_id)
