// Mapping PRESENTACIONAL de LearningState -> texto en español (v1.6.0,
// Bloque 2: "Learning Insights UI"). Deliberadamente separado de
// learningState.ts: el dominio nunca contiene strings pedagógicos (PARTE
// 29 del Bloque 1, PARTE 13 de este bloque) -- este módulo SÍ los
// contiene, y solo transforma lo que `LearningState`/`TopicLearningSignal`
// ya exponen. Nunca recalcula evidencia, nunca inventa un dato que el
// modelo no tenga (PARTE 14/15/59): nunca menciona Checkpoint (no
// persiste evidencia hoy, ver docs/LEARNING_INTELLIGENCE_V1_6.md), nunca
// resultados por pregunta (el storage nunca los conserva), nunca lenguaje
// de "detectamos que no entendés" (interpretación no observable).
import type { LearningState, LearningStateReasonCode, LearningStateStatus } from "./learningState";

export const LEARNING_STATE_STATUS_LABEL: Record<LearningStateStatus, string> = {
  not_started: "No iniciado",
  progressing: "En progreso",
  needs_review: "Necesita repaso",
  mastered: "Dominado",
};

export const LEARNING_STATE_REASON_COPY: Record<LearningStateReasonCode, string> = {
  NOT_STARTED: "Todavía no empezaste este tema.",
  STARTED_NOT_COMPLETED: "Empezaste este tema y todavía no lo completaste.",
  COMPLETED_NO_ASSESSMENT:
    "Completaste el tema, pero todavía no hay evidencia suficiente para considerarlo dominado.",
  LOW_CERTIFICATION_SCORE: "Tu resultado reciente en certificación indica que conviene repasar este tema.",
  REPEATED_LOW_CERTIFICATION_SCORE: "Los resultados recientes muestran dificultad repetida en este tema.",
  MEDIUM_CERTIFICATION_SCORE:
    "Tus resultados recientes son parciales: todavía no alcanzan para considerarlo dominado.",
  HIGH_CERTIFICATION_SCORE: "Tus resultados recientes muestran un dominio sólido de este tema.",
};

/** Datos concretos de evidencia, únicamente los que `TopicLearningSignal`
 * realmente expone -- nunca recalculados acá (PARTE 15). `null` cuando no
 * hay observaciones (nada útil que mostrar). El "N resultados recientes"
 * (PARTE 16) solo aparece con 2+ observaciones -- con una sola, ya lo
 * dice el promedio, repetir el conteo sería ruido. */
export function describeLearningStateEvidence(state: LearningState): string | null {
  const { evidence } = state;
  if (evidence.observations === 0) return null;
  const parts: string[] = [];
  if (evidence.recentAverage !== null) {
    parts.push(`Promedio reciente de certificación: ${evidence.recentAverage}%`);
  }
  if (evidence.observations >= 2) {
    parts.push(`${evidence.observations} resultados recientes`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
