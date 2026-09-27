"""TutorLearningContext — núcleo puro y determinístico (v1.8.0, Bloque 1:
"ADAPTIVE TUTOR CONTEXT FOUNDATION").

Transforma un `LearningProfile` ya derivado (`app/services/
learning_profile_service.py`, v1.7.0 Bloque 4) en el contexto mínimo que un
futuro Tutor adaptativo podría recibir para saber QUÉ sabe el sistema sobre
el estado de aprendizaje del alumno en este curso -- nunca CÓMO enseñar.

Principio no negociable (idéntico a CLAUDE.md v1.8.0): el LLM nunca decide
`LearningState`. Este módulo no calcula ningún estado nuevo -- reutiliza
exactamente los `LearningState`/`reason_code`/`recent_average` que
`learning_profile_service.get_learning_profile` ya derivó de PostgreSQL, y
la selección de tópicos a repasar reutiliza `get_review_candidates`
(`app/services/learning_state.py`, ya expuesto desde v1.7.0 Bloque 4
explícitamente "para uso interno futuro (ej. Adaptive Tutor)").

Reglas duras:
- Función pura: sin DB, sin `Request`, sin LLM, sin `datetime.now()`, sin
  `random`. La misma entrada produce siempre la misma salida.
- Nunca recibe ni expone: `app_user.id`, email, `display_name`, cualquier
  metadata de identidad/auth, ni evidencia cruda de Certification
  (`answers`, answer key, `question_results`, `practice_id`, timestamps).
- Nunca inventa un estado pedagógico nuevo: los únicos valores posibles de
  `status` son los 4 ya existentes (`not_started`/`progressing`/
  `needs_review`/`mastered`) y los únicos `reason_code` son los 7 ya
  existentes -- ver `app/services/learning_state.py`.
- Selección de tópicos a repasar: sin similaridad semántica, sin
  embeddings, sin vector DB, sin ranking por LLM -- exclusivamente el
  orden determinístico ya provisto por `get_review_candidates` (needs_review
  antes que progressing, desempate por orden curricular real), acotado a
  `MAX_REVIEW_TOPICS` y excluyendo siempre al tópico actual de su propia
  lista de repaso.
- Este módulo NO envía nada a un LLM todavía -- ver
  `docs/ADAPTIVE_TUTOR_V1_8.md` para el punto de integración futuro
  (Bloque 2).
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.services.learning_profile_service import LearningProfile
from app.services.learning_state import (
    LearningStateReasonCode,
    LearningStateStatus,
    get_review_candidates,
)

# PARTE C de la especificación: tope pequeño y fijo, nunca un mínimo --
# un curso sin tópicos "needs_review"/"progressing" reales produce una
# lista vacía, nunca rellenada artificialmente.
MAX_REVIEW_TOPICS = 5


class TutorReviewTopic(BaseModel):
    """Un tópico candidato a repaso -- nunca el tópico actual (excluido
    explícitamente antes de truncar a `MAX_REVIEW_TOPICS`)."""

    module_id: str
    topic_id: str
    module_title: str
    topic_title: str
    status: LearningStateStatus
    reason_code: LearningStateReasonCode
    recent_average: float | None


class TutorCurrentTopicContext(BaseModel):
    """Estado de aprendizaje del alumno para el tópico que está viendo
    ahora mismo. `None` en el modelo contenedor (`TutorLearningContext.
    current_topic`) si `(module_id, topic_id)` no pertenece al curriculum
    real del curso -- nunca se inventa un estado por defecto."""

    module_id: str
    topic_id: str
    status: LearningStateStatus
    reason_code: LearningStateReasonCode
    recent_average: float | None
    observation_count: int


class TutorCourseSummary(BaseModel):
    """Agregados del curso completo -- los mismos cuatro contadores ya
    públicos en `GET .../learning-profile` (v1.7.0 Bloque 4), nunca
    recalculados con una fórmula distinta."""

    total_topics: int
    not_started: int
    progressing: int
    needs_review: int
    mastered: int


class TutorLearningContext(BaseModel):
    """Contexto de aprendizaje determinístico para un `(course_id,
    module_id, topic_id)` puntual. Deliberadamente pequeño y acotado (ver
    `MAX_REVIEW_TOPICS`) -- nunca incluye identidad de usuario, evidencia
    cruda de Certification, ni conversación del Tutor. Ningún campo de
    este modelo llega hoy a un LLM (Bloque 1 == fundación, no integración,
    ver `docs/ADAPTIVE_TUTOR_V1_8.md`)."""

    course_id: str
    current_topic: TutorCurrentTopicContext | None
    course_summary: TutorCourseSummary
    review_topics: list[TutorReviewTopic] = Field(default_factory=list)


def build_tutor_learning_context(
    profile: LearningProfile, *, module_id: str, topic_id: str
) -> TutorLearningContext:
    """Transformación pura `LearningProfile -> TutorLearningContext`. No
    lanza excepciones propias: un `(module_id, topic_id)` fuera del
    curriculum del `profile` simplemente produce `current_topic=None`
    (el llamador -- un futuro Tutor -- decide qué hacer con eso, igual
    que hoy `tutor_service._resolve_scene_context` devuelve `None` en
    casos análogos sin romper el flujo)."""
    current_state = next(
        (
            state
            for state in profile.states
            if state.module_id == module_id and state.topic_id == topic_id
        ),
        None,
    )
    current_topic = (
        TutorCurrentTopicContext(
            module_id=module_id,
            topic_id=topic_id,
            status=current_state.status,
            reason_code=current_state.reason_code,
            recent_average=current_state.evidence.recent_average,
            observation_count=current_state.evidence.observations,
        )
        if current_state is not None
        else None
    )

    review_candidates = [
        state
        for state in get_review_candidates(profile.states)
        if not (state.module_id == module_id and state.topic_id == topic_id)
    ][:MAX_REVIEW_TOPICS]

    curriculum_by_key = {
        (topic.module_id, topic.topic_id): topic for topic in profile.curriculum_topics
    }
    review_topics = [
        TutorReviewTopic(
            module_id=state.module_id,
            topic_id=state.topic_id,
            module_title=curriculum_by_key[(state.module_id, state.topic_id)].module_title,
            topic_title=curriculum_by_key[(state.module_id, state.topic_id)].topic_title,
            status=state.status,
            reason_code=state.reason_code,
            recent_average=state.evidence.recent_average,
        )
        for state in review_candidates
        # Defensivo: `get_review_candidates` opera sobre `profile.states`,
        # que ya se derivó iterando `profile.curriculum_topics` (ver
        # learning_profile_service.py) -- esta clave siempre existe en la
        # práctica, el filtro solo evita un KeyError si esa invariante
        # llegara a romperse en el futuro.
        if (state.module_id, state.topic_id) in curriculum_by_key
    ]

    return TutorLearningContext(
        course_id=profile.course_id,
        current_topic=current_topic,
        course_summary=TutorCourseSummary(
            total_topics=profile.summary.total_topics,
            not_started=profile.summary.not_started,
            progressing=profile.summary.progressing,
            needs_review=profile.summary.needs_review,
            mastered=profile.summary.mastered,
        ),
        review_topics=review_topics,
    )
