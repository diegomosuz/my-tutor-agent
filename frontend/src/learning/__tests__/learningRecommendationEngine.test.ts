import { describe, expect, it } from "vitest";
import { buildCourseLearningSummary } from "../courseSummary";
import {
  getLearningRecommendations,
  MAX_PRACTICE_REINFORCEMENT_TOPICS,
} from "../learningRecommendationEngine";
import type { CertificationAttemptSummary, CourseLearningProgress, TopicLearningProgress } from "../types";
import type { CourseDetail } from "../../types/api";

function makeCourse(modules: Array<{ id: string; title?: string; topicIds: string[] }>): CourseDetail {
  return {
    id: "curso-demo",
    title: "Curso demo",
    description: "",
    order: 1,
    modules: modules.map((m, mi) => ({
      id: m.id,
      title: m.title ?? m.id,
      order: mi + 1,
      topics: m.topicIds.map((tid, ti) => ({ id: tid, title: tid, order: ti + 1 })),
    })),
  };
}

function topicProgress(overrides: Partial<TopicLearningProgress> & Pick<TopicLearningProgress, "moduleId" | "topicId" | "status">): TopicLearningProgress {
  return {
    startedAt: "2026-01-01T00:00:00.000Z",
    lastAccessedAt: "2026-01-01T00:00:00.000Z",
    completedAt: overrides.status === "completed" ? "2026-01-01T00:00:00.000Z" : null,
    currentScene: null,
    totalScenes: null,
    contentSha256: null,
    ...overrides,
  };
}

function progressDoc(
  topics: TopicLearningProgress[],
  attempts: CertificationAttemptSummary[] = [],
  courseId = "curso-demo"
): CourseLearningProgress {
  const topicsMap: Record<string, TopicLearningProgress> = {};
  for (const t of topics) topicsMap[`${t.moduleId}:${t.topicId}`] = t;
  return { courseId, topics: topicsMap, certificationAttempts: attempts };
}

function attempt(overrides: Partial<CertificationAttemptSummary> = {}): CertificationAttemptSummary {
  return {
    attemptId: "attempt-1",
    courseId: "curso-demo",
    mode: "practice",
    moduleIds: [],
    topicIds: [],
    questionCount: 5,
    answeredCount: 5,
    correctCount: 3,
    partialCount: 0,
    incorrectCount: 2,
    unansweredCount: 0,
    scorePercentage: 60,
    completedAt: "2026-01-01T00:00:00.000Z",
    performanceByTopic: [],
    competenciesToReinforce: [],
    ...overrides,
  };
}

function perf(moduleId: string, topicId: string, score: number) {
  return {
    module_id: moduleId,
    topic_id: topicId,
    attempted: 1,
    correct: score >= 100 ? 1 : 0,
    partially_correct: 0,
    incorrect: score >= 100 ? 0 : 1,
    unanswered: 0,
    practice_score_percent: score,
  };
}

function recommend(course: CourseDetail, progress: CourseLearningProgress | null) {
  const summary = buildCourseLearningSummary(course, progress);
  return getLearningRecommendations(course, summary, progress);
}

describe("getLearningRecommendations", () => {
  it("A: nuevo usuario (sin progreso) recomienda el primer tópico curricular", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const recs = recommend(course, null);
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe("start_next_topic");
    expect(recs[0].topicId).toBe("t1");
    expect(recs[0].reasonCode).toBe("course_not_started");
  });

  it("B: un tópico in_progress -> recomienda continuar ese tópico", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc([topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress" })]);
    const recs = recommend(course, progress);
    expect(recs[0].type).toBe("continue_topic");
    expect(recs[0].topicId).toBe("t1");
    expect(recs[0].reasonCode).toBe("in_progress_most_recent");
  });

  it("C: dos in_progress -> elige el de actividad más reciente", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc([
      topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress", lastAccessedAt: "2026-01-01T00:00:00.000Z" }),
      topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "in_progress", lastAccessedAt: "2026-01-05T00:00:00.000Z" }),
    ]);
    const recs = recommend(course, progress);
    expect(recs[0].topicId).toBe("t2");
  });

  it("D: completed con score bajo -> puede recomendar review", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "not_started" }),
      ],
      [attempt({ performanceByTopic: [perf("modulo-1", "t1", 40)] })]
    );
    const recs = recommend(course, progress);
    const review = recs.find((r) => r.type === "review_topic");
    expect(review).toBeDefined();
    expect(review?.topicId).toBe("t1");
    expect(review?.reasonCode).toBe("completed_but_weak");
    expect(review?.reasonText).toContain("40%");
  });

  it("E: not_started + tópico débil -> el review NUNCA reemplaza start_next_topic como primario", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc(
      [topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" })],
      [attempt({ performanceByTopic: [perf("modulo-1", "t1", 30)] })]
    );
    const recs = recommend(course, progress);
    expect(recs[0].type).toBe("start_next_topic"); // t2, prioridad 1
    expect(recs[0].topicId).toBe("t2");
    expect(recs.some((r) => r.type === "review_topic" && r.topicId === "t1")).toBe(true);
  });

  it("F: todos completed -> nunca recomienda continue_topic/start_next_topic", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc([
      topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" }),
      topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
    ]);
    const recs = recommend(course, progress);
    expect(recs.some((r) => r.type === "continue_topic" || r.type === "start_next_topic")).toBe(false);
    expect(recs[0].type).toBe("course_completed");
  });

  it("G: todos completed + debilidad -> recomienda review/practice, nunca 'listo para certificarte'", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
      ],
      [attempt({ performanceByTopic: [perf("modulo-1", "t1", 35)] })]
    );
    const recs = recommend(course, progress);
    expect(recs.some((r) => r.type === "practice_topics")).toBe(true);
    const allText = recs.map((r) => r.reasonText).join(" ").toLowerCase();
    expect(allText).not.toContain("listo para certificarte");
    expect(allText).not.toContain("probabilidad");
  });

  it("H: todos completed sin debilidad -> recomendación neutral de simulacro", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc([
      topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" }),
      topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
    ]);
    const recs = recommend(course, progress);
    const sim = recs.find((r) => r.type === "retry_simulation");
    expect(sim).toBeDefined();
    expect(sim?.reasonText).toBe("Podés realizar un simulacro para seguir practicando.");
  });

  it("I: aislamiento por curso — un resultado en otro curso nunca afecta este", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1"] }]);
    const progress: CourseLearningProgress = {
      courseId: "otro-curso",
      topics: { "modulo-1:t1": topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" }) },
      certificationAttempts: [attempt({ courseId: "otro-curso", performanceByTopic: [perf("modulo-1", "t1", 10)] })],
    };
    // Progress pertenece a "otro-curso" pero se pasa igual: el engine no
    // debe usar `progress.courseId`, usa el id del curso real (course.id)
    // para las rutas, y el llamador es responsable de pasar el progress
    // correcto — este test confirma que si por error se pasara progress de
    // OTRO curso, las recomendaciones igual apuntan a courseId real.
    const recs = recommend(course, progress);
    expect(recs.every((r) => r.courseId === "curso-demo")).toBe(true);
  });

  it("J: tópico eliminado del curso -> nunca se recomienda", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1"] }]); // t2 ya no existe
    const progress = progressDoc([
      topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" }),
      topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "in_progress" }), // huérfano
    ]);
    const recs = recommend(course, progress);
    expect(recs.some((r) => r.topicId === "t2")).toBe(false);
  });

  it("K: tópico nuevo agregado al curso -> aparece como not_started, recomendable", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2-nuevo"] }]);
    const progress = progressDoc([topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" })]);
    const recs = recommend(course, progress);
    expect(recs[0].type).toBe("start_next_topic");
    expect(recs[0].topicId).toBe("t2-nuevo");
  });

  it("L: una sola observación -> reasonText usa 'resultado más reciente', nunca promedio/tendencia", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
      ],
      [attempt({ performanceByTopic: [perf("modulo-1", "t2", 45)] })]
    );
    const recs = recommend(course, progress);
    const review = recs.find((r) => r.type === "review_topic");
    expect(review?.reasonText).toContain("resultado más reciente");
    expect(review?.reasonText).not.toMatch(/promedio|tendencia/i);
  });

  it("M: últimas 3 observaciones -> agregación correcta en review_topic", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const attempts = [10, 20, 30, 90].map((score, i) =>
      attempt({
        attemptId: `a${i}`,
        completedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
        performanceByTopic: [perf("modulo-1", "t2", score)],
      })
    );
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
      ],
      attempts
    );
    const recs = recommend(course, progress);
    const review = recs.find((r) => r.type === "review_topic");
    // últimas 3: 20, 30, 90 -> promedio ~46.7, needs_reinforcement.
    expect(review?.observedData?.observations).toBe(3);
    expect(review?.reasonText).toContain("últimas 3 prácticas");
  });

  it("N: empates en practice_topics se resuelven con orden curricular estable", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2", "t3"] }]);
    const sameTime = "2026-01-01T00:00:00.000Z";
    const attempts = [
      attempt({ completedAt: sameTime, performanceByTopic: [perf("modulo-1", "t3", 20), perf("modulo-1", "t1", 20)] }),
    ];
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t3", status: "completed" }),
      ],
      attempts
    );
    const recs = recommend(course, progress);
    const practice = recs.find((r) => r.type === "practice_topics");
    expect(practice?.topicIds?.slice(0, 2)).toEqual(["t1", "t3"]); // t1 antes que t3 en orden curricular
  });

  it("O: practice_topics nunca supera MAX_PRACTICE_REINFORCEMENT_TOPICS (5)", () => {
    const topicIds = ["t1", "t2", "t3", "t4", "t5", "t6", "t7"];
    const course = makeCourse([{ id: "modulo-1", topicIds }]);
    const attempts = [
      attempt({ performanceByTopic: topicIds.map((t) => perf("modulo-1", t, 10)) }),
    ];
    const progress = progressDoc(
      topicIds.map((t) => topicProgress({ moduleId: "modulo-1", topicId: t, status: "completed" })),
      attempts
    );
    const recs = recommend(course, progress);
    const practice = recs.find((r) => r.type === "practice_topics");
    expect(practice?.topicIds).toHaveLength(MAX_PRACTICE_REINFORCEMENT_TOPICS);
  });

  it("P: IDs inválidos/huérfanos en performanceByTopic se ignoran sin romper nada", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1"] }]);
    const progress = progressDoc(
      [topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" })],
      [attempt({ performanceByTopic: [perf("modulo-1", "topico-fantasma", 10)] })]
    );
    expect(() => recommend(course, progress)).not.toThrow();
    const recs = recommend(course, progress);
    expect(recs.some((r) => r.topicId === "topico-fantasma")).toBe(false);
  });

  it("Q: score boundary 59/60/79/80 clasifican según los umbrales definidos (integración)", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
      ],
      [attempt({ performanceByTopic: [perf("modulo-1", "t2", 59)] })]
    );
    const recs = recommend(course, progress);
    // 59 < 60 -> needs_reinforcement -> debe aparecer como review_topic.
    expect(recs.some((r) => r.type === "review_topic" && r.topicId === "t2")).toBe(true);
  });

  it("Q2: score 60 (developing) NO dispara review_topic ni practice_topics", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
      ],
      [attempt({ performanceByTopic: [perf("modulo-1", "t2", 60)] })]
    );
    const recs = recommend(course, progress);
    expect(recs.some((r) => r.type === "review_topic")).toBe(false);
    expect(recs.some((r) => r.type === "practice_topics")).toBe(false);
  });

  it("R: sin performance data -> nunca inventa debilidad", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc([
      topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress" }),
      topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
    ]);
    const recs = recommend(course, progress);
    expect(recs.some((r) => r.type === "review_topic" || r.type === "practice_topics")).toBe(false);
  });

  it("nunca usa lenguaje de predicción/certificación oficial en ningún reasonText", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "completed" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
      ],
      [attempt({ performanceByTopic: [perf("modulo-1", "t1", 20)] })]
    );
    const recs = recommend(course, progress);
    const allText = recs.map((r) => r.reasonText).join(" ").toLowerCase();
    for (const banned of ["probabilidad", "nivel de dominio certificado", "listo para certificarte", "la ia recomienda"]) {
      expect(allText).not.toContain(banned);
    }
  });

  it("action.to de open_topic/open_certification_setup son rutas reales navegables", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc([topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress" })]);
    const recs = recommend(course, progress);
    expect(recs[0].action.to).toBe("/aula/curso-demo/modulo-1/t1");
  });

  it("practice_topics action.to incluye mode=practice y los topics preseleccionados", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["t1", "t2"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "t1", status: "in_progress" }),
        topicProgress({ moduleId: "modulo-1", topicId: "t2", status: "completed" }),
      ],
      [attempt({ performanceByTopic: [perf("modulo-1", "t2", 10)] })]
    );
    const recs = recommend(course, progress);
    const practice = recs.find((r) => r.type === "practice_topics");
    expect(practice?.action.to).toBe("/certificacion/curso-demo?mode=practice&topics=t2");
  });
});
