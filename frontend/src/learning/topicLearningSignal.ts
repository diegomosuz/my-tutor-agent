// Señal de aprendizaje por tópico (v1.1.0, bloque de adaptación
// pedagógica) — agregación PURA y determinística, sin LLM, sin backend.
// Ver docs/ADAPTIVE_LEARNING.md para la regla completa.
//
// Combina:
// - status curricular (TopicLearningProgress, ya existente);
// - las últimas N observaciones de `performanceByTopic` de los intentos de
//   certificación de ESTE curso que mencionan a este tópico (identificado
//   por moduleId+topicId — nunca solo topicId, porque el curso real tiene
//   un caso conocido de slug duplicado entre módulos distintos).
//
// Nunca se persiste: se recalcula siempre a partir de
// `CourseLearningProgress` ya cargado (localStorage) + la estructura real
// del curso.
import type { CertificationAttemptSummary, CourseLearningProgress, TopicStatus } from "./types";

/** PARTE 5: últimas N observaciones por tópico, ordenadas por
 * `completedAt` del intento que las produjo. Sin decay matemático — se
 * documenta como regla simple y explícita. */
export const RECENT_OBSERVATIONS_WINDOW = 3;

/** PARTE 4: umbrales de "resultado de práctica" (NUNCA "nivel de dominio
 * certificado" ni "probabilidad de aprobar"). Límites: <60 -> refuerzo
 * necesario; 60-79 -> en desarrollo; >=80 -> fortaleza observada. */
export type ReinforcementLevel = "needs_reinforcement" | "developing" | "observed_strength";

const NEEDS_REINFORCEMENT_MAX = 60; // score < 60
const DEVELOPING_MAX = 80; // 60 <= score < 80; score >= 80 -> observed_strength

export function classifyScore(score: number): ReinforcementLevel {
  if (score < NEEDS_REINFORCEMENT_MAX) return "needs_reinforcement";
  if (score < DEVELOPING_MAX) return "developing";
  return "observed_strength";
}

export interface TopicLearningSignal {
  moduleId: string;
  topicId: string;
  status: TopicStatus;
  /** Cantidad de observaciones consideradas (0 si el tópico nunca apareció
   * en ningún performanceByTopic de este curso). Nunca mayor a
   * RECENT_OBSERVATIONS_WINDOW. */
  observations: number;
  /** Score de la observación más reciente, o null si no hay ninguna. */
  latestScore: number | null;
  /** Promedio de las últimas `observations` (1 a RECENT_OBSERVATIONS_WINDOW).
   * Con una sola observación es igual a `latestScore` — la UI decide si
   * hablar de "resultado observado" (1 obs.) o "resultados recientes"
   * (2+), nunca esta función. */
  recentAverage: number | null;
  reinforcementLevel: ReinforcementLevel | null;
  /** `completedAt` del intento más reciente que mencionó este tópico, o
   * null si ninguno lo hizo. */
  lastObservedAt: string | null;
}

interface TopicObservation {
  score: number;
  completedAt: string;
}

function collectObservations(
  moduleId: string,
  topicId: string,
  attempts: CertificationAttemptSummary[]
): TopicObservation[] {
  const observations: TopicObservation[] = [];
  for (const attempt of attempts) {
    for (const breakdown of attempt.performanceByTopic) {
      if (breakdown.module_id === moduleId && breakdown.topic_id === topicId && breakdown.attempted > 0) {
        observations.push({ score: breakdown.practice_score_percent, completedAt: attempt.completedAt });
      }
    }
  }
  // Más reciente primero.
  observations.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  return observations;
}

/** Señal pura de un tópico: nunca lee/escribe localStorage directamente —
 * recibe `progress`/`attempts` ya cargados por el llamador. */
export function getTopicLearningSignal(
  moduleId: string,
  topicId: string,
  progress: CourseLearningProgress | null,
  attempts: CertificationAttemptSummary[]
): TopicLearningSignal {
  const status: TopicStatus = progress?.topics[`${moduleId}:${topicId}`]?.status ?? "not_started";
  const allObservations = collectObservations(moduleId, topicId, attempts);
  const recent = allObservations.slice(0, RECENT_OBSERVATIONS_WINDOW);

  if (recent.length === 0) {
    return {
      moduleId,
      topicId,
      status,
      observations: 0,
      latestScore: null,
      recentAverage: null,
      reinforcementLevel: null,
      lastObservedAt: null,
    };
  }

  const latestScore = recent[0].score;
  const recentAverage = Math.round((recent.reduce((sum, o) => sum + o.score, 0) / recent.length) * 10) / 10;

  return {
    moduleId,
    topicId,
    status,
    observations: recent.length,
    latestScore,
    recentAverage,
    reinforcementLevel: classifyScore(recentAverage),
    lastObservedAt: recent[0].completedAt,
  };
}
