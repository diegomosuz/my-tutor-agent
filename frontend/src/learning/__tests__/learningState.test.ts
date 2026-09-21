import { describe, expect, it } from "vitest";
import { buildCourseLearningSummary } from "../courseSummary";
import {
  deriveCourseLearningStates,
  deriveTopicLearningState,
  getReviewCandidates,
  summarizeLearningStates,
  type LearningState,
} from "../learningState";
import type { TopicLearningSignal } from "../topicLearningSignal";
import type { CertificationAttemptSummary, CourseLearningProgress, TopicLearningProgress } from "../types";
import type { CourseDetail } from "../../types/api";

function makeCourse(modules: Array<{ id: string; topicIds: string[] }>): CourseDetail {
  return {
    id: "curso-demo",
    title: "Curso demo",
    description: "",
    order: 1,
    modules: modules.map((m, mi) => ({
      id: m.id,
      title: m.id,
      order: mi + 1,
      topics: m.topicIds.map((tid, ti) => ({ id: tid, title: tid, order: ti + 1 })),
    })),
  };
}

function topicProgress(
  overrides: Partial<TopicLearningProgress> & Pick<TopicLearningProgress, "moduleId" | "topicId" | "status">
): TopicLearningProgress {
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

function attempt(overrides: Partial<CertificationAttemptSummary> = {}): CertificationAttemptSummary {
  return {
    attemptId: "attempt-1",
    courseId: "curso-demo",
    mode: "practice",
    moduleIds: ["modulo-1"],
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

function scoreAttempt(
  moduleId: string,
  topicId: string,
  score: number,
  completedAt: string,
  attemptId: string
): CertificationAttemptSummary {
  return attempt({
    attemptId,
    completedAt,
    scorePercentage: score,
    performanceByTopic: [
      {
        module_id: moduleId,
        topic_id: topicId,
        attempted: 1,
        correct: score >= 80 ? 1 : 0,
        partially_correct: 0,
        incorrect: score < 80 ? 1 : 0,
        unanswered: 0,
        practice_score_percent: score,
      },
    ],
  });
}

function progressDoc(
  topics: TopicLearningProgress[],
  certificationAttempts: CertificationAttemptSummary[] = []
): CourseLearningProgress {
  const topicsMap: Record<string, TopicLearningProgress> = {};
  for (const t of topics) topicsMap[`${t.moduleId}:${t.topicId}`] = t;
  return { courseId: "curso-demo", topics: topicsMap, certificationAttempts };
}

describe("deriveTopicLearningState — mapeo puro TopicLearningSignal -> LearningState", () => {
  function signal(overrides: Partial<TopicLearningSignal>): TopicLearningSignal {
    return {
      moduleId: "modulo-1",
      topicId: "topico-a",
      status: "not_started",
      observations: 0,
      latestScore: null,
      recentAverage: null,
      reinforcementLevel: null,
      lastObservedAt: null,
      ...overrides,
    };
  }

  it("A (PASO 35): sin actividad -> not_started / NOT_STARTED", () => {
    const result = deriveTopicLearningState(signal({ status: "not_started" }));
    expect(result).toEqual({ status: "not_started", reasonCode: "NOT_STARTED" });
  });

  it("iniciado sin completar, sin evaluación -> progressing / STARTED_NOT_COMPLETED", () => {
    const result = deriveTopicLearningState(signal({ status: "in_progress" }));
    expect(result).toEqual({ status: "progressing", reasonCode: "STARTED_NOT_COMPLETED" });
  });

  it("B (PASO 36): completado sin evaluación -> progressing / COMPLETED_NO_ASSESSMENT (nunca mastered)", () => {
    const result = deriveTopicLearningState(signal({ status: "completed" }));
    expect(result.status).toBe("progressing");
    expect(result.status).not.toBe("mastered");
    expect(result.reasonCode).toBe("COMPLETED_NO_ASSESSMENT");
  });

  it("C (PASO 37): resultado bajo (un solo intento) -> needs_review / LOW_CERTIFICATION_SCORE", () => {
    const result = deriveTopicLearningState(
      signal({ status: "completed", observations: 1, recentAverage: 40, latestScore: 40, reinforcementLevel: "needs_reinforcement" })
    );
    expect(result).toEqual({ status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" });
  });

  it("D (PASO 38): resultado alto -> mastered / HIGH_CERTIFICATION_SCORE", () => {
    const result = deriveTopicLearningState(
      signal({ status: "completed", observations: 1, recentAverage: 90, latestScore: 90, reinforcementLevel: "observed_strength" })
    );
    expect(result).toEqual({ status: "mastered", reasonCode: "HIGH_CERTIFICATION_SCORE" });
  });

  it("resultado medio -> progressing / MEDIUM_CERTIFICATION_SCORE (nunca needs_review ni mastered)", () => {
    const result = deriveTopicLearningState(
      signal({ status: "completed", observations: 1, recentAverage: 70, latestScore: 70, reinforcementLevel: "developing" })
    );
    expect(result).toEqual({ status: "progressing", reasonCode: "MEDIUM_CERTIFICATION_SCORE" });
  });

  it("PASO 39: evidencia en conflicto -- completed + assessment bajo -> needs_review, nunca completed/mastered", () => {
    const result = deriveTopicLearningState(
      signal({ status: "completed", observations: 1, recentAverage: 30, latestScore: 30, reinforcementLevel: "needs_reinforcement" })
    );
    expect(result.status).toBe("needs_review");
  });

  it("PASO 41: repeated failure -- 2+ observaciones bajas -> REPEATED_LOW_CERTIFICATION_SCORE", () => {
    const result = deriveTopicLearningState(
      signal({ status: "completed", observations: 2, recentAverage: 35, latestScore: 30, reinforcementLevel: "needs_reinforcement" })
    );
    expect(result).toEqual({ status: "needs_review", reasonCode: "REPEATED_LOW_CERTIFICATION_SCORE" });
  });

  it("una sola observación baja usa LOW_CERTIFICATION_SCORE, no REPEATED", () => {
    const result = deriveTopicLearningState(
      signal({ status: "completed", observations: 1, recentAverage: 35, latestScore: 35, reinforcementLevel: "needs_reinforcement" })
    );
    expect(result.reasonCode).toBe("LOW_CERTIFICATION_SCORE");
  });
});

describe("deriveCourseLearningStates — fixture de 4 tópicos (PASO 34, adaptado al modelo real)", () => {
  const course = makeCourse([{ id: "modulo-1", topicIds: ["topico-a", "topico-b", "topico-c", "topico-d"] }]);
  const summary = buildCourseLearningSummary(course, null); // se recalcula con progress abajo

  function statesFor(progress: CourseLearningProgress | null): LearningState[] {
    const realSummary = buildCourseLearningSummary(course, progress);
    return deriveCourseLearningStates("curso-demo", realSummary.modules, progress);
  }

  it("A=none, B=completed sin evaluación, C=evaluación baja, D=evaluación alta", () => {
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "topico-b", status: "completed" }),
        topicProgress({ moduleId: "modulo-1", topicId: "topico-c", status: "completed" }),
        topicProgress({ moduleId: "modulo-1", topicId: "topico-d", status: "completed" }),
      ],
      [
        scoreAttempt("modulo-1", "topico-c", 35, "2026-01-02T00:00:00.000Z", "att-c"),
        scoreAttempt("modulo-1", "topico-d", 95, "2026-01-02T00:00:00.000Z", "att-d"),
      ]
    );
    const states = statesFor(progress);
    const byTopic = Object.fromEntries(states.map((s) => [s.topicId, s]));

    expect(byTopic["topico-a"].status).toBe("not_started");
    expect(byTopic["topico-b"].status).toBe("progressing");
    expect(byTopic["topico-c"].status).toBe("needs_review");
    expect(byTopic["topico-d"].status).toBe("mastered");

    // Orden curricular preservado (PARTE 17/27).
    expect(states.map((s) => s.topicId)).toEqual(["topico-a", "topico-b", "topico-c", "topico-d"]);
    void summary;
  });

  it("PASO 40: retry improvement -- fallo anterior + resultado posterior satisfactorio usa el promedio de la ventana reciente (política ya existente), no solo el último intento", () => {
    const progress = progressDoc(
      [topicProgress({ moduleId: "modulo-1", topicId: "topico-c", status: "completed" })],
      [
        scoreAttempt("modulo-1", "topico-c", 40, "2026-01-01T00:00:00.000Z", "att-1"),
        scoreAttempt("modulo-1", "topico-c", 90, "2026-01-03T00:00:00.000Z", "att-2"),
      ]
    );
    const states = statesFor(progress);
    const topicC = states.find((s) => s.topicId === "topico-c")!;
    // (40 + 90) / 2 = 65 -> "developing" -> progressing/MEDIUM, NUNCA
    // mastered solo porque el intento MÁS RECIENTE fue alto -- documentado:
    // reutiliza recentAverage de topicLearningSignal.ts, no "latest only".
    expect(topicC.evidence.recentAverage).toBe(65);
    expect(topicC.status).toBe("progressing");
    expect(topicC.reasonCode).toBe("MEDIUM_CERTIFICATION_SCORE");
  });

  it("PASO 42: course isolation -- mismo topic slug en dos cursos no comparte evidencia", () => {
    const progressA = progressDoc(
      [topicProgress({ moduleId: "modulo-1", topicId: "topico-c", status: "completed" })],
      [scoreAttempt("modulo-1", "topico-c", 20, "2026-01-01T00:00:00.000Z", "att-a")]
    );
    const progressB = progressDoc([topicProgress({ moduleId: "modulo-1", topicId: "topico-c", status: "completed" })]);

    const statesA = deriveCourseLearningStates("curso-A", buildCourseLearningSummary(course, progressA).modules, progressA);
    const statesB = deriveCourseLearningStates("curso-B", buildCourseLearningSummary(course, progressB).modules, progressB);

    expect(statesA.find((s) => s.topicId === "topico-c")!.status).toBe("needs_review");
    expect(statesB.find((s) => s.topicId === "topico-c")!.status).toBe("progressing");
  });

  it("PASO 43: stale topic -- evidencia para un tópico que ya no existe en el curso se ignora, sin crash", () => {
    const progress = progressDoc([
      topicProgress({ moduleId: "modulo-1", topicId: "topico-eliminado", status: "completed" }),
    ]);
    expect(() => statesFor(progress)).not.toThrow();
    const states = statesFor(progress);
    expect(states.map((s) => s.topicId)).not.toContain("topico-eliminado");
    expect(states).toHaveLength(4); // solo los 4 tópicos curriculares reales
  });

  it("PASO 44/45: progress null (legacy/corrupt saneado por el store) -- todo not_started, sin crash", () => {
    expect(() => statesFor(null)).not.toThrow();
    const states = statesFor(null);
    expect(states.every((s) => s.status === "not_started")).toBe(true);
  });

  it("PASO 46: determinismo -- misma evidencia produce el mismo resultado (deepEqual exacto)", () => {
    const progress = progressDoc(
      [topicProgress({ moduleId: "modulo-1", topicId: "topico-c", status: "completed" })],
      [scoreAttempt("modulo-1", "topico-c", 35, "2026-01-01T00:00:00.000Z", "att-1")]
    );
    const first = statesFor(progress);
    const second = statesFor(progress);
    expect(first).toEqual(second);
  });
});

describe("summarizeLearningStates (PASO 25/47)", () => {
  it("los cuatro counts suman totalTopics", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["a", "b", "c", "d", "e"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "b", status: "completed" }),
        topicProgress({ moduleId: "modulo-1", topicId: "c", status: "completed" }),
        topicProgress({ moduleId: "modulo-1", topicId: "d", status: "completed" }),
      ],
      [
        scoreAttempt("modulo-1", "c", 30, "2026-01-01T00:00:00.000Z", "att-c"),
        scoreAttempt("modulo-1", "d", 90, "2026-01-01T00:00:00.000Z", "att-d"),
      ]
    );
    const summary = buildCourseLearningSummary(course, progress);
    const states = deriveCourseLearningStates("curso-demo", summary.modules, progress);
    const result = summarizeLearningStates("curso-demo", states);

    expect(result.totalTopics).toBe(5);
    expect(result.notStarted + result.progressing + result.needsReview + result.mastered).toBe(5);
    expect(result.notStarted).toBe(2); // a, e (nunca se tocaron)
    expect(result.progressing).toBe(1); // b
    expect(result.needsReview).toBe(1); // c
    expect(result.mastered).toBe(1); // d
  });

  it("curso sin tópicos: masteredPercentage=0, nunca división por cero", () => {
    const result = summarizeLearningStates("curso-vacio", []);
    expect(result.masteredPercentage).toBe(0);
    expect(result.totalTopics).toBe(0);
  });
});

describe("getReviewCandidates (PASO 26/27/48)", () => {
  it("solo incluye needs_review y progressing, needs_review primero, orden curricular estable dentro de cada grupo", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["a", "b", "c", "d"] }]);
    const progress = progressDoc(
      [
        topicProgress({ moduleId: "modulo-1", topicId: "b", status: "completed" }), // progressing
        topicProgress({ moduleId: "modulo-1", topicId: "c", status: "completed" }), // needs_review
        topicProgress({ moduleId: "modulo-1", topicId: "d", status: "completed" }), // mastered
      ],
      [
        scoreAttempt("modulo-1", "c", 20, "2026-01-01T00:00:00.000Z", "att-c"),
        scoreAttempt("modulo-1", "d", 95, "2026-01-01T00:00:00.000Z", "att-d"),
      ]
    );
    const summary = buildCourseLearningSummary(course, progress);
    const states = deriveCourseLearningStates("curso-demo", summary.modules, progress);
    const candidates = getReviewCandidates(states);

    expect(candidates.map((c) => c.topicId)).toEqual(["c", "b"]); // needs_review (c) antes que progressing (b)
    expect(candidates.every((c) => c.status !== "not_started" && c.status !== "mastered")).toBe(true);
  });

  it("sin candidatos: array vacío, nunca undefined/throw", () => {
    const course = makeCourse([{ id: "modulo-1", topicIds: ["a"] }]);
    const summary = buildCourseLearningSummary(course, null);
    const states = deriveCourseLearningStates("curso-demo", summary.modules, null);
    expect(getReviewCandidates(states)).toEqual([]);
  });
});
