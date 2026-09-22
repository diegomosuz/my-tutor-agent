import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearningState } from "../learningState";
import type { TopicLearningSignal } from "../topicLearningSignal";
import {
  clearGuidedReviewVerificationContext,
  deriveVerificationResults,
  hasNewVerificationAttempt,
  loadGuidedReviewVerificationContext,
  startGuidedReviewVerification,
  type GuidedReviewVerificationContext,
} from "../guidedReviewVerification";

const STORAGE_KEY = "pwc-tutor:guided-review-verification:v1";

function signal(overrides: Partial<TopicLearningSignal> = {}): TopicLearningSignal {
  return {
    moduleId: "m1",
    topicId: "a",
    status: "completed",
    observations: 0,
    latestScore: null,
    recentAverage: null,
    reinforcementLevel: null,
    lastObservedAt: null,
    ...overrides,
  };
}

function state(overrides: Partial<LearningState> & Pick<LearningState, "moduleId" | "topicId">): LearningState {
  return {
    courseId: "curso-demo",
    status: "needs_review",
    reasonCode: "LOW_CERTIFICATION_SCORE",
    evidence: signal({ moduleId: overrides.moduleId, topicId: overrides.topicId }),
    ...overrides,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("guidedReviewVerification — store (PASO 76)", () => {
  it("save/load: startGuidedReviewVerification + loadGuidedReviewVerificationContext devuelven el mismo contexto", () => {
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "m1", topicId: "a" }],
      "att-0",
      [{ moduleId: "m1", topicId: "a", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    const loaded = loadGuidedReviewVerificationContext("curso-demo");
    expect(loaded?.courseId).toBe("curso-demo");
    expect(loaded?.topics).toEqual([{ moduleId: "m1", topicId: "a" }]);
    expect(loaded?.latestAttemptIdAtStart).toBe("att-0");
  });

  it("latestAttemptIdAtStart puede ser null (curso sin ningún intento previo)", () => {
    startGuidedReviewVerification("curso-demo", [{ moduleId: "m1", topicId: "a" }], null, []);
    expect(loadGuidedReviewVerificationContext("curso-demo")?.latestAttemptIdAtStart).toBeNull();
  });

  it("clear: clearGuidedReviewVerificationContext borra el contexto por completo", () => {
    startGuidedReviewVerification("curso-demo", [{ moduleId: "m1", topicId: "a" }], null, []);
    clearGuidedReviewVerificationContext();
    expect(loadGuidedReviewVerificationContext("curso-demo")).toBeNull();
  });

  it("wrong course: un contexto de Course A nunca se devuelve para Course B", () => {
    startGuidedReviewVerification("curso-a", [{ moduleId: "m1", topicId: "a" }], null, []);
    expect(loadGuidedReviewVerificationContext("curso-b")).toBeNull();
  });

  it("corrupt JSON: safe fallback, nunca lanza", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(loadGuidedReviewVerificationContext("curso-demo")).toBeNull();
  });

  it("wrong schema: documento con forma vieja/desconocida cae a null", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 999, courseId: "curso-demo" }));
    expect(loadGuidedReviewVerificationContext("curso-demo")).toBeNull();
  });

  it("topics vacío es inválido: nunca un contexto sin ningún tópico", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, courseId: "curso-demo", topics: [], latestAttemptIdAtStart: null, preVerificationStates: [] })
    );
    expect(loadGuidedReviewVerificationContext("curso-demo")).toBeNull();
  });
});

describe("hasNewVerificationAttempt (PASO 36/38/79)", () => {
  const base: GuidedReviewVerificationContext = {
    schemaVersion: 1,
    courseId: "curso-demo",
    topics: [{ moduleId: "m1", topicId: "a" }],
    latestAttemptIdAtStart: "att-0",
    preVerificationStates: [],
  };

  it("sin intento nuevo (mismo id o null): false -- nunca un falso resultado de verificación", () => {
    expect(hasNewVerificationAttempt(base, "att-0")).toBe(false);
    expect(hasNewVerificationAttempt(base, null)).toBe(false);
  });

  it("con intento nuevo (id distinto): true", () => {
    expect(hasNewVerificationAttempt(base, "att-1")).toBe(true);
  });

  it("curso sin ningún intento previo (latestAttemptIdAtStart=null) + intento nuevo real: true", () => {
    const noPriorAttempts: GuidedReviewVerificationContext = { ...base, latestAttemptIdAtStart: null };
    expect(hasNewVerificationAttempt(noPriorAttempts, "att-1")).toBe(true);
  });

  it("curso sin ningún intento previo y sigue sin ninguno: false", () => {
    const noPriorAttempts: GuidedReviewVerificationContext = { ...base, latestAttemptIdAtStart: null };
    expect(hasNewVerificationAttempt(noPriorAttempts, null)).toBe(false);
  });
});

describe("deriveVerificationResults — derivación PURA (PASO 48/77)", () => {
  const context: GuidedReviewVerificationContext = {
    schemaVersion: 1,
    courseId: "curso-demo",
    topics: [
      { moduleId: "m1", topicId: "a" },
      { moduleId: "m1", topicId: "b" },
    ],
    latestAttemptIdAtStart: "att-0",
    preVerificationStates: [
      { moduleId: "m1", topicId: "a", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" },
      { moduleId: "m1", topicId: "b", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" },
    ],
  };

  it("solo devuelve tópicos que están en el contexto Y fueron evaluados por el intento nuevo (PARTE 13)", () => {
    const currentStates: LearningState[] = [
      state({ moduleId: "m1", topicId: "a", status: "mastered", reasonCode: "HIGH_CERTIFICATION_SCORE" }),
      state({ moduleId: "m1", topicId: "b", status: "needs_review" }),
      state({ moduleId: "m1", topicId: "c", status: "mastered" }), // no pertenece al contexto: nunca aparece
    ];
    const results = deriveVerificationResults(context, currentStates, [
      { moduleId: "m1", topicId: "a" },
      { moduleId: "m1", topicId: "b" },
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.topicId)).toEqual(["a", "b"]);
    expect(results[0].current.status).toBe("mastered");
    expect(results[0].before?.status).toBe("needs_review");
  });

  it("topic isolation: un tópico del contexto que NO fue evaluado por este intento queda afuera", () => {
    const currentStates: LearningState[] = [
      state({ moduleId: "m1", topicId: "a", status: "mastered" }),
      state({ moduleId: "m1", topicId: "b", status: "needs_review" }),
    ];
    // Solo "a" fue evaluado (alcance manual distinto en Setup, por ejemplo).
    const results = deriveVerificationResults(context, currentStates, [{ moduleId: "m1", topicId: "a" }]);
    expect(results).toHaveLength(1);
    expect(results[0].topicId).toBe("a");
  });

  it("stale topic: un tópico evaluado que ya no existe en el curriculum actual se salta sin crash (PARTE 49)", () => {
    const currentStates: LearningState[] = [state({ moduleId: "m1", topicId: "a", status: "mastered" })];
    // "b" fue evaluado pero currentStates ya no lo tiene (curriculum cambió).
    const results = deriveVerificationResults(context, currentStates, [
      { moduleId: "m1", topicId: "a" },
      { moduleId: "m1", topicId: "b" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].topicId).toBe("a");
  });

  it("all stale: sin intersección real -> [] (nunca crash, nunca panel vacío raro, PARTE 50)", () => {
    const results = deriveVerificationResults(context, [], [
      { moduleId: "m1", topicId: "a" },
      { moduleId: "m1", topicId: "b" },
    ]);
    expect(results).toEqual([]);
  });

  it("mixed results: dos tópicos pueden terminar en estados DISTINTOS (PARTE 26/82)", () => {
    const currentStates: LearningState[] = [
      state({ moduleId: "m1", topicId: "a", status: "mastered", reasonCode: "HIGH_CERTIFICATION_SCORE" }),
      state({ moduleId: "m1", topicId: "b", status: "needs_review", reasonCode: "REPEATED_LOW_CERTIFICATION_SCORE" }),
    ];
    const results = deriveVerificationResults(context, currentStates, [
      { moduleId: "m1", topicId: "a" },
      { moduleId: "m1", topicId: "b" },
    ]);
    expect(results.find((r) => r.topicId === "a")?.current.status).toBe("mastered");
    expect(results.find((r) => r.topicId === "b")?.current.status).toBe("needs_review");
  });

  it("same status: before y after iguales sigue siendo un resultado válido (PARTE 83)", () => {
    const currentStates: LearningState[] = [state({ moduleId: "m1", topicId: "a", status: "needs_review" })];
    const results = deriveVerificationResults(context, currentStates, [{ moduleId: "m1", topicId: "a" }]);
    expect(results[0].before?.status).toBe("needs_review");
    expect(results[0].current.status).toBe("needs_review");
  });

  it("before=null cuando el tópico no tenía snapshot previo (defensivo, nunca lanza)", () => {
    const contextWithoutSnapshot: GuidedReviewVerificationContext = { ...context, preVerificationStates: [] };
    const currentStates: LearningState[] = [state({ moduleId: "m1", topicId: "a", status: "mastered" })];
    const results = deriveVerificationResults(contextWithoutSnapshot, currentStates, [{ moduleId: "m1", topicId: "a" }]);
    expect(results[0].before).toBeNull();
  });
});
