// Paridad exacta backend/frontend (v1.7.0, Bloque 4, PARTE D de la
// especificación). Consume el fixture COMPARTIDO
// `fixtures/learning_state_parity.json` (mismo archivo que
// `backend/tests/test_learning_state_parity.py`, montado read-only en
// ambos containers -- ver docker-compose.yml) para probar que
// `topicLearningSignal.ts` sigue produciendo EXACTAMENTE lo que el
// fixture espera (el mismo fixture que el backend usa para demostrar que
// SU puerto coincide). Frontend es el oráculo -- este test confirma que
// el fixture describe fielmente el comportamiento real ya aprobado acá,
// nunca al revés.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveTopicLearningState } from "../learningState";
import { getTopicLearningSignal } from "../topicLearningSignal";
import type { CertificationAttemptSummary, CourseLearningProgress } from "../types";
import type { TopicBreakdown } from "../../types/api";

const FIXTURE_PATH = "/app/fixtures/learning_state_parity.json";

interface FixtureAttempt {
  completed_at: string;
  performance_by_topic: TopicBreakdown[];
}

interface FixtureCase {
  name: string;
  module_id: string;
  topic_id: string;
  curricular_status: "not_started" | "in_progress" | "completed";
  attempts: FixtureAttempt[];
  expected: {
    status: string;
    reason_code: string;
    observations: number;
    latest_score: number | null;
    recent_average: number | null;
  };
}

function loadCases(): FixtureCase[] {
  if (!existsSync(FIXTURE_PATH)) return [];
  const data = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as { cases: FixtureCase[] };
  return data.cases;
}

function toAttemptSummary(entry: FixtureAttempt, index: number): CertificationAttemptSummary {
  const moduleIds = Array.from(new Set(entry.performance_by_topic.map((t) => t.module_id)));
  const topicIds = Array.from(new Set(entry.performance_by_topic.map((t) => t.topic_id)));
  return {
    attemptId: `fixture-${index}`,
    courseId: "curso-demo",
    mode: "practice",
    moduleIds,
    topicIds,
    questionCount: entry.performance_by_topic.reduce((sum, t) => sum + t.attempted, 0),
    answeredCount: entry.performance_by_topic.reduce((sum, t) => sum + t.attempted, 0),
    correctCount: entry.performance_by_topic.reduce((sum, t) => sum + t.correct, 0),
    partialCount: entry.performance_by_topic.reduce((sum, t) => sum + t.partially_correct, 0),
    incorrectCount: entry.performance_by_topic.reduce((sum, t) => sum + t.incorrect, 0),
    unansweredCount: entry.performance_by_topic.reduce((sum, t) => sum + t.unanswered, 0),
    scorePercentage: entry.performance_by_topic[0].practice_score_percent,
    completedAt: entry.completed_at,
    performanceByTopic: entry.performance_by_topic,
    competenciesToReinforce: [],
  };
}

const cases = loadCases();

describe.skipIf(cases.length === 0)("learningState parity fixture (Bloque 4)", () => {
  it("el fixture tiene la cantidad esperada de casos", () => {
    expect(cases).toHaveLength(13);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const attempts = testCase.attempts.map(toAttemptSummary);
    const progress: CourseLearningProgress = {
      courseId: "curso-demo",
      topics: {
        [`${testCase.module_id}:${testCase.topic_id}`]: {
          moduleId: testCase.module_id,
          topicId: testCase.topic_id,
          status: testCase.curricular_status,
          startedAt: null,
          lastAccessedAt: "2026-01-01T00:00:00.000Z",
          completedAt: null,
          currentScene: null,
          totalScenes: null,
          contentSha256: null,
        },
      },
      certificationAttempts: attempts,
      serverProgressImportedAt: null,
      certificationHistoryImportedAt: null,
    };

    const signal = getTopicLearningSignal(testCase.module_id, testCase.topic_id, progress, attempts);
    const { status, reasonCode } = deriveTopicLearningState(signal);

    expect(status).toBe(testCase.expected.status);
    expect(reasonCode).toBe(testCase.expected.reason_code);
    expect(signal.observations).toBe(testCase.expected.observations);
    expect(signal.latestScore).toBe(testCase.expected.latest_score);
    expect(signal.recentAverage).toBe(testCase.expected.recent_average);
  });
});
