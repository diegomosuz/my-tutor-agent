import { describe, expect, it } from "vitest";
import { classifyScore, getTopicLearningSignal, RECENT_OBSERVATIONS_WINDOW } from "../topicLearningSignal";
import type { CertificationAttemptSummary, CourseLearningProgress } from "../types";

function attempt(overrides: Partial<CertificationAttemptSummary> = {}): CertificationAttemptSummary {
  return {
    attemptId: "attempt-1",
    courseId: "curso-demo",
    mode: "practice",
    moduleIds: ["modulo-1"],
    topicIds: ["topico-a"],
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

function progressWith(status: "not_started" | "in_progress" | "completed"): CourseLearningProgress {
  return {
    courseId: "curso-demo",
    topics: {
      "modulo-1:topico-a": {
        moduleId: "modulo-1",
        topicId: "topico-a",
        status,
        startedAt: "2026-01-01T00:00:00.000Z",
        lastAccessedAt: "2026-01-01T00:00:00.000Z",
        completedAt: status === "completed" ? "2026-01-01T00:00:00.000Z" : null,
        currentScene: null,
        totalScenes: null,
        contentSha256: null,
      },
    },
    certificationAttempts: [],
  };
}

describe("classifyScore — umbrales PARTE 4", () => {
  it("Q: 59 -> needs_reinforcement, 60 -> developing, 79 -> developing, 80 -> observed_strength", () => {
    expect(classifyScore(59)).toBe("needs_reinforcement");
    expect(classifyScore(60)).toBe("developing");
    expect(classifyScore(79)).toBe("developing");
    expect(classifyScore(80)).toBe("observed_strength");
  });
});

describe("getTopicLearningSignal", () => {
  it("sin observaciones: observations=0, sin score, sin reinforcementLevel (R)", () => {
    const signal = getTopicLearningSignal("modulo-1", "topico-a", progressWith("in_progress"), []);
    expect(signal.observations).toBe(0);
    expect(signal.latestScore).toBeNull();
    expect(signal.recentAverage).toBeNull();
    expect(signal.reinforcementLevel).toBeNull();
    expect(signal.status).toBe("in_progress");
  });

  it("una sola observación: recentAverage === latestScore (L)", () => {
    const attempts = [
      attempt({
        completedAt: "2026-01-05T00:00:00.000Z",
        performanceByTopic: [
          { module_id: "modulo-1", topic_id: "topico-a", attempted: 3, correct: 1, partially_correct: 0, incorrect: 2, unanswered: 0, practice_score_percent: 33 },
        ],
      }),
    ];
    const signal = getTopicLearningSignal("modulo-1", "topico-a", progressWith("in_progress"), attempts);
    expect(signal.observations).toBe(1);
    expect(signal.latestScore).toBe(33);
    expect(signal.recentAverage).toBe(33);
    expect(signal.reinforcementLevel).toBe("needs_reinforcement");
  });

  it("usa solo las últimas RECENT_OBSERVATIONS_WINDOW observaciones, más recientes primero (M)", () => {
    const attempts = [1, 2, 3, 4].map((i) =>
      attempt({
        attemptId: `attempt-${i}`,
        completedAt: `2026-01-0${i}T00:00:00.000Z`,
        performanceByTopic: [
          { module_id: "modulo-1", topic_id: "topico-a", attempted: 1, correct: i >= 3 ? 1 : 0, partially_correct: 0, incorrect: i >= 3 ? 0 : 1, unanswered: 0, practice_score_percent: i * 20 },
        ],
      })
    );
    const signal = getTopicLearningSignal("modulo-1", "topico-a", progressWith("completed"), attempts);
    expect(RECENT_OBSERVATIONS_WINDOW).toBe(3);
    expect(signal.observations).toBe(3);
    // últimas 3: día 2 (40), 3 (60), 4 (80) -- más reciente (día 4) es latestScore.
    expect(signal.latestScore).toBe(80);
    expect(signal.recentAverage).toBeCloseTo((40 + 60 + 80) / 3, 5);
  });

  it("ignora un performanceByTopic con attempted=0 (sin observación real)", () => {
    const attempts = [
      attempt({
        performanceByTopic: [
          { module_id: "modulo-1", topic_id: "topico-a", attempted: 0, correct: 0, partially_correct: 0, incorrect: 0, unanswered: 0, practice_score_percent: 0 },
        ],
      }),
    ];
    const signal = getTopicLearningSignal("modulo-1", "topico-a", progressWith("in_progress"), attempts);
    expect(signal.observations).toBe(0);
  });

  it("nunca mezcla un tópico con el mismo topicId pero distinto moduleId (aislamiento duplicate_slug)", () => {
    const attempts = [
      attempt({
        performanceByTopic: [
          { module_id: "modulo-2", topic_id: "topico-a", attempted: 1, correct: 0, partially_correct: 0, incorrect: 1, unanswered: 0, practice_score_percent: 10 },
        ],
      }),
    ];
    const signal = getTopicLearningSignal("modulo-1", "topico-a", progressWith("in_progress"), attempts);
    expect(signal.observations).toBe(0); // el observado fue modulo-2, no modulo-1
  });
});
