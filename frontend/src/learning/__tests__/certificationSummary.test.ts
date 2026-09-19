import { describe, expect, it } from "vitest";
import {
  buildAttemptSummary,
  buildCertificationOverview,
  getAreasToReinforce,
} from "../certificationSummary";
import type { CertificationAttemptSummary } from "../types";
import type { CertificationPracticeResult, ExamQuestionView } from "../../types/api";
import type { StoredExamSession } from "../../certification/certificationStorage";

function sampleQuestion(overrides: Partial<ExamQuestionView> = {}): ExamQuestionView {
  return {
    bank_id: "a".repeat(64),
    question_id: "Q-001",
    course_id: "curso-demo",
    module_id: "modulo-1",
    topic_id: "topico-1",
    question_type: "single_choice",
    question_style: "conceptual",
    stem: "¿Pregunta?",
    options: [
      { option_id: "A", text: "Opción A" },
      { option_id: "B", text: "Opción B" },
    ],
    ...overrides,
  };
}

function sampleSession(overrides: Partial<StoredExamSession> = {}): StoredExamSession {
  return {
    practiceId: "practice-1",
    courseId: "curso-demo",
    mode: "practice",
    requestedCount: 2,
    actualCount: 2,
    questions: [sampleQuestion(), sampleQuestion({ question_id: "Q-002", module_id: "modulo-2" })],
    currentIndex: 0,
    selections: {},
    evaluations: {},
    ...overrides,
  };
}

function sampleResult(overrides: Partial<CertificationPracticeResult> = {}): CertificationPracticeResult {
  return {
    total_questions: 2,
    correct: 1,
    partially_correct: 0,
    incorrect: 1,
    unanswered: 0,
    practice_score_percent: 50,
    by_topic: [],
    by_competency: [
      { competency: "Tool use", attempted: 1, correct: 0, partially_correct: 0, incorrect: 1, practice_score_percent: 50 },
    ],
    question_results: [
      {
        bank_id: "a".repeat(64),
        question_id: "Q-001",
        module_id: "modulo-1",
        topic_id: "topico-1",
        question_type: "single_choice",
        selected_option_ids: ["A"],
        verdict: "correct",
        correct_option_ids: ["A"],
        explanation: [{ text: "Porque sí", source_refs: ["SRC-001"] }],
        competency: { text: "Tool use", source_refs: ["SRC-001"] },
      },
    ],
    topics_to_reinforce: [],
    ...overrides,
  };
}

describe("buildAttemptSummary", () => {
  // M. answer key: nunca persistido.
  it("M: nunca copia question_results (el único campo con answer key)", () => {
    const summary = buildAttemptSummary(sampleSession(), sampleResult());
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("correct_option_ids");
    expect(serialized).not.toContain("explanation");
    expect(serialized).not.toContain("Porque sí");
    expect((summary as unknown as Record<string, unknown>).question_results).toBeUndefined();
  });

  it("deriva module_ids/topic_ids únicos y ordenados a partir de las preguntas del examen", () => {
    const summary = buildAttemptSummary(sampleSession(), sampleResult());
    expect(summary.moduleIds).toEqual(["modulo-1", "modulo-2"]);
    expect(summary.topicIds).toEqual(["topico-1"]);
  });

  it("preserva mode/course/score/counts del resultado ya evaluado", () => {
    const summary = buildAttemptSummary(sampleSession({ mode: "simulation" }), sampleResult());
    expect(summary.mode).toBe("simulation");
    expect(summary.courseId).toBe("curso-demo");
    expect(summary.scorePercentage).toBe(50);
    expect(summary.correctCount).toBe(1);
    expect(summary.incorrectCount).toBe(1);
  });
});

function attempt(overrides: Partial<CertificationAttemptSummary> = {}): CertificationAttemptSummary {
  return {
    attemptId: `a-${Math.random()}`,
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
    completedAt: new Date().toISOString(),
    performanceByTopic: [],
    competenciesToReinforce: [],
    ...overrides,
  };
}

describe("buildCertificationOverview", () => {
  // V. sin intentos: empty states.
  it("V: sin intentos, ambos modos quedan en 0 sin NaN/undefined", () => {
    const overview = buildCertificationOverview([]);
    expect(overview.practice.attemptCount).toBe(0);
    expect(overview.practice.lastScore).toBeNull();
    expect(overview.practice.bestScore).toBeNull();
    expect(overview.simulation.attemptCount).toBe(0);
    expect(overview.recentAttempts).toEqual([]);
  });

  // N. best score correcto.
  it("N: bestScore es el máximo entre todos los intentos de ese modo", () => {
    const overview = buildCertificationOverview([
      attempt({ mode: "practice", scorePercentage: 40, completedAt: "2025-01-01T00:00:00.000Z" }),
      attempt({ mode: "practice", scorePercentage: 90, completedAt: "2025-01-02T00:00:00.000Z" }),
      attempt({ mode: "practice", scorePercentage: 60, completedAt: "2025-01-03T00:00:00.000Z" }),
    ]);
    expect(overview.practice.bestScore).toBe(90);
  });

  // O. last score correcto.
  it("O: lastScore es el score del intento con completedAt más reciente, no el último insertado", () => {
    const overview = buildCertificationOverview([
      attempt({ mode: "practice", scorePercentage: 40, completedAt: "2025-01-03T00:00:00.000Z" }),
      attempt({ mode: "practice", scorePercentage: 90, completedAt: "2025-01-01T00:00:00.000Z" }),
    ]);
    expect(overview.practice.lastScore).toBe(40);
  });

  it("practice y simulation se cuentan por separado", () => {
    const overview = buildCertificationOverview([
      attempt({ mode: "practice" }),
      attempt({ mode: "practice" }),
      attempt({ mode: "simulation" }),
    ]);
    expect(overview.practice.attemptCount).toBe(2);
    expect(overview.simulation.attemptCount).toBe(1);
  });
});

describe("getAreasToReinforce", () => {
  // V (variante). sin intentos: lista vacía.
  it("V: sin intentos, devuelve una lista vacía", () => {
    expect(getAreasToReinforce([])).toEqual([]);
  });

  // U. agregación determinística.
  it("U: usa el desempeño del intento MÁS RECIENTE que menciona cada competencia", () => {
    const attempts = [
      attempt({
        completedAt: "2025-01-01T00:00:00.000Z",
        competenciesToReinforce: [
          { competency: "Tool use", attempted: 2, correct: 1, partially_correct: 0, incorrect: 1, practice_score_percent: 50 },
        ],
      }),
      attempt({
        completedAt: "2025-02-01T00:00:00.000Z",
        competenciesToReinforce: [
          { competency: "Tool use", attempted: 2, correct: 2, partially_correct: 0, incorrect: 0, practice_score_percent: 100 },
        ],
      }),
    ];
    const areas = getAreasToReinforce(attempts);
    expect(areas).toHaveLength(1);
    expect(areas[0].recentScorePercent).toBe(100); // el más reciente, no un promedio (75).
    expect(areas[0].basedOnSingleAttempt).toBe(false);
  });

  it("ordena de peor a mejor desempeño (áreas a reforzar primero)", () => {
    const attempts = [
      attempt({
        competenciesToReinforce: [
          { competency: "A", attempted: 1, correct: 1, partially_correct: 0, incorrect: 0, practice_score_percent: 90 },
          { competency: "B", attempted: 1, correct: 0, partially_correct: 0, incorrect: 1, practice_score_percent: 30 },
        ],
      }),
    ];
    const areas = getAreasToReinforce(attempts);
    expect(areas.map((a) => a.competency)).toEqual(["B", "A"]);
  });

  it("con un solo intento, marca basedOnSingleAttempt=true (resultado observado, no tendencia)", () => {
    const attempts = [
      attempt({
        competenciesToReinforce: [
          { competency: "Tool use", attempted: 1, correct: 1, partially_correct: 0, incorrect: 0, practice_score_percent: 100 },
        ],
      }),
    ];
    expect(getAreasToReinforce(attempts)[0].basedOnSingleAttempt).toBe(true);
  });

  it("nunca inventa una competencia que no fue producida por una práctica real", () => {
    const areas = getAreasToReinforce([attempt({ competenciesToReinforce: [] })]);
    expect(areas).toEqual([]);
  });
});
