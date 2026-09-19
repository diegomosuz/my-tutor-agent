import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    api: {
      prepareCertification: vi.fn(),
      evaluateCertificationQuestion: vi.fn(),
      evaluateCertificationSimulation: vi.fn(),
    },
    ApiError,
  };
});

import { api, ApiError } from "../../api/client";
import { useCertificationExam } from "../useCertificationExam";
import { examAnswerKey, loadCertificationResult, loadExamSession } from "../certificationStorage";

const BANK_ID = "a".repeat(64);

const mockedPrepare = api.prepareCertification as unknown as ReturnType<typeof vi.fn>;
const mockedEvaluateQuestion = api.evaluateCertificationQuestion as unknown as ReturnType<typeof vi.fn>;
const mockedEvaluateSimulation = api.evaluateCertificationSimulation as unknown as ReturnType<
  typeof vi.fn
>;

const COURSE_ID = "curso-demo";

function samplePrepareResponse(count = 2) {
  return {
    practice_id: "practice-1",
    course_id: COURSE_ID,
    mode: "practice" as const,
    requested_count: count,
    actual_count: count,
    questions: Array.from({ length: count }, (_, i) => ({
      bank_id: "a".repeat(64),
      question_id: `Q-00${i + 1}`,
      course_id: COURSE_ID,
      module_id: "modulo-demo",
      topic_id: "topico-demo",
      question_type: "single_choice" as const,
      question_style: "conceptual" as const,
      stem: `Pregunta ${i + 1}`,
      options: [
        { option_id: "A", text: "Opción A" },
        { option_id: "B", text: "Opción B" },
      ],
    })),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockedPrepare.mockReset();
  mockedEvaluateQuestion.mockReset();
  mockedEvaluateSimulation.mockReset();
});

describe("useCertificationExam", () => {
  it("prepare() llama al endpoint y guarda la sesión", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));

    let ok = false;
    await act(async () => {
      ok = await result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });

    expect(ok).toBe(true);
    expect(mockedPrepare).toHaveBeenCalledTimes(1);
    expect(result.current.session?.questions).toHaveLength(2);
    expect(loadExamSession(COURSE_ID)?.practiceId).toBe("practice-1");
  });

  it("prepare() con actual_count=0 NUNCA guarda la sesión ni navega (bug real, Fase 8 sección 28)", async () => {
    // Antes del fix: una sesión con questions=[] se persistía igual y
    // CertificationPracticePage/SimulationPage rompían al hacer
    // session.questions[0].question_id (undefined). prepare() ahora debe
    // devolver false y exponer un error claro, sin persistir la sesión.
    mockedPrepare.mockResolvedValue({
      ...samplePrepareResponse(0),
      questions: [],
      actual_count: 0,
    });
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));

    let ok = true;
    await act(async () => {
      ok = await result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 5,
      });
    });

    expect(ok).toBe(false);
    expect(result.current.session).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(loadExamSession(COURSE_ID)).toBeNull();
  });

  it("selectAnswer() guarda la selección sin incluir el answer key", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));
    await act(async () => {
      await result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });

    act(() => {
      result.current.selectAnswer(BANK_ID, "Q-001", ["A"]);
    });

    expect(result.current.session?.selections[examAnswerKey(BANK_ID, "Q-001")]).toEqual(["A"]);
    expect(JSON.stringify(result.current.session)).not.toContain("correct_option_ids");
  });

  it("evaluateCurrentQuestion() llama al backend y guarda el resultado (con answer key)", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    mockedEvaluateQuestion.mockResolvedValue({
      bank_id: "a".repeat(64),
      question_id: "Q-001",
      module_id: "modulo-demo",
      topic_id: "topico-demo",
      question_type: "single_choice",
      selected_option_ids: ["A"],
      verdict: "correct",
      correct_option_ids: ["A"],
      explanation: [{ text: "Correcto.", source_refs: ["SRC-001"] }],
      competency: { text: "Comp", source_refs: ["SRC-001"] },
    });
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));
    await act(async () => {
      await result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });
    act(() => result.current.selectAnswer(BANK_ID, "Q-001", ["A"]));

    await act(async () => {
      await result.current.evaluateCurrentQuestion();
    });

    expect(mockedEvaluateQuestion).toHaveBeenCalledTimes(1);
    expect(result.current.session?.evaluations[examAnswerKey(BANK_ID, "Q-001")].verdict).toBe("correct");
  });

  it("evaluateCurrentQuestion() no vuelve a llamar al backend si ya fue evaluada", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    mockedEvaluateQuestion.mockResolvedValue({
      bank_id: "a".repeat(64),
      question_id: "Q-001",
      module_id: "modulo-demo",
      topic_id: "topico-demo",
      question_type: "single_choice",
      selected_option_ids: ["A"],
      verdict: "correct",
      correct_option_ids: ["A"],
      explanation: [{ text: "Correcto.", source_refs: ["SRC-001"] }],
      competency: { text: "Comp", source_refs: ["SRC-001"] },
    });
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));
    await act(async () => {
      await result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });
    act(() => result.current.selectAnswer(BANK_ID, "Q-001", ["A"]));
    await act(async () => {
      await result.current.evaluateCurrentQuestion();
    });
    await act(async () => {
      await result.current.evaluateCurrentQuestion();
    });

    expect(mockedEvaluateQuestion).toHaveBeenCalledTimes(1);
  });

  it("submitExam() evalúa todas las respuestas y guarda el resultado", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    mockedEvaluateSimulation.mockResolvedValue({
      total_questions: 2,
      correct: 1,
      partially_correct: 0,
      incorrect: 0,
      unanswered: 1,
      practice_score_percent: 50,
      by_topic: [],
      by_competency: [],
      question_results: [],
      topics_to_reinforce: [],
    });
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));
    await act(async () => {
      await result.current.prepare({
        mode: "simulation",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });
    act(() => result.current.selectAnswer(BANK_ID, "Q-001", ["A"]));
    // Q-002 queda sin responder deliberadamente.

    await act(async () => {
      await result.current.submitExam();
    });

    expect(mockedEvaluateSimulation).toHaveBeenCalledTimes(1);
    const sentAnswers = mockedEvaluateSimulation.mock.calls[0][1].answers;
    expect(sentAnswers).toHaveLength(2);
    expect(sentAnswers[1].selected_option_ids).toEqual([]); // unanswered enviado explícitamente
    expect(loadCertificationResult(COURSE_ID)?.practice_score_percent).toBe(50);
  });

  it("submitExam() conserva la sesión de examen (para el repaso en ResultsPage)", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    mockedEvaluateSimulation.mockResolvedValue({
      total_questions: 2,
      correct: 2,
      partially_correct: 0,
      incorrect: 0,
      unanswered: 0,
      practice_score_percent: 100,
      by_topic: [],
      by_competency: [],
      question_results: [],
      topics_to_reinforce: [],
    });
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));
    await act(async () => {
      await result.current.prepare({
        mode: "simulation",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });
    await act(async () => {
      await result.current.submitExam();
    });

    expect(loadExamSession(COURSE_ID)?.questions).toHaveLength(2);
  });

  it("clearSession() borra sesión y resultado", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));
    await act(async () => {
      await result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });

    act(() => result.current.clearSession());

    expect(result.current.session).toBeNull();
    expect(loadExamSession(COURSE_ID)).toBeNull();
    expect(loadCertificationResult(COURSE_ID)).toBeNull();
  });

  it("un error controlado se refleja en `error`", async () => {
    mockedPrepare.mockRejectedValue(new ApiError(503, "Sin credencial."));
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));

    await act(async () => {
      await result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });

    expect(result.current.error?.title).toBe("IA no configurada");
    expect(result.current.loading).toBe(false);
  });

  it("restaura una sesión existente de sessionStorage al montar", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    const first = renderHook(() => useCertificationExam(COURSE_ID));
    await act(async () => {
      await first.result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });

    const second = renderHook(() => useCertificationExam(COURSE_ID));
    await waitFor(() => expect(second.result.current.session?.practiceId).toBe("practice-1"));
  });

  // --------------------------------------------------------------------
  // v1.1.0 (bloque de performance, PARTE 9/17): guard de doble submit —
  // un segundo prepare()/submitExam() mientras el primero sigue en curso
  // (loading=true) nunca dispara una segunda request al backend.
  // --------------------------------------------------------------------

  it("un segundo prepare() mientras el primero sigue pendiente no llama de nuevo al backend", async () => {
    let resolvePrepare: (value: ReturnType<typeof samplePrepareResponse>) => void = () => {};
    mockedPrepare.mockReturnValue(
      new Promise((resolve) => {
        resolvePrepare = resolve;
      })
    );
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));

    // Primer "click": arranca la request, queda pendiente (loading=true).
    act(() => {
      void result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });
    expect(result.current.loading).toBe(true);
    expect(mockedPrepare).toHaveBeenCalledTimes(1);

    // Segundo "click" mientras la primera sigue pendiente: el guard debe
    // devolver false sin llamar de nuevo a api.prepareCertification().
    let secondResult: boolean | undefined;
    await act(async () => {
      secondResult = await result.current.prepare({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });
    expect(secondResult).toBe(false);
    expect(mockedPrepare).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePrepare(samplePrepareResponse());
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session?.practiceId).toBe("practice-1");
  });

  it("un segundo submitExam() mientras el primero sigue pendiente registra el intento UNA sola vez en Mi aprendizaje", async () => {
    mockedPrepare.mockResolvedValue(samplePrepareResponse());
    let resolveEvaluate: (value: unknown) => void = () => {};
    mockedEvaluateSimulation.mockReturnValue(
      new Promise((resolve) => {
        resolveEvaluate = resolve;
      })
    );
    const { result } = renderHook(() => useCertificationExam(COURSE_ID));
    await act(async () => {
      await result.current.prepare({
        mode: "simulation",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 2,
      });
    });

    act(() => {
      void result.current.submitExam();
    });
    expect(result.current.loading).toBe(true);

    let secondResult: unknown;
    await act(async () => {
      secondResult = await result.current.submitExam();
    });
    expect(secondResult).toBeNull();
    expect(mockedEvaluateSimulation).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveEvaluate({
        total_questions: 2,
        correct: 2,
        partially_correct: 0,
        incorrect: 0,
        unanswered: 0,
        practice_score_percent: 100,
        by_topic: [],
        by_competency: [],
        question_results: [],
        topics_to_reinforce: [],
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // recordCertificationAttempt() corre dentro de submitExam() — con el
    // guard funcionando, debe haberse llamado una sola vez (no cero, no
    // dos veces). Se verifica indirectamente vía el store real (sin mock).
    const { getCourseLearningProgress } = await import("../../learning/learningProgressStore");
    const progress = getCourseLearningProgress(COURSE_ID);
    expect(progress?.certificationAttempts).toHaveLength(1);
  });
});
