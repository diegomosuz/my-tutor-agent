import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCertificationResult,
  clearExamSession,
  loadCertificationResult,
  loadExamSession,
  saveCertificationResult,
  saveExamSession,
  type StoredExamSession,
} from "../certificationStorage";
import type { CertificationPracticeResult } from "../../types/api";

const SESSION: StoredExamSession = {
  practiceId: "practice-1",
  courseId: "curso-demo",
  mode: "practice",
  requestedCount: 2,
  actualCount: 2,
  questions: [
    {
      bank_id: "a".repeat(64),
      question_id: "Q-001",
      course_id: "curso-demo",
      module_id: "modulo-demo",
      topic_id: "topico-demo",
      question_type: "single_choice",
      question_style: "conceptual",
      stem: "¿Pregunta?",
      options: [
        { option_id: "A", text: "Opción A" },
        { option_id: "B", text: "Opción B" },
      ],
    },
  ],
  currentIndex: 0,
  selections: {},
  evaluations: {},
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("certificationStorage", () => {
  it("guarda y recupera una sesión de examen", () => {
    saveExamSession(SESSION);
    const loaded = loadExamSession("curso-demo");
    expect(loaded).toEqual(SESSION);
  });

  it("devuelve null si no hay sesión guardada", () => {
    expect(loadExamSession("curso-inexistente")).toBeNull();
  });

  it("limpia la sesión de examen", () => {
    saveExamSession(SESSION);
    clearExamSession("curso-demo");
    expect(loadExamSession("curso-demo")).toBeNull();
  });

  it("nunca requiere el answer key para guardar la sesión (selections vacío es válido)", () => {
    saveExamSession(SESSION);
    const loaded = loadExamSession("curso-demo");
    expect(loaded?.evaluations).toEqual({});
  });

  it("ignora JSON corrupto en sessionStorage sin romper", () => {
    saveExamSession(SESSION);
    window.sessionStorage.setItem(
      `pwc-tutor:certification-exam:curso-demo:${SESSION.practiceId}`,
      "{not-json"
    );
    expect(loadExamSession("curso-demo")).toBeNull();
  });

  it("guarda y recupera un resultado de práctica", () => {
    const result: CertificationPracticeResult = {
      total_questions: 1,
      correct: 1,
      partially_correct: 0,
      incorrect: 0,
      unanswered: 0,
      practice_score_percent: 100,
      by_topic: [],
      by_competency: [],
      question_results: [],
      topics_to_reinforce: [],
    };
    saveExamSession(SESSION); // marca practice-1 como el practice_id activo
    saveCertificationResult("curso-demo", "practice-1", result);
    expect(loadCertificationResult("curso-demo")).toEqual(result);
  });

  it("limpia el resultado de práctica", () => {
    const result: CertificationPracticeResult = {
      total_questions: 0,
      correct: 0,
      partially_correct: 0,
      incorrect: 0,
      unanswered: 0,
      practice_score_percent: 0,
      by_topic: [],
      by_competency: [],
      question_results: [],
      topics_to_reinforce: [],
    };
    saveExamSession(SESSION);
    saveCertificationResult("curso-demo", "practice-1", result);
    clearCertificationResult("curso-demo");
    expect(loadCertificationResult("curso-demo")).toBeNull();
  });

  it("las sesiones de distintos cursos no se pisan entre sí", () => {
    saveExamSession(SESSION);
    saveExamSession({ ...SESSION, courseId: "otro-curso", practiceId: "practice-2" });
    expect(loadExamSession("curso-demo")?.practiceId).toBe("practice-1");
    expect(loadExamSession("otro-curso")?.practiceId).toBe("practice-2");
  });

  it("dos practice_id del mismo curso NO comparten respuestas (sección 4 de Fase 7)", () => {
    const first: StoredExamSession = {
      ...SESSION,
      practiceId: "practice-1",
      selections: { "Q-001": ["A"] },
    };
    saveExamSession(first);
    expect(loadExamSession("curso-demo")?.selections).toEqual({ "Q-001": ["A"] });

    // Preparar una práctica NUEVA para el mismo curso: distinto practice_id,
    // respuestas vacías — nunca debe heredar las selecciones de la anterior.
    const second: StoredExamSession = {
      ...SESSION,
      practiceId: "practice-2",
      selections: {},
    };
    saveExamSession(second);
    const loaded = loadExamSession("curso-demo");
    expect(loaded?.practiceId).toBe("practice-2");
    expect(loaded?.selections).toEqual({});

    // Los datos de practice-1 siguen existiendo en su propia key (no se
    // borraron), simplemente ya no son "la práctica activa" del curso —
    // confirmado inspeccionando sessionStorage directamente.
    const rawPractice1 = window.sessionStorage.getItem(
      "pwc-tutor:certification-exam:curso-demo:practice-1"
    );
    expect(rawPractice1).not.toBeNull();
    expect(JSON.parse(rawPractice1 as string).selections).toEqual({ "Q-001": ["A"] });
  });

  it("guardar un resultado usa el practice_id activo, nunca el de otra práctica", () => {
    const resultA: CertificationPracticeResult = {
      total_questions: 1,
      correct: 1,
      partially_correct: 0,
      incorrect: 0,
      unanswered: 0,
      practice_score_percent: 100,
      by_topic: [],
      by_competency: [],
      question_results: [],
      topics_to_reinforce: [],
    };
    const resultB: CertificationPracticeResult = { ...resultA, practice_score_percent: 0, correct: 0 };

    saveExamSession({ ...SESSION, practiceId: "practice-1" });
    saveCertificationResult("curso-demo", "practice-1", resultA);

    saveExamSession({ ...SESSION, practiceId: "practice-2" });
    saveCertificationResult("curso-demo", "practice-2", resultB);

    // El resultado activo (curso-demo) es el de practice-2, nunca el de practice-1.
    expect(loadCertificationResult("curso-demo")?.practice_score_percent).toBe(0);
  });
});
