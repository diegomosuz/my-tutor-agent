import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCourseIdsWithProgress,
  getCourseLearningProgress,
  markTopicCompleted,
  markTopicStarted,
  MAX_CERTIFICATION_ATTEMPTS_PER_COURSE,
  recordCertificationAttempt,
  resetCourseProgress,
} from "../learningProgressStore";
import type { CertificationAttemptSummary } from "../types";

function sampleAttempt(overrides: Partial<CertificationAttemptSummary> = {}): CertificationAttemptSummary {
  return {
    attemptId: `attempt-${Math.random().toString(36).slice(2)}`,
    courseId: "curso-demo",
    mode: "practice",
    moduleIds: ["modulo-1"],
    topicIds: ["topico-1"],
    questionCount: 5,
    answeredCount: 5,
    correctCount: 3,
    partialCount: 1,
    incorrectCount: 1,
    unansweredCount: 0,
    scorePercentage: 70,
    completedAt: new Date().toISOString(),
    performanceByTopic: [],
    competenciesToReinforce: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("learningProgressStore", () => {
  // A. nuevo usuario: 0 progreso.
  it("A: un curso nunca tocado no tiene progreso guardado", () => {
    expect(getCourseLearningProgress("curso-demo")).toBeNull();
    expect(getCourseIdsWithProgress()).toEqual([]);
  });

  // B. abrir tópico -> in_progress.
  it("B: markTopicStarted pasa un tópico nuevo a in_progress", () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    const progress = getCourseLearningProgress("curso-demo");
    expect(progress?.topics["modulo-1:topico-1"].status).toBe("in_progress");
    expect(progress?.topics["modulo-1:topico-1"].startedAt).not.toBeNull();
  });

  // C. completar tópico -> completed.
  it("C: markTopicCompleted marca el tópico como completed", () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    markTopicCompleted("curso-demo", "modulo-1", "topico-1", "sha-abc");
    const progress = getCourseLearningProgress("curso-demo");
    expect(progress?.topics["modulo-1:topico-1"].status).toBe("completed");
    expect(progress?.topics["modulo-1:topico-1"].completedAt).not.toBeNull();
  });

  // D. repetir tópico -> permanece completed.
  it("D: volver a abrir/repetir un tópico completado nunca lo degrada", () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    const completedAtFirst = getCourseLearningProgress("curso-demo")!.topics["modulo-1:topico-1"]
      .completedAt;

    // "Repetir tema" -> vuelve a abrir el tópico (escena 0).
    markTopicStarted("curso-demo", "modulo-1", "topico-1", { currentScene: 0 });

    const progress = getCourseLearningProgress("curso-demo");
    expect(progress?.topics["modulo-1:topico-1"].status).toBe("completed");
    // El completedAt original se preserva (evidencia histórica real).
    expect(progress?.topics["modulo-1:topico-1"].completedAt).toBe(completedAtFirst);
  });

  // G. multi-curso: aislamiento completo.
  it("G: el progreso de un curso nunca se mezcla con el de otro", () => {
    markTopicCompleted("curso-a", "modulo-1", "topico-1");
    markTopicStarted("curso-b", "modulo-1", "topico-1");

    expect(getCourseLearningProgress("curso-a")?.topics["modulo-1:topico-1"].status).toBe(
      "completed"
    );
    expect(getCourseLearningProgress("curso-b")?.topics["modulo-1:topico-1"].status).toBe(
      "in_progress"
    );
  });

  // T. nunca mezcla cursos con mismos module/topic slugs.
  it("T: dos cursos con module_id/topic_id idénticos permanecen aislados", () => {
    markTopicCompleted("claude-foundations-certification", "modulo-1", "modulo-1-introduccion");
    markTopicStarted("otro-curso", "modulo-1", "modulo-1-introduccion");

    const a = getCourseLearningProgress("claude-foundations-certification");
    const b = getCourseLearningProgress("otro-curso");
    expect(a?.topics["modulo-1:modulo-1-introduccion"].status).toBe("completed");
    expect(b?.topics["modulo-1:modulo-1-introduccion"].status).toBe("in_progress");
    expect(getCourseIdsWithProgress().sort()).toEqual(
      ["claude-foundations-certification", "otro-curso"].sort()
    );
  });

  // K/L. practice/simulation terminado: se registra intento.
  it("K/L: recordCertificationAttempt registra intentos de practice y simulation", () => {
    recordCertificationAttempt("curso-demo", sampleAttempt({ mode: "practice", attemptId: "p1" }));
    recordCertificationAttempt("curso-demo", sampleAttempt({ mode: "simulation", attemptId: "s1" }));

    const progress = getCourseLearningProgress("curso-demo");
    expect(progress?.certificationAttempts).toHaveLength(2);
    expect(progress?.certificationAttempts.map((a) => a.mode).sort()).toEqual([
      "practice",
      "simulation",
    ]);
  });

  // P. máximo de intentos: retención correcta.
  it("P: conserva solo los MAX_CERTIFICATION_ATTEMPTS_PER_COURSE intentos más recientes", () => {
    const base = Date.now();
    for (let i = 0; i < MAX_CERTIFICATION_ATTEMPTS_PER_COURSE + 10; i += 1) {
      recordCertificationAttempt(
        "curso-demo",
        sampleAttempt({
          attemptId: `attempt-${i}`,
          completedAt: new Date(base + i * 1000).toISOString(),
          scorePercentage: i,
        })
      );
    }
    const progress = getCourseLearningProgress("curso-demo");
    expect(progress?.certificationAttempts).toHaveLength(MAX_CERTIFICATION_ATTEMPTS_PER_COURSE);
    // Los conservados son los más recientes: el intento más nuevo
    // (attempt-59) debe seguir presente, el más viejo (attempt-0) no.
    const ids = progress!.certificationAttempts.map((a) => a.attemptId);
    expect(ids).toContain(`attempt-${MAX_CERTIFICATION_ATTEMPTS_PER_COURSE + 9}`);
    expect(ids).not.toContain("attempt-0");
  });

  // Q. corrupt localStorage: no rompe aplicación.
  it("Q: un documento corrupto en localStorage nunca rompe la app", () => {
    window.localStorage.setItem("pwc-tutor:learning-progress:v1", "{esto no es JSON válido");
    expect(() => getCourseLearningProgress("curso-demo")).not.toThrow();
    expect(getCourseLearningProgress("curso-demo")).toBeNull();

    // Y sigue pudiendo escribir normalmente después.
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    expect(getCourseLearningProgress("curso-demo")?.topics["modulo-1:topico-1"].status).toBe(
      "in_progress"
    );
  });

  it("Q: un curso individual corrupto dentro de un documento válido se ignora sin afectar a los demás", () => {
    const raw = {
      schemaVersion: 1,
      migratedLegacyAt: new Date().toISOString(),
      courses: {
        "curso-bueno": {
          courseId: "curso-bueno",
          topics: {
            "modulo-1:topico-1": {
              moduleId: "modulo-1",
              topicId: "topico-1",
              status: "completed",
              startedAt: null,
              lastAccessedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              currentScene: null,
              totalScenes: null,
              contentSha256: null,
            },
          },
          certificationAttempts: [],
        },
        "curso-corrupto": { esto: "no tiene la forma esperada" },
      },
    };
    window.localStorage.setItem("pwc-tutor:learning-progress:v1", JSON.stringify(raw));
    expect(getCourseLearningProgress("curso-bueno")?.topics["modulo-1:topico-1"].status).toBe(
      "completed"
    );
    expect(getCourseLearningProgress("curso-corrupto")).toBeNull();
  });

  // R. migración: idempotente.
  it("R: migra progreso legacy completado una sola vez, de forma idempotente", () => {
    window.localStorage.setItem(
      "pwc-tutor:progress:curso-legacy:modulo-1:topico-1",
      JSON.stringify({
        courseId: "curso-legacy",
        moduleId: "modulo-1",
        topicId: "topico-1",
        contentSha256: "sha-legacy",
        currentSceneIndex: 3,
        completed: true,
        updatedAt: "2025-01-01T00:00:00.000Z",
      })
    );

    const first = getCourseLearningProgress("curso-legacy");
    expect(first?.topics["modulo-1:topico-1"].status).toBe("completed");
    expect(first?.topics["modulo-1:topico-1"].completedAt).toBe("2025-01-01T00:00:00.000Z");

    // Si el alumno vuelve a abrir ese mismo tópico después de migrar, el
    // status "completed" migrado nunca se pisa/degrada.
    markTopicStarted("curso-legacy", "modulo-1", "topico-1");
    const second = getCourseLearningProgress("curso-legacy");
    expect(second?.topics["modulo-1:topico-1"].status).toBe("completed");
    // La migración en sí no vuelve a correr (idempotente): completedAt
    // original migrado se mantiene igual.
    expect(second?.topics["modulo-1:topico-1"].completedAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("R: una entrada legacy corrupta se ignora sin romper la migración de las demás", () => {
    window.localStorage.setItem("pwc-tutor:progress:curso-x:modulo-1:topico-1", "{corrupto");
    window.localStorage.setItem(
      "pwc-tutor:progress:curso-x:modulo-1:topico-2",
      JSON.stringify({
        courseId: "curso-x",
        moduleId: "modulo-1",
        topicId: "topico-2",
        contentSha256: "sha",
        currentSceneIndex: 1,
        completed: true,
        updatedAt: "2025-01-01T00:00:00.000Z",
      })
    );
    const progress = getCourseLearningProgress("curso-x");
    expect(progress?.topics["modulo-1:topico-2"].status).toBe("completed");
    expect(progress?.topics["modulo-1:topico-1"]).toBeUndefined();
  });

  // S. reset course: solo borra el curso seleccionado.
  it("S: resetCourseProgress borra solo el curso indicado, nunca otros", () => {
    markTopicCompleted("curso-a", "modulo-1", "topico-1");
    markTopicCompleted("curso-b", "modulo-1", "topico-1");
    recordCertificationAttempt("curso-a", sampleAttempt({ courseId: "curso-a" }));

    resetCourseProgress("curso-a");

    expect(getCourseLearningProgress("curso-a")).toBeNull();
    expect(getCourseLearningProgress("curso-b")?.topics["modulo-1:topico-1"].status).toBe(
      "completed"
    );
  });

  it("resetCourseProgress sobre un curso sin progreso nunca lanza", () => {
    expect(() => resetCourseProgress("curso-que-no-existe")).not.toThrow();
  });

  // W. content update: no elimina completion histórica.
  it("W: cambiar contentSha256 al reabrir un tópico completado no borra el status", () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1", { contentSha256: "sha-v1" });
    markTopicCompleted("curso-demo", "modulo-1", "topico-1", "sha-v1");

    // El Markdown cambió en disco -> content_sha256 nuevo al reabrir.
    markTopicStarted("curso-demo", "modulo-1", "topico-1", { contentSha256: "sha-v2" });

    const progress = getCourseLearningProgress("curso-demo");
    expect(progress?.topics["modulo-1:topico-1"].status).toBe("completed");
  });
});
