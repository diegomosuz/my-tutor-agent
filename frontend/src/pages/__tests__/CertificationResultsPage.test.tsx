import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// v1.7.0 Bloque 2/3: topic progress Y Certification history son
// server-side (PostgreSQL) -- este archivo nunca siembra estado de tópico
// vía `markTopicStarted`/`markTopicCompleted` (backend fake de topics
// "siempre vacío" es suficiente), pero SÍ siembra Certification vía
// `recordCertificationAttempt` (localStorage) -- eso ahora representa el
// snapshot LEGACY que `useServerCertificationHistory` importa una sola vez
// contra el servidor. `mockGetCertificationHistory`/
// `mockImportLegacyCertificationHistory` simulan ese backend en memoria
// (mismo patrón ya probado en LearningProgressPage.test.tsx, Bloque 2).
interface FakeCertEntry {
  attempt_id: string;
  course_id: string;
  mode: string;
  module_ids: string[];
  topic_ids: string[];
  question_count: number;
  answered_count: number;
  correct_count: number;
  partial_count: number;
  incorrect_count: number;
  unanswered_count: number;
  score_percentage: number;
  completed_at: string;
  performance_by_topic: unknown[];
  competencies_to_reinforce: unknown[];
  topics_to_reinforce: unknown[];
  origin: string;
}

let fakeCertHistory: Record<string, FakeCertEntry[]> = {};

const mockGetCertificationHistory = vi.fn(async (courseId: string) => ({
  course_id: courseId,
  attempts: fakeCertHistory[courseId] ?? [],
}));
const mockImportLegacyCertificationHistory = vi.fn(
  async (
    courseId: string,
    body: {
      attempts: Array<{
        practice_id: string;
        mode: string;
        question_count: number;
        answered_count: number;
        correct_count: number;
        partial_count: number;
        incorrect_count: number;
        unanswered_count: number;
        score_percentage: number;
        completed_at: string;
        performance_by_topic: unknown[];
        competencies_to_reinforce: unknown[];
      }>;
    }
  ) => {
    const existing = (fakeCertHistory[courseId] ??= []);
    for (const attempt of body.attempts) {
      if (existing.some((e) => e.attempt_id === attempt.practice_id)) continue;
      const moduleIds = Array.from(
        new Set((attempt.performance_by_topic as Array<{ module_id: string }>).map((t) => t.module_id))
      );
      const topicIds = Array.from(
        new Set((attempt.performance_by_topic as Array<{ topic_id: string }>).map((t) => t.topic_id))
      );
      existing.push({
        attempt_id: attempt.practice_id,
        course_id: courseId,
        mode: attempt.mode,
        module_ids: moduleIds,
        topic_ids: topicIds,
        question_count: attempt.question_count,
        answered_count: attempt.answered_count,
        correct_count: attempt.correct_count,
        partial_count: attempt.partial_count,
        incorrect_count: attempt.incorrect_count,
        unanswered_count: attempt.unanswered_count,
        score_percentage: attempt.score_percentage,
        completed_at: attempt.completed_at,
        performance_by_topic: attempt.performance_by_topic,
        competencies_to_reinforce: attempt.competencies_to_reinforce,
        topics_to_reinforce: [],
        origin: "legacy_import",
      });
    }
    return { course_id: courseId, attempts: existing };
  }
);

// v1.7.0 Bloque 5: el panel de verificación ya NO deriva LearningState
// client-side -- `GET .../learning-profile` es la fuente productiva. Este
// fake backend deriva la respuesta reutilizando el mismo oráculo
// pedagógico (`getTopicLearningSignal`/`deriveTopicLearningState`, sin
// cambios) sobre `fakeCertHistory` (topic progress siempre vacío en este
// archivo, igual que ya hacía el fake de `getCourseProgress`) + el
// curriculum actualmente configurado en `api.getCourse`.
let fakeCourseCurriculumForResults: { modules: Array<{ id: string; title: string; topics: Array<{ id: string; title: string }> }> } = {
  modules: [],
};

function buildFakeLearningProfileResponseForResults(courseId: string) {
  const attempts = (fakeCertHistory[courseId] ?? []).map((e) => toAttemptSummary(e as never));
  const progress: CourseLearningProgress = {
    courseId,
    topics: {},
    certificationAttempts: attempts,
    serverProgressImportedAt: null,
    certificationHistoryImportedAt: null,
  };
  const topics = fakeCourseCurriculumForResults.modules.flatMap((module) =>
    module.topics.map((topic) => {
      const signal = getTopicLearningSignal(module.id, topic.id, progress, attempts);
      const { status, reasonCode } = deriveTopicLearningState(signal);
      return {
        module_id: module.id,
        topic_id: topic.id,
        module_title: module.title,
        topic_title: topic.title,
        curricular_status: signal.status,
        learning_status: status,
        reason_code: reasonCode,
        recent_average: signal.recentAverage,
        observation_count: signal.observations,
      };
    })
  );
  const summary = {
    total_topics: topics.length,
    not_started: topics.filter((t) => t.learning_status === "not_started").length,
    progressing: topics.filter((t) => t.learning_status === "progressing").length,
    needs_review: topics.filter((t) => t.learning_status === "needs_review").length,
    mastered: topics.filter((t) => t.learning_status === "mastered").length,
  };
  return { course_id: courseId, summary, topics };
}

const mockGetLearningProfile = vi.fn(async (courseId: string) => buildFakeLearningProfileResponseForResults(courseId));

vi.mock("../../api/client", () => ({
  api: {
    getCourse: vi.fn().mockResolvedValue({ id: "curso-demo", title: "Demo Curso IA", description: "", order: 1, modules: [] }),
    getCourseProgress: vi.fn().mockResolvedValue({ course_id: "curso-demo", topics: [] }),
    importLegacyProgress: vi.fn().mockResolvedValue({ course_id: "curso-demo", topics: [] }),
    getCertificationHistory: (courseId: string) => mockGetCertificationHistory(courseId),
    importLegacyCertificationHistory: (courseId: string, body: unknown) =>
      mockImportLegacyCertificationHistory(courseId, body as never),
    getLearningProfile: (courseId: string) => mockGetLearningProfile(courseId),
  },
}));

vi.mock("../../certification/certificationStorage", async () => {
  const actual = await vi.importActual<typeof import("../../certification/certificationStorage")>(
    "../../certification/certificationStorage"
  );
  return { ...actual, loadCertificationResult: vi.fn() };
});

const mockClearSession = vi.fn();
let mockExamReturn: any; // eslint-disable-line @typescript-eslint/no-explicit-any

vi.mock("../../certification/useCertificationExam", () => ({
  useCertificationExam: vi.fn(() => mockExamReturn),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { loadCertificationResult } from "../../certification/certificationStorage";
import { api } from "../../api/client";
import { recordCertificationAttempt } from "../../learning/learningProgressStore";
import {
  loadGuidedReviewVerificationContext,
  startGuidedReviewVerification,
} from "../../learning/guidedReviewVerification";
import { deriveTopicLearningState } from "../../learning/learningState";
import { getTopicLearningSignal } from "../../learning/topicLearningSignal";
import { toAttemptSummary } from "../../learning/useServerCertificationHistory";
import type { CertificationAttemptSummary, CourseLearningProgress } from "../../learning/types";
import { CertificationResultsPage } from "../CertificationResultsPage";

const mockedLoadResult = loadCertificationResult as unknown as ReturnType<typeof vi.fn>;
const mockedGetCourse = api.getCourse as unknown as ReturnType<typeof vi.fn>;

/** Reemplaza `mockedGetCourse.mockResolvedValue(detail)`: además de
 * configurar `api.getCourse`, registra el curriculum que el fake
 * `getLearningProfile` necesita (mismo principio que el backend real: el
 * universo de tópicos sale del curriculum, nunca de las filas de
 * progreso). */
function setCourseDetail(detail: typeof COURSE_WITH_TOPIC | { id: string; title: string; description: string; order: number; modules: [] }): void {
  mockedGetCourse.mockResolvedValue(detail);
  fakeCourseCurriculumForResults = detail;
}

const RESULT = {
  total_questions: 4,
  correct: 2,
  partially_correct: 1,
  incorrect: 1,
  unanswered: 0,
  practice_score_percent: 62.5,
  by_topic: [
    {
      module_id: "modulo-demo",
      topic_id: "topico-demo",
      attempted: 4,
      correct: 2,
      partially_correct: 1,
      incorrect: 1,
      unanswered: 0,
      practice_score_percent: 62.5,
    },
  ],
  by_competency: [
    {
      competency: "Identificar componentes",
      attempted: 4,
      correct: 2,
      partially_correct: 1,
      incorrect: 1,
      practice_score_percent: 62.5,
    },
  ],
  question_results: [
    {
      bank_id: "a".repeat(64),
      question_id: "Q-001",
      module_id: "modulo-demo",
      topic_id: "topico-demo",
      question_type: "single_choice",
      selected_option_ids: ["B"],
      verdict: "incorrect",
      correct_option_ids: ["A"],
      explanation: [{ text: "La opción A es correcta según el material.", source_refs: ["SRC-001"] }],
      competency: { text: "Identificar componentes", source_refs: ["SRC-001"] },
    },
  ],
  topics_to_reinforce: [
    {
      module_id: "modulo-demo",
      topic_id: "topico-demo",
      attempted: 4,
      correct: 2,
      partially_correct: 1,
      incorrect: 1,
      unanswered: 0,
      practice_score_percent: 62.5,
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/certificacion/curso-demo/resultados"]}>
      <Routes>
        <Route path="/certificacion/:courseId/resultados" element={<CertificationResultsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const COURSE_WITH_TOPIC = {
  id: "curso-demo",
  title: "Demo Curso IA",
  description: "",
  order: 1,
  modules: [
    {
      id: "modulo-demo",
      title: "Módulo Demo",
      order: 1,
      topics: [{ id: "topico-demo", title: "Tópico Demo", order: 1 }],
    },
  ],
};

function highScoreAttempt(attemptId: string): CertificationAttemptSummary {
  return {
    attemptId,
    courseId: "curso-demo",
    mode: "practice",
    moduleIds: ["modulo-demo"],
    topicIds: ["topico-demo"],
    questionCount: 4,
    answeredCount: 4,
    correctCount: 4,
    partialCount: 0,
    incorrectCount: 0,
    unansweredCount: 0,
    scorePercentage: 100,
    completedAt: "2026-01-01T00:00:00.000Z",
    performanceByTopic: [
      {
        module_id: "modulo-demo",
        topic_id: "topico-demo",
        attempted: 4,
        correct: 4,
        partially_correct: 0,
        incorrect: 0,
        unanswered: 0,
        practice_score_percent: 100,
      },
    ],
    competenciesToReinforce: [],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockedLoadResult.mockReset();
  mockClearSession.mockReset();
  mockNavigate.mockReset();
  mockedGetCourse.mockReset();
  fakeCertHistory = {};
  mockGetCertificationHistory.mockClear();
  mockImportLegacyCertificationHistory.mockClear();
  mockGetLearningProfile.mockClear();
  setCourseDetail({ id: "curso-demo", title: "Demo Curso IA", description: "", order: 1, modules: [] });
  mockExamReturn = {
    session: { questions: [] },
    loading: false,
    error: null,
    clearSession: mockClearSession,
    prepare: vi.fn(),
    selectAnswer: vi.fn(),
    goToIndex: vi.fn(),
    evaluateCurrentQuestion: vi.fn(),
    submitExam: vi.fn(),
  };
});

describe("CertificationResultsPage", () => {
  it("muestra un mensaje si no hay resultados", () => {
    mockedLoadResult.mockReturnValue(null);
    renderPage();
    expect(screen.getByText("No hay resultados todavía")).toBeInTheDocument();
  });

  it("muestra 'Resultado de práctica', nunca lenguaje de aprobación oficial", async () => {
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    await waitFor(() => expect(screen.getByText("Resultado de práctica")).toBeInTheDocument());
    expect(screen.queryByText(/estás aprobado|resultado oficial/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No es una predicción de aprobación/)).toBeInTheDocument();
  });

  it("muestra el resumen X/Y correctas/parciales/incorrectas/sin responder", () => {
    mockedLoadResult.mockReturnValue(RESULT);
    const { container } = renderPage();
    expect(container.querySelector(".cert-results-summary__score")?.textContent).toBe("62.5%");
    expect(screen.getByText("2 correctas")).toBeInTheDocument();
    expect(screen.getByText("1 parcialmente correctas")).toBeInTheDocument();
    expect(screen.getByText("1 incorrectas")).toBeInTheDocument();
    expect(screen.getByText("0 sin responder")).toBeInTheDocument();
  });

  it("muestra el desempeño por tópico", () => {
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    expect(screen.getByText("Desempeño por tópico")).toBeInTheDocument();
    expect(screen.getAllByText("topico-demo").length).toBeGreaterThan(0);
  });

  it("muestra el desglose por competencia", () => {
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    expect(screen.getByText("Competencias")).toBeInTheDocument();
    expect(screen.getByText("Identificar componentes")).toBeInTheDocument();
  });

  it("muestra tópicos a reforzar con lenguaje neutral (no 'no dominás esto')", () => {
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    expect(
      screen.getByText("Conviene reforzar este tópico según el resultado de esta práctica.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/no dominás/i)).not.toBeInTheDocument();
  });

  it("'Revisar tópico' navega al aula del tópico correspondiente", () => {
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    const link = screen.getByRole("link", { name: "Revisar tópico →" });
    expect(link).toHaveAttribute("href", "/aula/curso-demo/modulo-demo/topico-demo");
  });

  it("'Revisar respuestas' expande el repaso con pregunta/respuesta/correcta/explicación", () => {
    mockExamReturn.session = {
      questions: [
        {
          bank_id: "a".repeat(64),
          question_id: "Q-001",
          course_id: "curso-demo",
          module_id: "modulo-demo",
          topic_id: "topico-demo",
          question_type: "single_choice",
          question_style: "conceptual",
          stem: "¿Cuál es la opción correcta?",
          options: [{ option_id: "A", text: "A" }],
        },
      ],
    };
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));
    expect(screen.getByText("¿Cuál es la opción correcta?")).toBeInTheDocument();
    expect(screen.getByText("La opción A es correcta según el material.")).toBeInTheDocument();
  });

  it("nunca muestra source_refs al alumno en el repaso", () => {
    mockedLoadResult.mockReturnValue(RESULT);
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Revisar respuestas" }));
    expect(container.innerHTML).not.toMatch(/SRC-\d{3}/);
  });

  it("'Nueva práctica' limpia la sesión y navega a preparación", () => {
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Nueva práctica" }));
    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo");
  });

  it("'Volver al curso' es un link al detalle del curso", () => {
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    expect(screen.getByRole("link", { name: "Volver al curso" })).toHaveAttribute(
      "href",
      "/cursos/curso-demo"
    );
  });
});

// v1.6.0 Bloque 4: panel "Estado después de la verificación" -- usa los
// stores REALES (learningProgressStore/guidedReviewVerification, ambos
// sobre localStorage/sessionStorage), nunca mockeados, para probar la
// derivación real de principio a fin (PARTE 41/42/86, "no mockear
// classification").
describe("CertificationResultsPage — Verification panel (v1.6.0 Bloque 4)", () => {
  it("PASO 86: sin VerificationContext, Certification normal NUNCA muestra el panel", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    renderPage();
    await waitFor(() => expect(screen.getByText("Resultado de práctica")).toBeInTheDocument());
    expect(screen.queryByText("Estado después de la verificación")).not.toBeInTheDocument();
  });

  it("PASO 78: con VerificationContext pero SIN intento nuevo real, no muestra el panel (nunca falso resultado)", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "modulo-demo", topicId: "topico-demo" }],
      null,
      [{ moduleId: "modulo-demo", topicId: "topico-demo", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    // Nunca se registró un nuevo intento real -- Certification pudo
    // abandonarse antes de submit.
    renderPage();
    await waitFor(() => expect(screen.getByText("Resultado de práctica")).toBeInTheDocument());
    expect(screen.queryByText("Estado después de la verificación")).not.toBeInTheDocument();
  });

  it("PASO 79/41: con VerificationContext Y un intento nuevo real, muestra el estado ACTUAL (needs_review -> mastered)", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "modulo-demo", topicId: "topico-demo" }],
      null,
      [{ moduleId: "modulo-demo", topicId: "topico-demo", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    recordCertificationAttempt("curso-demo", highScoreAttempt("att-new"));

    renderPage();
    await waitFor(() => expect(screen.getByText("Estado después de la verificación")).toBeInTheDocument());
    expect(screen.getByText("Tópico Demo")).toBeInTheDocument();
    expect(screen.getByText("Antes: Necesita repaso")).toBeInTheDocument();
    expect(screen.getByText("Ahora: Dominado")).toBeInTheDocument();
    // Nunca afirma causalidad del repaso (PARTE 22).
    expect(screen.queryByText(/el repaso hizo que/i)).not.toBeInTheDocument();
  });

  it("PASO 80: needs_review que sigue needs_review se muestra con normalidad, sin proclamar mejora", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "modulo-demo", topicId: "topico-demo" }],
      null,
      [{ moduleId: "modulo-demo", topicId: "topico-demo", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    recordCertificationAttempt("curso-demo", {
      ...highScoreAttempt("att-new"),
      scorePercentage: 20,
      correctCount: 0,
      incorrectCount: 4,
      performanceByTopic: [
        {
          module_id: "modulo-demo",
          topic_id: "topico-demo",
          attempted: 4,
          correct: 0,
          partially_correct: 0,
          incorrect: 4,
          unanswered: 0,
          practice_score_percent: 20,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("Estado después de la verificación")).toBeInTheDocument());
    // Antes/Ahora coinciden (needs_review): no se muestra la línea "Antes"
    // (el panel solo la muestra cuando el status CAMBIÓ, PARTE 21).
    expect(screen.queryByText(/^Antes:/)).not.toBeInTheDocument();
    expect(screen.getByText("Ahora: Necesita repaso")).toBeInTheDocument();
  });

  it("PASO 29/89: 'Volver a Mi aprendizaje' limpia el contexto de verificación y navega", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "modulo-demo", topicId: "topico-demo" }],
      null,
      [{ moduleId: "modulo-demo", topicId: "topico-demo", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    recordCertificationAttempt("curso-demo", highScoreAttempt("att-new"));

    renderPage();
    await waitFor(() => expect(screen.getByText("Estado después de la verificación")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Volver a Mi aprendizaje" }));
    expect(mockNavigate).toHaveBeenCalledWith("/mi-aprendizaje");
    expect(loadGuidedReviewVerificationContext("curso-demo")).toBeNull();
  });

  it("PASO 31: 'Nueva práctica' también limpia un contexto de verificación previo", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "modulo-demo", topicId: "topico-demo" }],
      null,
      [{ moduleId: "modulo-demo", topicId: "topico-demo", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    recordCertificationAttempt("curso-demo", highScoreAttempt("att-new"));

    renderPage();
    await waitFor(() => expect(screen.getByText("Estado después de la verificación")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Nueva práctica" }));
    expect(loadGuidedReviewVerificationContext("curso-demo")).toBeNull();
  });

  it("PASO 32/88: refresh (nuevo render) con contexto todavía válido recupera el panel", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "modulo-demo", topicId: "topico-demo" }],
      null,
      [{ moduleId: "modulo-demo", topicId: "topico-demo", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    recordCertificationAttempt("curso-demo", highScoreAttempt("att-new"));

    renderPage();
    await waitFor(() => expect(screen.getByText("Estado después de la verificación")).toBeInTheDocument());

    // Simula un refresh real: nuevo montaje del componente (sessionStorage
    // sobrevive, a diferencia de un React state en memoria).
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Estado después de la verificación").length).toBeGreaterThan(0));
  });
});

// v1.7.0 Bloque 5: el panel "Estado después de la verificación" usa el
// Learning Profile server-side FRESCO (PASO 42/49-51), nunca
// `deriveCourseLearningStates`. Prueba explícita de que el panel obedece
// al API incluso cuando contradice lo que la evidencia cruda de
// Certification History sugeriría si la página todavía derivara
// client-side.
describe("CertificationResultsPage — v1.7.0 Bloque 5 (Frontend Learning Profile Cutover)", () => {
  it("el panel 'Ahora' obedece EXACTAMENTE el Learning Profile API, aunque contradiga la evidencia cruda de Certification History", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "modulo-demo", topicId: "topico-demo" }],
      null,
      [{ moduleId: "modulo-demo", topicId: "topico-demo", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    // Evidencia cruda de Certification History: score BAJO (si la página
    // derivara client-side, "Ahora" mostraría needs_review).
    recordCertificationAttempt("curso-demo", {
      ...highScoreAttempt("att-new"),
      scorePercentage: 10,
      correctCount: 0,
      incorrectCount: 4,
      performanceByTopic: [
        {
          module_id: "modulo-demo", topic_id: "topico-demo", attempted: 4, correct: 0,
          partially_correct: 0, incorrect: 4, unanswered: 0, practice_score_percent: 10,
        },
      ],
    });
    // El fake Learning Profile se fuerza directamente a "mastered" --
    // contradice deliberadamente la evidencia cruda de arriba.
    mockGetLearningProfile.mockResolvedValue({
      course_id: "curso-demo",
      summary: { total_topics: 1, not_started: 0, progressing: 0, needs_review: 0, mastered: 1 },
      topics: [
        {
          module_id: "modulo-demo", topic_id: "topico-demo", module_title: "Módulo Demo", topic_title: "Tópico Demo",
          curricular_status: "completed", learning_status: "mastered",
          reason_code: "HIGH_CERTIFICATION_SCORE", recent_average: 99, observation_count: 1,
        },
      ],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("Estado después de la verificación")).toBeInTheDocument());
    expect(screen.getByText("Ahora: Dominado")).toBeInTheDocument();
    expect(screen.queryByText("Ahora: Necesita repaso")).not.toBeInTheDocument();
  });

  it("si el Learning Profile API falla, el panel de verificación no se muestra (nunca deriva un 'Ahora' falso localmente)", async () => {
    setCourseDetail(COURSE_WITH_TOPIC);
    mockedLoadResult.mockReturnValue(RESULT);
    startGuidedReviewVerification(
      "curso-demo",
      [{ moduleId: "modulo-demo", topicId: "topico-demo" }],
      null,
      [{ moduleId: "modulo-demo", topicId: "topico-demo", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" }]
    );
    recordCertificationAttempt("curso-demo", highScoreAttempt("att-new"));
    mockGetLearningProfile.mockRejectedValue(new Error("network"));

    renderPage();
    await waitFor(() => expect(screen.getByText("Resultado de práctica")).toBeInTheDocument());
    expect(screen.queryByText("Estado después de la verificación")).not.toBeInTheDocument();
  });
});
