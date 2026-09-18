import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    getCourse: vi.fn().mockResolvedValue(null),
    getSystemStatus: vi.fn().mockResolvedValue({
      app_version: "0.7.0",
      backend: "ok",
      courses: { count: 1, diagnostics: "ok" },
      llm: { provider: "pwc", model: "", configured: false, prompt_version: "", certification_prompt_version: "" },
      voice: { provider: "browser", neural_configured: false, tts_model: "gpt-4o-mini-tts" },
      cache_writable: true,
    }),
  },
}));

const mockSelectAnswer = vi.fn();
const mockGoToIndex = vi.fn();
const mockSubmitExam = vi.fn();

let mockExamReturn: any; // eslint-disable-line @typescript-eslint/no-explicit-any

vi.mock("../../certification/useCertificationExam", () => ({
  useCertificationExam: vi.fn(() => mockExamReturn),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { CertificationSimulationPage } from "../CertificationSimulationPage";

const QUESTION_1 = {
  bank_id: "a".repeat(64),
  question_id: "Q-001",
  course_id: "curso-demo",
  module_id: "modulo-demo",
  topic_id: "topico-demo",
  question_type: "single_choice" as const,
  question_style: "conceptual" as const,
  stem: "¿Pregunta 1?",
  options: [
    { option_id: "A", text: "Opción A" },
    { option_id: "B", text: "Opción B" },
  ],
};
const QUESTION_2 = { ...QUESTION_1, question_id: "Q-002", stem: "¿Pregunta 2?" };

function baseSession(overrides: Partial<any> = {}) {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    practiceId: "practice-1",
    courseId: "curso-demo",
    mode: "simulation",
    requestedCount: 2,
    actualCount: 2,
    questions: [QUESTION_1, QUESTION_2],
    currentIndex: 0,
    selections: {},
    evaluations: {},
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/certificacion/curso-demo/simulacro"]}>
      <Routes>
        <Route path="/certificacion/:courseId/simulacro" element={<CertificationSimulationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockSelectAnswer.mockReset();
  mockGoToIndex.mockReset();
  mockSubmitExam.mockReset();
  mockNavigate.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mockExamReturn = {
    session: baseSession(),
    loading: false,
    error: null,
    selectAnswer: mockSelectAnswer,
    goToIndex: mockGoToIndex,
    evaluateCurrentQuestion: vi.fn(),
    submitExam: mockSubmitExam,
    clearSession: vi.fn(),
    prepare: vi.fn(),
  };
});

afterEach(() => {
  (window.confirm as ReturnType<typeof vi.fn>).mockRestore?.();
});

describe("CertificationSimulationPage", () => {
  it("muestra un mensaje si no hay un simulacro en curso", () => {
    mockExamReturn = { ...mockExamReturn, session: null };
    renderPage();
    expect(screen.getByText("No hay un simulacro en curso")).toBeInTheDocument();
  });

  it("una sesión con 0 preguntas muestra un estado vacío, nunca rompe la página (Fase 8, sección 28)", () => {
    mockExamReturn = { ...mockExamReturn, session: baseSession({ questions: [] }) };
    renderPage();
    expect(screen.getByText("No hay preguntas en este simulacro")).toBeInTheDocument();
  });

  it("renderiza la pregunta actual SIN feedback", () => {
    renderPage();
    expect(screen.getByText("¿Pregunta 1?")).toBeInTheDocument();
    expect(screen.queryByText(/Correcta|Incorrecta/)).not.toBeInTheDocument();
  });

  it("seleccionar una opción llama a selectAnswer()", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText(/Opción B/));
    expect(mockSelectAnswer).toHaveBeenCalledWith("Q-001", ["B"]);
  });

  it("Anterior/Siguiente navegan libremente sin evaluar", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(mockGoToIndex).toHaveBeenCalledWith(1);
  });

  it("muestra contador de respondidas/pendientes", () => {
    mockExamReturn.session = baseSession({ selections: { "Q-001": ["A"] } });
    renderPage();
    expect(screen.getByText(/1 respondidas/)).toBeInTheDocument();
    expect(screen.getByText(/1 pendientes/)).toBeInTheDocument();
  });

  it("muestra 'Sin límite de tiempo configurado', nunca una duración inventada", () => {
    renderPage();
    expect(screen.getByText(/Sin límite de tiempo configurado/)).toBeInTheDocument();
  });

  it("en la última pregunta, el botón dice 'Entregar simulacro'", () => {
    mockExamReturn.session = baseSession({ currentIndex: 1 });
    renderPage();
    expect(screen.getByRole("button", { name: /Entregar simulacro/ })).toBeInTheDocument();
  });

  it("entregar con preguntas sin responder pide confirmación", async () => {
    mockSubmitExam.mockResolvedValue({ total_questions: 2 });
    mockExamReturn.session = baseSession({ currentIndex: 1, selections: {} });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Entregar simulacro/ }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("2 preguntas sin responder"));
    await waitFor(() => expect(mockSubmitExam).toHaveBeenCalledTimes(1));
  });

  it("si se cancela la confirmación, no se entrega", () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockExamReturn.session = baseSession({ currentIndex: 1, selections: {} });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Entregar simulacro/ }));
    expect(mockSubmitExam).not.toHaveBeenCalled();
  });

  it("entregar con todas respondidas navega directo a resultados sin confirmar", async () => {
    mockSubmitExam.mockResolvedValue({ total_questions: 2 });
    mockExamReturn.session = baseSession({
      currentIndex: 1,
      selections: { "Q-001": ["A"], "Q-002": ["A"] },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Entregar simulacro/ }));
    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo/resultados")
    );
  });

  it("los puntos de navegación permiten saltar a cualquier pregunta", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Ir a la pregunta 2"));
    expect(mockGoToIndex).toHaveBeenCalledWith(1);
  });
});
