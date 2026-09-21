// Guided Review Session (v1.6.0, Bloque 3) — construcción del PLAN.
// Función pura: mismo `LearningState[]` de entrada siempre produce el
// mismo plan (PARTE 43). Nunca recalcula score, nunca reordena
// manualmente, nunca usa `learningRecommendationEngine.ts` para decidir
// esta ruta (PARTE 5) — consume EXCLUSIVAMENTE `getReviewCandidates`, ya
// aprobado y sin cambios en `learningState.ts`.
import { getReviewCandidates, type LearningState } from "./learningState";

/** Evitar sesiones enormes (PARTE 7): los primeros 5 `needs_review`, en
 * el orden determinístico que ya devuelve `getReviewCandidates`. Sin
 * scoring nuevo. */
export const MAX_GUIDED_REVIEW_TOPICS = 5;

export interface GuidedReviewTopicRef {
  moduleId: string;
  topicId: string;
}

/** Snapshot inmutable del orden de tópicos al momento de arrancar la
 * sesión (PARTE 9): la sesión nunca se reordena dinámicamente mientras
 * el alumno la recorre, aunque `LearningState` cambie mientras tanto
 * (p. ej. si abre otra pestaña y rinde una certificación). */
export interface GuidedReviewPlan {
  courseId: string;
  topics: GuidedReviewTopicRef[];
  /** Marca de procedencia (PARTE 4): este plan se construyó a partir de
   * LearningState real, nunca de una lista armada a mano. */
  createdFromLearningState: true;
}

/** Guided Review principal usa ÚNICAMENTE `needs_review` (PARTE 6): los
 * tópicos `progressing` siguen disponibles vía "Continuar tema" en Mi
 * aprendizaje, nunca se mezclan automáticamente acá. `null` si no hay
 * ningún `needs_review` (PARTE 8/45) -- nunca lanza, nunca inventa un
 * plan vacío con forma rara. */
export function buildGuidedReviewPlan(courseId: string, states: LearningState[]): GuidedReviewPlan | null {
  const needsReview = getReviewCandidates(states).filter((state) => state.status === "needs_review");
  if (needsReview.length === 0) return null;

  const topics: GuidedReviewTopicRef[] = needsReview
    .slice(0, MAX_GUIDED_REVIEW_TOPICS)
    .map((state) => ({ moduleId: state.moduleId, topicId: state.topicId }));

  return { courseId, topics, createdFromLearningState: true };
}
