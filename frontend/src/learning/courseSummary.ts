// Agregación PURA y determinística (sin LLM, sin random) de un
// `CourseLearningProgress` guardado contra la estructura REAL y actual
// del curso (`CourseDetail`, vía API) — así un tópico nunca antes
// iniciado siempre aparece con su título correcto, y el store nunca
// necesita guardar títulos (evita duplicación/staleness, ver PARTE 1).
import type { CourseDetail } from "../types/api";
import type { CourseLearningProgress, TopicStatus } from "./types";

export interface TopicSummaryView {
  moduleId: string;
  topicId: string;
  title: string;
  status: TopicStatus;
}

export interface ModuleSummaryView {
  moduleId: string;
  title: string;
  totalTopics: number;
  completedTopics: number;
  inProgressTopics: number;
  progressPercentage: number;
  topics: TopicSummaryView[];
}

export interface ContinueTarget {
  moduleId: string;
  topicId: string;
  title: string;
  reason: "in_progress" | "not_started";
}

export interface CourseLearningSummary {
  courseId: string;
  totalModules: number;
  totalTopics: number;
  completedTopics: number;
  inProgressTopics: number;
  progressPercentage: number;
  /** ISO timestamp del tópico accedido más recientemente, o null si el
   * alumno nunca abrió ningún tópico de este curso. */
  lastActivity: string | null;
  /** null cuando el curso está completo (todos los tópicos `completed`)
   * o no tiene tópicos — la UI debe mostrar "Curso completado" en ese
   * caso, nunca un target inválido. */
  continueTarget: ContinueTarget | null;
  modules: ModuleSummaryView[];
  isCompleted: boolean;
}

function statusOf(progress: CourseLearningProgress | null, moduleId: string, topicId: string): TopicStatus {
  return progress?.topics[`${moduleId}:${topicId}`]?.status ?? "not_started";
}

function round(value: number): number {
  return Math.round(value);
}

/** PARTE 7: regla de "Continuar aprendiendo", 100% determinística.
 *
 * 1. El tópico `in_progress` accedido más recientemente (si hay varios).
 * 2. Si no hay ninguno: el primer `not_started` que aparece DESPUÉS del
 *    último tópico `completed` en el orden curricular real del curso; si
 *    no hay ninguno después (el alumno completó algo más adelante y dejó
 *    tópicos sin tocar más atrás), se toma el primer `not_started` de
 *    todo el curso.
 * 3. Si no queda ningún `not_started`/`in_progress`: `null` — "Curso
 *    completado".
 */
function computeContinueTarget(
  flatTopics: Array<{ moduleId: string; topicId: string; title: string }>,
  progress: CourseLearningProgress | null
): ContinueTarget | null {
  if (flatTopics.length === 0) return null;

  let mostRecentInProgress: { entry: (typeof flatTopics)[number]; lastAccessedAt: string } | null =
    null;
  let lastCompletedIndex = -1;

  flatTopics.forEach((entry, index) => {
    const status = statusOf(progress, entry.moduleId, entry.topicId);
    if (status === "completed") {
      lastCompletedIndex = index;
    } else if (status === "in_progress") {
      const lastAccessedAt =
        progress?.topics[`${entry.moduleId}:${entry.topicId}`]?.lastAccessedAt ?? "";
      if (!mostRecentInProgress || lastAccessedAt > mostRecentInProgress.lastAccessedAt) {
        mostRecentInProgress = { entry, lastAccessedAt };
      }
    }
  });

  if (mostRecentInProgress) {
    const target = mostRecentInProgress as { entry: (typeof flatTopics)[number]; lastAccessedAt: string };
    return { ...target.entry, reason: "in_progress" };
  }

  const afterLastCompleted = flatTopics
    .slice(lastCompletedIndex + 1)
    .find((entry) => statusOf(progress, entry.moduleId, entry.topicId) === "not_started");
  if (afterLastCompleted) return { ...afterLastCompleted, reason: "not_started" };

  const anyNotStarted = flatTopics.find(
    (entry) => statusOf(progress, entry.moduleId, entry.topicId) === "not_started"
  );
  if (anyNotStarted) return { ...anyNotStarted, reason: "not_started" };

  return null; // todo completed (o mezcla completed/in_progress sin not_started, cubierto arriba)
}

export function buildCourseLearningSummary(
  course: CourseDetail,
  progress: CourseLearningProgress | null
): CourseLearningSummary {
  const flatTopics: Array<{ moduleId: string; topicId: string; title: string }> = [];
  const modules: ModuleSummaryView[] = course.modules.map((module) => {
    const topics: TopicSummaryView[] = module.topics.map((topic) => {
      flatTopics.push({ moduleId: module.id, topicId: topic.id, title: topic.title });
      return {
        moduleId: module.id,
        topicId: topic.id,
        title: topic.title,
        status: statusOf(progress, module.id, topic.id),
      };
    });
    const completedTopics = topics.filter((t) => t.status === "completed").length;
    const inProgressTopics = topics.filter((t) => t.status === "in_progress").length;
    return {
      moduleId: module.id,
      title: module.title,
      totalTopics: topics.length,
      completedTopics,
      inProgressTopics,
      progressPercentage: topics.length > 0 ? round((completedTopics / topics.length) * 100) : 0,
      topics,
    };
  });

  const totalTopics = flatTopics.length;
  const completedTopics = modules.reduce((sum, m) => sum + m.completedTopics, 0);
  const inProgressTopics = modules.reduce((sum, m) => sum + m.inProgressTopics, 0);

  let lastActivity: string | null = null;
  if (progress) {
    for (const topicProgress of Object.values(progress.topics)) {
      if (!lastActivity || topicProgress.lastAccessedAt > lastActivity) {
        lastActivity = topicProgress.lastAccessedAt;
      }
    }
  }

  const isCompleted = totalTopics > 0 && completedTopics === totalTopics;

  return {
    courseId: course.id,
    totalModules: course.modules.length,
    totalTopics,
    completedTopics,
    inProgressTopics,
    // PARTE 2: el porcentaje de curso se basa SIEMPRE en
    // completed_topics/total_topics — nunca en la cantidad de escenas de
    // una LessonPlan generada por IA (eso variaría con cada regeneración).
    progressPercentage: totalTopics > 0 ? round((completedTopics / totalTopics) * 100) : 0,
    lastActivity,
    continueTarget: isCompleted ? null : computeContinueTarget(flatTopics, progress),
    modules,
    isCompleted,
  };
}
