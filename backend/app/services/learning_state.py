"""Learning State — motor pedagógico puro y determinístico (v1.7.0,
Bloque 4). Puerto EXACTO de `frontend/src/learning/topicLearningSignal.ts`
+ `frontend/src/learning/learningState.ts` — MISMOS estados, MISMOS reason
codes, MISMOS thresholds, MISMA ventana de 3 observaciones. Este módulo es
una MIGRACIÓN DE CAPACIDAD al backend, no un nuevo modelo pedagógico
(CLAUDE.md v1.7.0 Bloque 4, principio fundamental) — ver
`docs/SERVER_SIDE_PROFILE_V1_7.md` sección "Bloque 4" para la auditoría
completa que respalda cada decisión de este archivo.

Reglas duras:
- Sin DB, sin FastAPI, sin `Request`, sin `datetime.now()`, sin `random`,
  sin LLM. Funciones puras: la misma entrada produce siempre la misma
  salida.
- `LearningState` NUNCA se persiste — cada request lo recalcula desde
  cero a partir de evidencia real (topic progress + Certification
  history), igual que el frontend nunca lo guarda.
"""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel

from app.models.certification import CertificationAttemptEntry

# "not_started" no es un valor real de la columna `topic_progress.status`
# (Bloque 2: sin fila = not_started) — acá representa la ausencia de fila
# ya resuelta por el llamador (`learning_profile_service.py`).
CurricularStatus = Literal["not_started", "in_progress", "completed"]

LearningStateStatus = Literal["not_started", "progressing", "needs_review", "mastered"]

LearningStateReasonCode = Literal[
    "NOT_STARTED",
    "STARTED_NOT_COMPLETED",
    "COMPLETED_NO_ASSESSMENT",
    "LOW_CERTIFICATION_SCORE",
    "REPEATED_LOW_CERTIFICATION_SCORE",
    "MEDIUM_CERTIFICATION_SCORE",
    "HIGH_CERTIFICATION_SCORE",
]

ReinforcementLevel = Literal["needs_reinforcement", "developing", "observed_strength"]

# Mismos valores EXACTOS que topicLearningSignal.ts — nunca reinterpretar.
RECENT_OBSERVATIONS_WINDOW = 3
_NEEDS_REINFORCEMENT_MAX = 60.0  # score < 60 -> needs_reinforcement
_DEVELOPING_MAX = 80.0  # 60 <= score < 80 -> developing; score >= 80 -> observed_strength


def _round_half_up(value: float, ndigits: int = 1) -> float:
    """Replica exactamente `Math.round(x * 10**n) / 10**n` de JavaScript
    (redondea un empate `.5` siempre hacia arriba). El `round()` nativo de
    Python usa "banker's rounding" (redondeo al par más cercano), que
    diverge de JS en un empate real — confirmado con un caso concreto
    (avg=30.25: JS da 30.3, `round(30.25, 1)` de Python da 30.2, ver
    `tests/test_learning_state_parity.py::test_rounding_tie_never_uses_python_native_round`
    y `fixtures/learning_state_parity.json`, caso 13). Los valores acá
    siempre son porcentajes no negativos, así que esta simplificación
    (sin manejo de negativos) es exacta y segura para este dominio."""
    factor = 10**ndigits
    return math.floor(value * factor + 0.5) / factor


def classify_score(score: float) -> ReinforcementLevel:
    if score < _NEEDS_REINFORCEMENT_MAX:
        return "needs_reinforcement"
    if score < _DEVELOPING_MAX:
        return "developing"
    return "observed_strength"


class TopicLearningSignal(BaseModel):
    """Señal pura de un tópico — nunca lee DB/localStorage directamente,
    recibe `attempts` ya resueltos por el llamador."""

    module_id: str
    topic_id: str
    status: CurricularStatus
    observations: int
    latest_score: float | None
    recent_average: float | None
    reinforcement_level: ReinforcementLevel | None
    last_observed_at: str | None


class _Observation(BaseModel):
    score: float
    completed_at: str


def _collect_observations(
    module_id: str, topic_id: str, attempts: list[CertificationAttemptEntry]
) -> list[_Observation]:
    observations: list[_Observation] = []
    for attempt in attempts:
        for breakdown in attempt.performance_by_topic:
            if breakdown.module_id == module_id and breakdown.topic_id == topic_id and breakdown.attempted > 0:
                observations.append(
                    _Observation(score=breakdown.practice_score_percent, completed_at=attempt.completed_at)
                )
    # Más reciente primero — mismo criterio que topicLearningSignal.ts.
    observations.sort(key=lambda o: o.completed_at, reverse=True)
    return observations


def derive_topic_learning_signal(
    module_id: str,
    topic_id: str,
    curricular_status: CurricularStatus,
    attempts: list[CertificationAttemptEntry],
) -> TopicLearningSignal:
    """`attempts` ya debe venir acotado a la ventana top-50 del curso (ver
    `certification_history_service.get_history`, HISTORY_SERVE_LIMIT) —
    este módulo nunca decide cuántos attempts considerar, solo agrega
    dentro de lo que recibe (PASO 9/66/67 de la especificación)."""
    all_observations = _collect_observations(module_id, topic_id, attempts)
    recent = all_observations[:RECENT_OBSERVATIONS_WINDOW]

    if not recent:
        return TopicLearningSignal(
            module_id=module_id,
            topic_id=topic_id,
            status=curricular_status,
            observations=0,
            latest_score=None,
            recent_average=None,
            reinforcement_level=None,
            last_observed_at=None,
        )

    latest_score = recent[0].score
    recent_average = _round_half_up(sum(o.score for o in recent) / len(recent), 1)

    return TopicLearningSignal(
        module_id=module_id,
        topic_id=topic_id,
        status=curricular_status,
        observations=len(recent),
        latest_score=latest_score,
        recent_average=recent_average,
        reinforcement_level=classify_score(recent_average),
        last_observed_at=recent[0].completed_at,
    )


def derive_topic_learning_state(
    signal: TopicLearningSignal,
) -> tuple[LearningStateStatus, LearningStateReasonCode]:
    """Puerto EXACTO de `deriveTopicLearningState` (learningState.ts).
    Precedencia: sin evidencia evaluativa, decide el status curricular
    (`completed` sin evaluación es `progressing`, NUNCA `mastered` — PASO
    23). Con evidencia (`observations > 0`), la evidencia de certificación
    pesa MÁS que el status curricular en cualquier dirección: un score
    alto produce `mastered` aunque el tópico nunca se haya completado en
    el aula, y un score bajo produce `needs_review` aunque esté
    `completed` (PASO 24) — esto es el comportamiento EXISTENTE, no una
    reinterpretación."""
    if signal.observations == 0:
        if signal.status == "not_started":
            return "not_started", "NOT_STARTED"
        if signal.status == "in_progress":
            return "progressing", "STARTED_NOT_COMPLETED"
        return "progressing", "COMPLETED_NO_ASSESSMENT"

    if signal.reinforcement_level == "needs_reinforcement":
        return "needs_review", (
            "REPEATED_LOW_CERTIFICATION_SCORE" if signal.observations >= 2 else "LOW_CERTIFICATION_SCORE"
        )
    if signal.reinforcement_level == "observed_strength":
        return "mastered", "HIGH_CERTIFICATION_SCORE"
    # "developing", o defensivamente cualquier otro valor inesperado (nunca
    # debería alcanzarse con observations > 0, mismo criterio defensivo que
    # el `default` de la versión TypeScript).
    return "progressing", "MEDIUM_CERTIFICATION_SCORE"


class LearningState(BaseModel):
    course_id: str
    module_id: str
    topic_id: str
    status: LearningStateStatus
    reason_code: LearningStateReasonCode
    evidence: TopicLearningSignal


class CurriculumTopicRef(BaseModel):
    """Identidad + títulos de UN tópico real del curriculum actual (nunca
    un tópico eliminado que solo exista en DB) — resuelto por el llamador
    contra el repositorio seguro de cursos."""

    module_id: str
    topic_id: str
    module_title: str
    topic_title: str


def derive_course_learning_states(
    course_id: str,
    curriculum_topics: list[CurriculumTopicRef],
    topic_status_by_key: dict[tuple[str, str], CurricularStatus],
    attempts: list[CertificationAttemptEntry],
) -> list[LearningState]:
    """Itera el CURRICULUM (nunca las filas de DB) — garantiza que (a) un
    tópico sin progreso real aparece como `not_started` y (b) evidencia de
    DB para un tópico que ya no existe en el curriculum real (stale) nunca
    genera un `LearningState` fantasma (PASO 17/19). Orden: el mismo orden
    curricular real en que `curriculum_topics` ya viene (nunca orden de
    DB)."""
    states: list[LearningState] = []
    for topic in curriculum_topics:
        curricular_status = topic_status_by_key.get((topic.module_id, topic.topic_id), "not_started")
        signal = derive_topic_learning_signal(topic.module_id, topic.topic_id, curricular_status, attempts)
        status, reason_code = derive_topic_learning_state(signal)
        states.append(
            LearningState(
                course_id=course_id,
                module_id=topic.module_id,
                topic_id=topic.topic_id,
                status=status,
                reason_code=reason_code,
                evidence=signal,
            )
        )
    return states


class LearningStateSummary(BaseModel):
    course_id: str
    total_topics: int
    not_started: int
    progressing: int
    needs_review: int
    mastered: int
    mastered_percentage: float


def summarize_learning_states(course_id: str, states: list[LearningState]) -> LearningStateSummary:
    not_started = sum(1 for s in states if s.status == "not_started")
    progressing = sum(1 for s in states if s.status == "progressing")
    needs_review = sum(1 for s in states if s.status == "needs_review")
    mastered = sum(1 for s in states if s.status == "mastered")
    total = len(states)
    mastered_percentage = _round_half_up((mastered / total) * 100, 0) if total > 0 else 0.0
    return LearningStateSummary(
        course_id=course_id,
        total_topics=total,
        not_started=not_started,
        progressing=progressing,
        needs_review=needs_review,
        mastered=mastered,
        mastered_percentage=mastered_percentage,
    )


def get_review_candidates(states: list[LearningState]) -> list[LearningState]:
    """Puerto de `getReviewCandidates` (learningState.ts) — expuesto para
    uso interno futuro (ej. Adaptive Tutor), no consumido todavía por
    ningún endpoint de este bloque (PASO 27: la API no necesita exponerlo
    todavía). `needs_review` antes que `progressing`, nunca `not_started`
    ni `mastered`; desempate estable por el orden curricular real en que
    `states` ya viene."""

    def rank(status: LearningStateStatus) -> int:
        return 0 if status == "needs_review" else 1

    indexed = [(i, s) for i, s in enumerate(states) if s.status in ("needs_review", "progressing")]
    indexed.sort(key=lambda pair: (rank(pair[1].status), pair[0]))
    return [s for _, s in indexed]
