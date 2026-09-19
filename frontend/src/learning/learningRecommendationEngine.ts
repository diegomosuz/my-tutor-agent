// Motor de recomendaciones de aprendizaje (v1.1.0, bloque de adaptación
// pedagógica) — 100% determinístico, sin LLM, sin backend, sin nueva
// dependencia. Ver docs/ADAPTIVE_LEARNING.md para el algoritmo completo,
// las prioridades y qué NO significa una recomendación.
//
// Regla dura: este motor NUNCA decide "qué debe estudiar" el alumno de
// forma opaca — cada recomendación trae un `reasonCode` + `reasonText`
// construido a partir de datos reales observados (nunca "la IA
// recomienda..."). El LLM no participa en absoluto de este cálculo.
import type { CourseDetail } from "../types/api";
import type { CourseLearningSummary, ModuleSummaryView } from "./courseSummary";
import type { CertificationAttemptSummary, CourseLearningProgress } from "./types";
import { getTopicLearningSignal, type TopicLearningSignal } from "./topicLearningSignal";

export type RecommendationType =
  | "continue_topic"
  | "start_next_topic"
  | "review_topic"
  | "practice_topics"
  | "retry_simulation"
  | "course_completed";

export type ReasonCode =
  | "in_progress_most_recent"
  | "course_not_started"
  | "next_curricular_topic"
  | "low_recent_score"
  | "completed_but_weak"
  | "weak_topics_practice"
  | "sufficient_coverage_simulation"
  | "course_completed_neutral_simulation"
  | "course_completed_with_weakness";

export type RecommendationAction =
  | { kind: "open_topic"; courseId: string; moduleId: string; topicId: string; review: boolean; to: string }
  | { kind: "open_certification_setup"; courseId: string; mode: "practice" | "simulation"; topicIds: string[]; to: string };

export interface LearningRecommendation {
  type: RecommendationType;
  /** 1 = más prioritaria. Determinístico — nunca depende de random ni de
   * heurísticas de ML. */
  priority: number;
  courseId: string;
  moduleId?: string;
  topicId?: string;
  topicIds?: string[];
  reasonCode: ReasonCode;
  /** Texto sobrio, explicable, construido con datos reales — nunca
   * "la IA recomienda..." (PARTE 9). */
  reasonText: string;
  observedData?: {
    score?: number;
    recentAverage?: number;
    observations?: number;
    lastAccessedAt?: string;
  };
  action: RecommendationAction;
}

// PARTE 12: hasta 5 tópicos en una recomendación de práctica de refuerzo.
export const MAX_PRACTICE_REINFORCEMENT_TOPICS = 5;
// Umbral simple y documentado para "cobertura suficiente" fuera de un
// curso ya completado (PARTE 3, tier 6) — deliberadamente simple: al
// menos la mitad del curso completado, y ninguna debilidad observada.
const SUFFICIENT_COVERAGE_RATIO = 0.5;

function topicRoute(courseId: string, moduleId: string, topicId: string, review: boolean): string {
  const base = `/aula/${courseId}/${moduleId}/${topicId}`;
  return review ? `${base}?review=true` : base;
}

function certificationSetupRoute(
  courseId: string,
  mode: "practice" | "simulation",
  topicIds: string[]
): string {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (topicIds.length > 0) params.set("topics", topicIds.join(","));
  return `/certificacion/${courseId}?${params.toString()}`;
}

function findTopicTitle(modules: ModuleSummaryView[], moduleId: string, topicId: string): string {
  for (const module of modules) {
    const topic = module.topics.find((t) => t.moduleId === moduleId && t.topicId === topicId);
    if (topic) return topic.title;
  }
  return topicId;
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? `${score}%` : `${score.toFixed(1)}%`;
}

/** Construye la señal de aprendizaje de TODOS los tópicos curriculares
 * reales del curso (nunca un tópico eliminado del material, PARTE 21). */
function buildAllSignals(
  modules: ModuleSummaryView[],
  progress: CourseLearningProgress | null,
  attempts: CertificationAttemptSummary[]
): TopicLearningSignal[] {
  const signals: TopicLearningSignal[] = [];
  for (const module of modules) {
    for (const topic of module.topics) {
      signals.push(getTopicLearningSignal(topic.moduleId, topic.topicId, progress, attempts));
    }
  }
  return signals;
}

/** PARTE 12: selección determinística de tópicos débiles para una
 * práctica de refuerzo. Orden: menor recentAverage primero; empate por
 * observación más reciente primero; empate estable por orden curricular
 * (el orden en que `signals` ya viene, que respeta el curso real). */
function selectWeakTopicsForPractice(
  signals: TopicLearningSignal[],
  limit = MAX_PRACTICE_REINFORCEMENT_TOPICS
): TopicLearningSignal[] {
  const weak = signals.filter((s) => s.reinforcementLevel === "needs_reinforcement");
  const withCurricularIndex = weak.map((signal, curricularIndex) => ({ signal, curricularIndex }));
  withCurricularIndex.sort((a, b) => {
    const scoreDiff = (a.signal.recentAverage ?? 0) - (b.signal.recentAverage ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const aTime = a.signal.lastObservedAt ? new Date(a.signal.lastObservedAt).getTime() : 0;
    const bTime = b.signal.lastObservedAt ? new Date(b.signal.lastObservedAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime; // más reciente primero
    return a.curricularIndex - b.curricularIndex; // desempate estable curricular
  });
  return withCurricularIndex.slice(0, limit).map((x) => x.signal);
}

/** Motor principal — PURO, determinístico, sin LLM. Devuelve las
 * recomendaciones aplicables, ordenadas por `priority` ascendente (1 =
 * más prioritaria; `course_completed` usa 0, encabezado del curso
 * completo). El llamador (UI) decide cuántas mostrar y cómo agruparlas —
 * ver LearningProgressPage.tsx. */
export function getLearningRecommendations(
  course: CourseDetail,
  summary: CourseLearningSummary,
  progress: CourseLearningProgress | null
): LearningRecommendation[] {
  const courseId = course.id;
  const recommendations: LearningRecommendation[] = [];
  const attempts = progress?.certificationAttempts ?? [];
  const allSignals = buildAllSignals(summary.modules, progress, attempts);
  const hasAnyWeakness = allSignals.some((s) => s.reinforcementLevel === "needs_reinforcement");
  const weakForPractice = selectWeakTopicsForPractice(allSignals);

  // ------------------------------------------------------------------
  // Curso completado (PARTE 13): reemplaza continue/start_next por un
  // encabezado "course_completed" + exactamente UNA recomendación de
  // seguimiento (reforzar si hay debilidad, si no un simulacro neutral).
  // ------------------------------------------------------------------
  if (summary.isCompleted) {
    recommendations.push({
      type: "course_completed",
      priority: 0,
      courseId,
      reasonCode: hasAnyWeakness ? "course_completed_with_weakness" : "course_completed_neutral_simulation",
      reasonText: "Completaste todos los tópicos de este curso.",
      action: hasAnyWeakness
        ? {
            kind: "open_certification_setup",
            courseId,
            mode: "practice",
            topicIds: weakForPractice.map((s) => s.topicId),
            to: certificationSetupRoute(courseId, "practice", weakForPractice.map((s) => s.topicId)),
          }
        : {
            kind: "open_certification_setup",
            courseId,
            mode: "simulation",
            topicIds: [],
            to: certificationSetupRoute(courseId, "simulation", []),
          },
    });

    if (hasAnyWeakness) {
      const topicIds = weakForPractice.map((s) => s.topicId);
      recommendations.push({
        type: "practice_topics",
        priority: 1,
        courseId,
        topicIds,
        reasonCode: "course_completed_with_weakness",
        reasonText:
          "Completaste el curso. Te sugerimos reforzar los tópicos con resultados más bajos antes de un simulacro.",
        observedData: { observations: weakForPractice.length },
        action: {
          kind: "open_certification_setup",
          courseId,
          mode: "practice",
          topicIds,
          to: certificationSetupRoute(courseId, "practice", topicIds),
        },
      });
    } else {
      recommendations.push({
        type: "retry_simulation",
        priority: 1,
        courseId,
        reasonCode: "course_completed_neutral_simulation",
        reasonText: "Podés realizar un simulacro para seguir practicando.",
        action: {
          kind: "open_certification_setup",
          courseId,
          mode: "simulation",
          topicIds: [],
          to: certificationSetupRoute(courseId, "simulation", []),
        },
      });
    }

    return recommendations.sort((a, b) => a.priority - b.priority);
  }

  // ------------------------------------------------------------------
  // Usuario totalmente nuevo (PARTE 19): solo "Comenzar curso", nunca
  // áreas débiles/tendencias/práctica recomendada.
  // ------------------------------------------------------------------
  const isBrandNewUser = summary.lastActivity === null;

  if (summary.continueTarget) {
    const target = summary.continueTarget;
    const isInProgress = target.reason === "in_progress";
    const reasonCode: ReasonCode = isInProgress
      ? "in_progress_most_recent"
      : isBrandNewUser
        ? "course_not_started"
        : "next_curricular_topic";
    const topicProgress = progress?.topics[`${target.moduleId}:${target.topicId}`];
    const reasonText = isInProgress
      ? "Dejaste este tópico en progreso."
      : isBrandNewUser
        ? "Todavía no comenzaste este curso."
        : "Este es el próximo tópico pendiente del curso.";
    recommendations.push({
      type: isInProgress ? "continue_topic" : "start_next_topic",
      priority: 1,
      courseId,
      moduleId: target.moduleId,
      topicId: target.topicId,
      reasonCode,
      reasonText,
      observedData: topicProgress?.lastAccessedAt ? { lastAccessedAt: topicProgress.lastAccessedAt } : undefined,
      action: {
        kind: "open_topic",
        courseId,
        moduleId: target.moduleId,
        topicId: target.topicId,
        review: false,
        to: topicRoute(courseId, target.moduleId, target.topicId, false),
      },
    });
  }

  if (isBrandNewUser) {
    return recommendations;
  }

  const primaryTopicKey = summary.continueTarget
    ? `${summary.continueTarget.moduleId}:${summary.continueTarget.topicId}`
    : null;

  // ------------------------------------------------------------------
  // review_topic: el tópico con señal más débil entre los que ya tienen
  // actividad (in_progress/completed) — cubre en un único cómputo tanto
  // "bajo desempeño reciente" como "completed pero repetidamente débil".
  // ------------------------------------------------------------------
  const weakActiveSignals = allSignals
    .filter((s) => s.status !== "not_started" && s.reinforcementLevel === "needs_reinforcement")
    .filter((s) => `${s.moduleId}:${s.topicId}` !== primaryTopicKey)
    .sort((a, b) => (a.recentAverage ?? 0) - (b.recentAverage ?? 0));

  const weakestActive = weakActiveSignals[0] ?? null;
  if (weakestActive) {
    const title = findTopicTitle(summary.modules, weakestActive.moduleId, weakestActive.topicId);
    const reasonCode: ReasonCode = weakestActive.status === "completed" ? "completed_but_weak" : "low_recent_score";
    const scoreText =
      weakestActive.observations === 1
        ? `Tu resultado más reciente en "${title}" fue ${formatScore(weakestActive.latestScore ?? 0)}.`
        : `En tus últimas ${weakestActive.observations} prácticas de "${title}", el promedio observado fue ${formatScore(weakestActive.recentAverage ?? 0)}.`;
    recommendations.push({
      type: "review_topic",
      priority: 2,
      courseId,
      moduleId: weakestActive.moduleId,
      topicId: weakestActive.topicId,
      reasonCode,
      reasonText: scoreText,
      observedData: {
        score: weakestActive.latestScore ?? undefined,
        recentAverage: weakestActive.recentAverage ?? undefined,
        observations: weakestActive.observations,
        lastAccessedAt: weakestActive.lastObservedAt ?? undefined,
      },
      action: {
        kind: "open_topic",
        courseId,
        moduleId: weakestActive.moduleId,
        topicId: weakestActive.topicId,
        review: true,
        to: topicRoute(courseId, weakestActive.moduleId, weakestActive.topicId, true),
      },
    });
  }

  // ------------------------------------------------------------------
  // practice_topics: hasta 5 tópicos débiles (PARTE 12), cualquier status
  // con observaciones (no solo in_progress/completed).
  // ------------------------------------------------------------------
  if (weakForPractice.length > 0) {
    const topicIds = weakForPractice.map((s) => s.topicId);
    const reasonText =
      weakForPractice.length === 1
        ? `"${findTopicTitle(summary.modules, weakForPractice[0].moduleId, weakForPractice[0].topicId)}" necesita refuerzo según tu resultado más reciente.`
        : `${weakForPractice.length} tópicos necesitan refuerzo según tus resultados recientes.`;
    recommendations.push({
      type: "practice_topics",
      priority: 3,
      courseId,
      topicIds,
      reasonCode: "weak_topics_practice",
      reasonText,
      observedData: { observations: weakForPractice.length },
      action: {
        kind: "open_certification_setup",
        courseId,
        mode: "practice",
        topicIds,
        to: certificationSetupRoute(courseId, "practice", topicIds),
      },
    });
  }

  // ------------------------------------------------------------------
  // retry_simulation: cobertura suficiente (mitad del curso completada)
  // sin ninguna debilidad observada y con al menos un intento previo.
  // ------------------------------------------------------------------
  const coverageRatio = summary.totalTopics > 0 ? summary.completedTopics / summary.totalTopics : 0;
  const hasAnyAttempt = attempts.length > 0;
  if (!hasAnyWeakness && hasAnyAttempt && coverageRatio >= SUFFICIENT_COVERAGE_RATIO) {
    recommendations.push({
      type: "retry_simulation",
      priority: 4,
      courseId,
      reasonCode: "sufficient_coverage_simulation",
      reasonText: `Completaste ${summary.completedTopics} de ${summary.totalTopics} tópicos sin resultados por debajo de 60%. Podés probar un simulacro.`,
      action: {
        kind: "open_certification_setup",
        courseId,
        mode: "simulation",
        topicIds: [],
        to: certificationSetupRoute(courseId, "simulation", []),
      },
    });
  }

  return recommendations.sort((a, b) => a.priority - b.priority);
}
