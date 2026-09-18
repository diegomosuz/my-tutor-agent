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
    window.sessionStorage.setItem("pwc-tutor:certification-exam:curso-demo", "{not-json");
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
    saveCertificationResult("curso-demo", result);
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
    saveCertificationResult("curso-demo", result);
    clearCertificationResult("curso-demo");
    expect(loadCertificationResult("curso-demo")).toBeNull();
  });

  it("las sesiones de distintos cursos no se pisan entre sí", () => {
    saveExamSession(SESSION);
    saveExamSession({ ...SESSION, courseId: "otro-curso", practiceId: "practice-2" });
    expect(loadExamSession("curso-demo")?.practiceId).toBe("practice-1");
    expect(loadExamSession("otro-curso")?.practiceId).toBe("practice-2");
  });
});
