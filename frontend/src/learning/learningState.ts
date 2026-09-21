// Learning State (v1.6.0, Bloque 1: "Learning Evidence + Deterministic
// Learning State") — capa de interpretación pedagógica PURA y
// determinística sobre la evidencia YA agregada por
// `topicLearningSignal.ts` (v1.1.0). Ver docs/LEARNING_INTELLIGENCE_V1_6.md
// para el análisis completo (qué evidencia existe hoy, qué NO persiste
// todavía, y las reglas de derivación documentadas).
//
// Regla dura de diseño: este módulo NUNCA vuelve a leer localStorage, NUNCA
// llama a un LLM, NUNCA usa `Date.now()`/randomness internamente, y NUNCA
// reimplementa la agregación de evidencia que `getTopicLearningSignal` ya
// hace correctamente (mismos thresholds, misma ventana de observaciones
// recientes) — evita dos fuentes de verdad para "qué tan bien le fue a un
// alumno en un tópico" que podrían divergir con el tiempo.
//
// `TopicLearningSignal` (status curricular + observaciones de
// certificación + `reinforcementLevel`) YA ES, en este codebase, la
// "evidencia agregada" de un tópico -- por eso se reutiliza tal cual como
// el campo `evidence` de `LearningState`, en vez de duplicar sus campos
// bajo un nombre nuevo.
import type { ModuleSummaryView } from "./courseSummary";
import { getTopicLearningSignal, type TopicLearningSignal } from "./topicLearningSignal";
import type { CertificationAttemptSummary, CourseLearningProgress } from "./types";

/** Estados pedagógicos unificados (PARTE 8 de la especificación). Cuatro
 * únicamente -- no se agregan más sin necesidad demostrada por Guided
 * Review (Bloque 2). */
export type LearningStateStatus = "not_started" | "progressing" | "needs_review" | "mastered";

/** Reason codes determinísticos (PARTE 9/29): nunca texto libre dentro de
 * la lógica de dominio -- la UI futura decide cómo traducir esto a
 * lenguaje humano. Reflejan EXACTAMENTE las fuentes de evidencia reales
 * auditadas (certificación); nunca se adoptaron nombres de ejemplo tipo
 * "CHECKPOINT" porque Checkpoint no persiste evidencia hoy (ver
 * docs/LEARNING_INTELLIGENCE_V1_6.md sección "Evidencia que NO persiste"). */
export type LearningStateReasonCode =
  | "NOT_STARTED"
  | "STARTED_NOT_COMPLETED"
  | "COMPLETED_NO_ASSESSMENT"
  | "LOW_CERTIFICATION_SCORE"
  | "REPEATED_LOW_CERTIFICATION_SCORE"
  | "MEDIUM_CERTIFICATION_SCORE"
  | "HIGH_CERTIFICATION_SCORE";

/** Interpretación pedagógica de UN tópico + la evidencia de la que se
 * derivó (PARTE 28: explicabilidad -- todo estado distinto de
 * `not_started` puede señalar exactamente qué evidencia lo produjo). */
export interface LearningState {
  courseId: string;
  moduleId: string;
  topicId: string;
  status: LearningStateStatus;
  reasonCode: LearningStateReasonCode;
  evidence: TopicLearningSignal;
}

/** Resumen determinístico a nivel curso (PARTE 25). Los cuatro counts
 * siempre suman `totalTopics` (partición exacta de `states`). */
export interface LearningStateSummary {
  courseId: string;
  totalTopics: number;
  notStarted: number;
  progressing: number;
  needsReview: number;
  mastered: number;
  /** Redondeado, mismo criterio que `CourseLearningSummary.progressPercentage`
   * (`courseSummary.ts`) -- 0 si el curso no tiene tópicos. */
  masteredPercentage: number;
}

/** Deriva el estado pedagógico de UN tópico a partir de su
 * `TopicLearningSignal` ya calculado. Función PURA: mismo `signal` de
 * entrada siempre produce el mismo resultado (PARTE 18 -- determinismo).
 *
 * Reglas de precedencia (documentadas en detalle en
 * docs/LEARNING_INTELLIGENCE_V1_6.md):
 *
 * 1. Sin evidencia de evaluación (`observations === 0`): el status
 *    curricular decide, y **completar un tópico nunca implica dominarlo**
 *    (PARTE 15 -- `completed` sin evaluación es `progressing`, nunca
 *    `mastered`).
 * 2. Con evidencia de evaluación (`observations > 0`): la evidencia de
 *    certificación pesa MÁS que el status curricular (PARTE 12 -- un
 *    resultado de certificación bajo en un tópico ya `completed` produce
 *    `needs_review`, nunca `completed`/`mastered` -- ver PARTE 39 de la
 *    especificación, "evidencia en conflicto"). `reinforcementLevel` ya
 *    viene calculado por `getTopicLearningSignal` con el mismo criterio
 *    de `recentAverage` (ventana de hasta `RECENT_OBSERVATIONS_WINDOW`
 *    observaciones más recientes, nunca solo el último intento -- PARTE
 *    13: reutiliza la política YA elegida en v1.1.0, no una nueva).
 * 3. `REPEATED_LOW_CERTIFICATION_SCORE` (PARTE 14) se distingue de
 *    `LOW_CERTIFICATION_SCORE` únicamente por `observations >= 2` --
 *    nunca un contador nuevo, reutiliza el mismo campo que ya cuenta
 *    cuántas observaciones recientes existen.
 */
export function deriveTopicLearningState(
  signal: TopicLearningSignal
): { status: LearningStateStatus; reasonCode: LearningStateReasonCode } {
  if (signal.observations === 0) {
    if (signal.status === "not_started") {
      return { status: "not_started", reasonCode: "NOT_STARTED" };
    }
    if (signal.status === "in_progress") {
      return { status: "progressing", reasonCode: "STARTED_NOT_COMPLETED" };
    }
    // status === "completed": recorrido, pero sin evidencia de evaluación
    // -- completion NO es mastery (PARTE 15).
    return { status: "progressing", reasonCode: "COMPLETED_NO_ASSESSMENT" };
  }

  switch (signal.reinforcementLevel) {
    case "needs_reinforcement":
      return {
        status: "needs_review",
        reasonCode: signal.observations >= 2 ? "REPEATED_LOW_CERTIFICATION_SCORE" : "LOW_CERTIFICATION_SCORE",
      };
    case "observed_strength":
      return { status: "mastered", reasonCode: "HIGH_CERTIFICATION_SCORE" };
    case "developing":
    default:
      // `default` es puramente defensivo: `getTopicLearningSignal` siempre
      // setea `reinforcementLevel` cuando `observations > 0` -- nunca debería
      // alcanzarse, pero una función pura no debe lanzar ante un shape
      // inesperado (PARTE 45, mismo espíritu de "safe fallback").
      return { status: "progressing", reasonCode: "MEDIUM_CERTIFICATION_SCORE" };
  }
}

/** Deriva el `LearningState` de TODOS los tópicos curriculares reales de
 * un curso, en orden curricular (PARTE 17: derivación pura, sin side
 * effects -- nunca lee/escribe localStorage). `modules` debe venir de
 * `buildCourseLearningSummary` (`courseSummary.ts`), que ya resuelve la
 * estructura REAL y actual del curso -- un tópico eliminado/renombrado
 * que solo existe en localStorage nunca aparece acá (PARTE 24, sin
 * necesidad de un framework de migración). */
export function deriveCourseLearningStates(
  courseId: string,
  modules: ModuleSummaryView[],
  progress: CourseLearningProgress | null
): LearningState[] {
  const attempts: CertificationAttemptSummary[] = progress?.certificationAttempts ?? [];
  const states: LearningState[] = [];
  for (const module of modules) {
    for (const topic of module.topics) {
      const signal = getTopicLearningSignal(topic.moduleId, topic.topicId, progress, attempts);
      const { status, reasonCode } = deriveTopicLearningState(signal);
      states.push({
        courseId,
        moduleId: topic.moduleId,
        topicId: topic.topicId,
        status,
        reasonCode,
        evidence: signal,
      });
    }
  }
  return states;
}

/** Resumen a nivel curso (PARTE 25). Partición exacta de `states`: los
 * cuatro counts siempre suman `states.length`. */
export function summarizeLearningStates(courseId: string, states: LearningState[]): LearningStateSummary {
  const notStarted = states.filter((s) => s.status === "not_started").length;
  const progressing = states.filter((s) => s.status === "progressing").length;
  const needsReview = states.filter((s) => s.status === "needs_review").length;
  const mastered = states.filter((s) => s.status === "mastered").length;
  const totalTopics = states.length;
  return {
    courseId,
    totalTopics,
    notStarted,
    progressing,
    needsReview,
    mastered,
    masteredPercentage: totalTopics > 0 ? Math.round((mastered / totalTopics) * 100) : 0,
  };
}

/** Candidatos a repaso (PARTE 26/27) -- preparación para Guided Review
 * (Bloque 2), sin construir ninguna ruta ni navegación automática todavía.
 * Incluye `needs_review` (evidencia clara de que hace falta reforzar) y
 * `progressing` (actividad sin evidencia de dominio suficiente todavía) --
 * nunca `not_started` (nada que repasar) ni `mastered` (ya no es
 * candidato). Orden: `needs_review` antes de `progressing` (prioridad
 * simple, sin scoring), y dentro de cada grupo se preserva el orden
 * curricular real en el que `states` ya viene (curso -> módulo -> tópico)
 * -- nunca un ranking por LLM ni un score compuesto. */
export function getReviewCandidates(states: LearningState[]): LearningState[] {
  const rank = (status: LearningStateStatus): number => (status === "needs_review" ? 0 : 1);
  return states
    .map((state, curricularIndex) => ({ state, curricularIndex }))
    .filter((x) => x.state.status === "needs_review" || x.state.status === "progressing")
    .sort((a, b) => {
      const rankDiff = rank(a.state.status) - rank(b.state.status);
      if (rankDiff !== 0) return rankDiff;
      return a.curricularIndex - b.curricularIndex; // estable: orden curricular
    })
    .map((x) => x.state);
}
