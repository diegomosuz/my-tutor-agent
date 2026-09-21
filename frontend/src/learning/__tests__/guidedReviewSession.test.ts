import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GuidedReviewPlan, GuidedReviewTopicRef } from "../guidedReviewPlan";
import {
  clearGuidedReviewSession,
  loadGuidedReviewSession,
  nextGuidedReviewIndex,
  prevGuidedReviewIndex,
  resolveGuidedReviewStep,
  startGuidedReviewSession,
  updateGuidedReviewSessionIndex,
} from "../guidedReviewSession";

const STORAGE_KEY = "pwc-tutor:guided-review-session:v1";

function plan(courseId: string, topics: GuidedReviewTopicRef[]): GuidedReviewPlan {
  return { courseId, topics, createdFromLearningState: true };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("guidedReviewSession — store (PASO 47)", () => {
  it("save/load: startGuidedReviewSession + loadGuidedReviewSession devuelve currentIndex=0", () => {
    startGuidedReviewSession(plan("curso-demo", [{ moduleId: "m1", topicId: "a" }, { moduleId: "m1", topicId: "b" }]));
    const loaded = loadGuidedReviewSession("curso-demo");
    expect(loaded?.currentIndex).toBe(0);
    expect(loaded?.topics).toHaveLength(2);
  });

  it("update index: updateGuidedReviewSessionIndex persiste el nuevo índice", () => {
    startGuidedReviewSession(plan("curso-demo", [{ moduleId: "m1", topicId: "a" }, { moduleId: "m1", topicId: "b" }]));
    updateGuidedReviewSessionIndex("curso-demo", 1);
    expect(loadGuidedReviewSession("curso-demo")?.currentIndex).toBe(1);
  });

  it("update index fuera de rango: no-op (nunca corrompe la sesión)", () => {
    startGuidedReviewSession(plan("curso-demo", [{ moduleId: "m1", topicId: "a" }]));
    updateGuidedReviewSessionIndex("curso-demo", 5);
    expect(loadGuidedReviewSession("curso-demo")?.currentIndex).toBe(0);
  });

  it("clear: clearGuidedReviewSession borra la sesión por completo", () => {
    startGuidedReviewSession(plan("curso-demo", [{ moduleId: "m1", topicId: "a" }]));
    clearGuidedReviewSession();
    expect(loadGuidedReviewSession("curso-demo")).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("corrupt JSON: safe fallback a null, nunca lanza", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(() => loadGuidedReviewSession("curso-demo")).not.toThrow();
    expect(loadGuidedReviewSession("curso-demo")).toBeNull();
  });

  it("wrong schema (schemaVersion incorrecta): safe fallback a null", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 99, courseId: "curso-demo", topics: [{ moduleId: "m1", topicId: "a" }], currentIndex: 0, startedAt: "x" })
    );
    expect(loadGuidedReviewSession("curso-demo")).toBeNull();
  });

  it("wrong shape (topics vacío / no array / currentIndex fuera de rango): safe fallback a null", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, courseId: "curso-demo", topics: [], currentIndex: 0, startedAt: "x" })
    );
    expect(loadGuidedReviewSession("curso-demo")).toBeNull();
  });

  it("PASO 14/46: wrong course (sesión de otro curso) -- nunca aparece en éste", () => {
    startGuidedReviewSession(plan("curso-A", [{ moduleId: "m1", topicId: "a" }]));
    expect(loadGuidedReviewSession("curso-B")).toBeNull();
    expect(loadGuidedReviewSession("curso-A")).not.toBeNull();
  });

  it("startGuidedReviewSession reemplaza cualquier sesión previa (nunca deja dos sesiones superpuestas)", () => {
    startGuidedReviewSession(plan("curso-A", [{ moduleId: "m1", topicId: "a" }]));
    updateGuidedReviewSessionIndex("curso-A", 0);
    startGuidedReviewSession(plan("curso-B", [{ moduleId: "m2", topicId: "z" }]));
    expect(loadGuidedReviewSession("curso-A")).toBeNull();
    expect(loadGuidedReviewSession("curso-B")?.currentIndex).toBe(0);
  });
});

describe("resolveGuidedReviewStep / next / prev — funciones puras (PASO 15/62/63)", () => {
  const topics: GuidedReviewTopicRef[] = [
    { moduleId: "m1", topicId: "a" },
    { moduleId: "m1", topicId: "b" },
    { moduleId: "m1", topicId: "c" },
  ];
  const allValid = () => true;

  it("resuelve position/total correctos con todos los tópicos válidos", () => {
    const step = resolveGuidedReviewStep(topics, 1, allValid);
    expect(step).toEqual({
      ref: { moduleId: "m1", topicId: "b" },
      position: 2,
      total: 3,
      isFirst: false,
      isLast: false,
      resolvedIndex: 1,
    });
  });

  it("isFirst/isLast correctos en los extremos", () => {
    expect(resolveGuidedReviewStep(topics, 0, allValid)?.isFirst).toBe(true);
    expect(resolveGuidedReviewStep(topics, 2, allValid)?.isLast).toBe(true);
  });

  it("PASO 62: tópico stale en el índice actual -- salta determinísticamente al próximo válido", () => {
    const isValid = (ref: GuidedReviewTopicRef) => ref.topicId !== "b"; // "b" ya no existe
    const step = resolveGuidedReviewStep(topics, 1, isValid);
    expect(step?.ref.topicId).toBe("c"); // salta "b", cae en "c"
    expect(step?.total).toBe(2); // "a" y "c" -- "b" nunca cuenta
  });

  it("PASO 63: TODOS los tópicos del plan ausentes -- resuelve null (sesión debe poder terminar limpiamente)", () => {
    const step = resolveGuidedReviewStep(topics, 0, () => false);
    expect(step).toBeNull();
  });

  it("nextGuidedReviewIndex devuelve el próximo índice válido, o null si no queda ninguno", () => {
    expect(nextGuidedReviewIndex(topics, 0, allValid)).toBe(1);
    expect(nextGuidedReviewIndex(topics, 2, allValid)).toBeNull(); // último -> "Finalizar"
  });

  it("nextGuidedReviewIndex salta tópicos stale", () => {
    const isValid = (ref: GuidedReviewTopicRef) => ref.topicId !== "b";
    expect(nextGuidedReviewIndex(topics, 0, isValid)).toBe(2); // salta "b"
  });

  it("prevGuidedReviewIndex devuelve el índice válido anterior, o null en el primero", () => {
    expect(prevGuidedReviewIndex(topics, 2, allValid)).toBe(1);
    expect(prevGuidedReviewIndex(topics, 0, allValid)).toBeNull();
  });

  it("determinismo: misma entrada produce el mismo resultado", () => {
    expect(resolveGuidedReviewStep(topics, 1, allValid)).toEqual(resolveGuidedReviewStep(topics, 1, allValid));
  });
});
