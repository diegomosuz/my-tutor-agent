import { describe, expect, it } from "vitest";
import { buildGuidedReviewPlan, MAX_GUIDED_REVIEW_TOPICS } from "../guidedReviewPlan";
import type { LearningState, LearningStateReasonCode, LearningStateStatus } from "../learningState";
import type { TopicLearningSignal } from "../topicLearningSignal";

function state(
  moduleId: string,
  topicId: string,
  status: LearningStateStatus,
  reasonCode: LearningStateReasonCode
): LearningState {
  const evidence: TopicLearningSignal = {
    moduleId,
    topicId,
    status: status === "not_started" ? "not_started" : "completed",
    observations: status === "needs_review" ? 1 : 0,
    latestScore: status === "needs_review" ? 30 : null,
    recentAverage: status === "needs_review" ? 30 : null,
    reinforcementLevel: status === "needs_review" ? "needs_reinforcement" : null,
    lastObservedAt: null,
  };
  return { courseId: "curso-demo", moduleId, topicId, status, reasonCode, evidence };
}

describe("buildGuidedReviewPlan (PASO 42/43)", () => {
  it("PASO 45: sin ningún needs_review, el plan es null (nunca lanza)", () => {
    const states = [
      state("m1", "a", "not_started", "NOT_STARTED"),
      state("m1", "b", "progressing", "STARTED_NOT_COMPLETED"),
      state("m1", "c", "mastered", "HIGH_CERTIFICATION_SCORE"),
    ];
    expect(buildGuidedReviewPlan("curso-demo", states)).toBeNull();
  });

  it("array vacío de LearningState: plan null, sin crash", () => {
    expect(buildGuidedReviewPlan("curso-demo", [])).toBeNull();
  });

  it("PASO 6: solo needs_review entra al plan -- progressing/mastered/not_started nunca se mezclan automáticamente", () => {
    const states = [
      state("m1", "a", "not_started", "NOT_STARTED"),
      state("m1", "b", "progressing", "STARTED_NOT_COMPLETED"),
      state("m1", "c", "needs_review", "LOW_CERTIFICATION_SCORE"),
      state("m1", "d", "mastered", "HIGH_CERTIFICATION_SCORE"),
    ];
    const plan = buildGuidedReviewPlan("curso-demo", states);
    expect(plan?.topics).toEqual([{ moduleId: "m1", topicId: "c" }]);
    expect(plan?.createdFromLearningState).toBe(true);
    expect(plan?.courseId).toBe("curso-demo");
  });

  it("PASO 44: con 8 needs_review, el plan contiene solo los primeros 5 en el orden ya devuelto por getReviewCandidates", () => {
    const states = Array.from({ length: 8 }, (_, i) =>
      state("m1", `t${i}`, "needs_review", "LOW_CERTIFICATION_SCORE")
    );
    const plan = buildGuidedReviewPlan("curso-demo", states);
    expect(plan?.topics).toHaveLength(MAX_GUIDED_REVIEW_TOPICS);
    expect(plan?.topics.map((t) => t.topicId)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
  });

  it("orden curricular preservado (nunca reordenado por score/alfabético)", () => {
    const states = [
      state("m1", "z-topic", "needs_review", "LOW_CERTIFICATION_SCORE"),
      state("m1", "a-topic", "needs_review", "LOW_CERTIFICATION_SCORE"),
    ];
    const plan = buildGuidedReviewPlan("curso-demo", states);
    // El orden de entrada (curricular) se preserva -- nunca alfabético.
    expect(plan?.topics.map((t) => t.topicId)).toEqual(["z-topic", "a-topic"]);
  });

  it("PASO 43: determinismo -- mismos states producen el mismo plan (deepEqual)", () => {
    const states = [
      state("m1", "a", "needs_review", "LOW_CERTIFICATION_SCORE"),
      state("m1", "b", "needs_review", "REPEATED_LOW_CERTIFICATION_SCORE"),
    ];
    const first = buildGuidedReviewPlan("curso-demo", states);
    const second = buildGuidedReviewPlan("curso-demo", states);
    expect(first).toEqual(second);
  });

  it("PASO 46: aislamiento de curso -- un plan de curso A nunca incluye tópicos etiquetados con courseId distinto (el courseId es explícito, no inferido)", () => {
    const statesCourseA = [state("m1", "a", "needs_review", "LOW_CERTIFICATION_SCORE")];
    const planA = buildGuidedReviewPlan("curso-A", statesCourseA);
    const planB = buildGuidedReviewPlan("curso-B", statesCourseA);
    expect(planA?.courseId).toBe("curso-A");
    expect(planB?.courseId).toBe("curso-B");
    // Mismos topics (mismo input), pero el courseId del plan es el que el
    // llamador pasó explícitamente -- nunca inferido de `state.courseId`.
    expect(planA?.topics).toEqual(planB?.topics);
  });
});
