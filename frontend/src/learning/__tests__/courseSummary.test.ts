import { describe, expect, it } from "vitest";
import { buildCourseLearningSummary } from "../courseSummary";
import type { CourseLearningProgress, TopicStatus } from "../types";
import type { CourseDetail } from "../../types/api";

function makeCourse(): CourseDetail {
  return {
    id: "curso-demo",
    title: "Curso Demo",
    description: "",
    order: 1,
    modules: [
      {
        id: "modulo-1",
        title: "Módulo 1",
        order: 1,
        topics: [
          { id: "topico-1", title: "Tópico 1", order: 1 },
          { id: "topico-2", title: "Tópico 2", order: 2 },
        ],
      },
      {
        id: "modulo-2",
        title: "Módulo 2",
        order: 2,
        topics: [{ id: "topico-3", title: "Tópico 3", order: 1 }],
      },
    ],
  };
}

function makeTopicProgress(
  moduleId: string,
  topicId: string,
  status: TopicStatus,
  lastAccessedAt = "2025-01-01T00:00:00.000Z"
) {
  return {
    moduleId,
    topicId,
    status,
    startedAt: status === "not_started" ? null : lastAccessedAt,
    lastAccessedAt,
    completedAt: status === "completed" ? lastAccessedAt : null,
    currentScene: null,
    totalScenes: null,
    contentSha256: null,
  };
}

function makeProgress(
  topics: Record<string, ReturnType<typeof makeTopicProgress>>
): CourseLearningProgress {
  return { courseId: "curso-demo", topics, certificationAttempts: [] };
}

describe("buildCourseLearningSummary", () => {
  // A (variante course-level). curso nunca iniciado: 0 progreso.
  it("A: curso sin progreso -> 0%, sin continueTarget nulo, lastActivity null", () => {
    const summary = buildCourseLearningSummary(makeCourse(), null);
    expect(summary.progressPercentage).toBe(0);
    expect(summary.completedTopics).toBe(0);
    expect(summary.lastActivity).toBeNull();
    expect(summary.continueTarget).toEqual({
      moduleId: "modulo-1",
      topicId: "topico-1",
      title: "Tópico 1",
      reason: "not_started",
    });
  });

  // E. curso: progress = completed_topics / total_topics.
  it("E: el progreso de curso es completed/total, nunca depende de escenas", () => {
    const progress = makeProgress({
      "modulo-1:topico-1": makeTopicProgress("modulo-1", "topico-1", "completed"),
    });
    const summary = buildCourseLearningSummary(makeCourse(), progress);
    // 1 de 3 tópicos completados = 33% (redondeado).
    expect(summary.completedTopics).toBe(1);
    expect(summary.totalTopics).toBe(3);
    expect(summary.progressPercentage).toBe(33);
  });

  // F. módulo: progreso correcto.
  it("F: cada módulo calcula su propio progreso de forma independiente", () => {
    const progress = makeProgress({
      "modulo-1:topico-1": makeTopicProgress("modulo-1", "topico-1", "completed"),
      "modulo-1:topico-2": makeTopicProgress("modulo-1", "topico-2", "completed"),
    });
    const summary = buildCourseLearningSummary(makeCourse(), progress);
    const modulo1 = summary.modules.find((m) => m.moduleId === "modulo-1")!;
    const modulo2 = summary.modules.find((m) => m.moduleId === "modulo-2")!;
    expect(modulo1.completedTopics).toBe(2);
    expect(modulo1.progressPercentage).toBe(100);
    expect(modulo2.completedTopics).toBe(0);
    expect(modulo2.progressPercentage).toBe(0);
  });

  // H. continue learning: elige el último in_progress.
  it("H: con un tópico in_progress, Continuar Aprendiendo lo elige a ese", () => {
    const progress = makeProgress({
      "modulo-1:topico-1": makeTopicProgress("modulo-1", "topico-1", "completed"),
      "modulo-1:topico-2": makeTopicProgress("modulo-1", "topico-2", "in_progress"),
    });
    const summary = buildCourseLearningSummary(makeCourse(), progress);
    expect(summary.continueTarget).toEqual({
      moduleId: "modulo-1",
      topicId: "topico-2",
      title: "Tópico 2",
      reason: "in_progress",
    });
  });

  it("H: con varios in_progress, elige el accedido más recientemente", () => {
    const progress = makeProgress({
      "modulo-1:topico-1": makeTopicProgress(
        "modulo-1",
        "topico-1",
        "in_progress",
        "2025-01-01T00:00:00.000Z"
      ),
      "modulo-2:topico-3": makeTopicProgress(
        "modulo-2",
        "topico-3",
        "in_progress",
        "2025-06-01T00:00:00.000Z"
      ),
    });
    const summary = buildCourseLearningSummary(makeCourse(), progress);
    expect(summary.continueTarget?.topicId).toBe("topico-3");
  });

  // I. sin in_progress: elige el próximo not_started después del último completed.
  it("I: sin in_progress, elige el primer not_started después del último completed", () => {
    const progress = makeProgress({
      "modulo-1:topico-1": makeTopicProgress("modulo-1", "topico-1", "completed"),
    });
    const summary = buildCourseLearningSummary(makeCourse(), progress);
    expect(summary.continueTarget).toEqual({
      moduleId: "modulo-1",
      topicId: "topico-2",
      title: "Tópico 2",
      reason: "not_started",
    });
  });

  it("I: si no hay not_started después del último completed, cae al primer not_started del curso", () => {
    // El alumno completó el ÚLTIMO tópico del curso salteando los del medio.
    const progress = makeProgress({
      "modulo-2:topico-3": makeTopicProgress("modulo-2", "topico-3", "completed"),
    });
    const summary = buildCourseLearningSummary(makeCourse(), progress);
    expect(summary.continueTarget).toEqual({
      moduleId: "modulo-1",
      topicId: "topico-1",
      title: "Tópico 1",
      reason: "not_started",
    });
  });

  // J. curso completo: muestra completado.
  it("J: con todos los tópicos completed, continueTarget es null (curso completado)", () => {
    const progress = makeProgress({
      "modulo-1:topico-1": makeTopicProgress("modulo-1", "topico-1", "completed"),
      "modulo-1:topico-2": makeTopicProgress("modulo-1", "topico-2", "completed"),
      "modulo-2:topico-3": makeTopicProgress("modulo-2", "topico-3", "completed"),
    });
    const summary = buildCourseLearningSummary(makeCourse(), progress);
    expect(summary.isCompleted).toBe(true);
    expect(summary.continueTarget).toBeNull();
    expect(summary.progressPercentage).toBe(100);
  });

  it("nunca produce NaN/undefined en un curso sin tópicos", () => {
    const emptyCourse: CourseDetail = {
      id: "curso-vacio",
      title: "Curso Vacío",
      description: "",
      order: 1,
      modules: [],
    };
    const summary = buildCourseLearningSummary(emptyCourse, null);
    expect(summary.progressPercentage).toBe(0);
    expect(summary.totalTopics).toBe(0);
    expect(summary.continueTarget).toBeNull();
    expect(Number.isNaN(summary.progressPercentage)).toBe(false);
  });
});
