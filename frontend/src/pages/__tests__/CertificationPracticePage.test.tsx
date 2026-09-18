import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { getCourse: vi.fn().mockResolvedValue(null) },
}));

const mockSelectAnswer = vi.fn();
const mockGoToIndex = vi.fn();
const mockEvaluateCurrentQuestion = vi.fn();
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

import { CertificationPracticePage } from "../CertificationPracticePage";

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
    mode: "practice",
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
    <MemoryRouter initialEntries={["/certificacion/curso-demo/practica"]}>
      <Routes>
        <Route path="/certificacion/:courseId/practica" element={<CertificationPracticePage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockSelectAnswer.mockReset();
  mockGoToIndex.mockReset();
  mockEvaluateCurrentQuestion.mockReset();
  mockSubmitExam.mockReset();
  mockNavigate.mockReset();
  mockExamReturn = {
    session: baseSession(),
    loading: false,
    error: null,
    selectAnswer: mockSelectAnswer,
    goToIndex: mockGoToIndex,
    evaluateCurrentQuestion: mockEvaluateCurrentQuestion,
    submitExam: mockSubmitExam,
    clearSession: vi.fn(),
    prepare: vi.fn(),
  };
});

describe("CertificationPracticePage", () => {
  it("muestra un mensaje si no hay una práctica en curso", () => {
    mockExamReturn = { ...mockExamReturn, session: null };
    renderPage();
    expect(screen.getByText("No hay una práctica en curso")).toBeInTheDocument();
  });

  it("renderiza la pregunta actual", () => {
    renderPage();
    expect(screen.getByText("¿Pregunta 1?")).toBeInTheDocument();
    expect(screen.getByText("Pregunta 1 de 2")).toBeInTheDocument();
  });

  it("nunca muestra el answer key antes de comprobar", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/certificacion/curso-demo/practica"]}>
        <Routes>
          <Route path="/certificacion/:courseId/practica" element={<CertificationPracticePage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(container.innerHTML).not.toMatch(/correct_option_ids|Correcta|Incorrecta/);
  });

  it("seleccionar una opción llama a selectAnswer()", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText(/Opción A/));
    expect(mockSelectAnswer).toHaveBeenCalledWith("Q-001", ["A"]);
  });

  it("el botón Comprobar está deshabilitado sin selección", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Comprobar" })).toBeDisabled();
  });

  it("Comprobar llama a evaluateCurrentQuestion()", () => {
    mockExamReturn.session = baseSession({ selections: { "Q-001": ["A"] } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));
    expect(mockEvaluateCurrentQuestion).toHaveBeenCalledTimes(1);
  });

  it("muestra feedback grounded tras evaluar, y bloquea la pregunta", () => {
    mockExamReturn.session = baseSession({
      selections: { "Q-001": ["A"] },
      evaluations: {
        "Q-001": {
          bank_id: "a".repeat(64),
          question_id: "Q-001",
          module_id: "modulo-demo",
          topic_id: "topico-demo",
          question_type: "single_choice",
          selected_option_ids: ["A"],
          verdict: "correct",
          correct_option_ids: ["A"],
          explanation: [{ text: "Explicación grounded.", source_refs: ["SRC-001"] }],
          competency: { text: "Comp", source_refs: ["SRC-001"] },
        },
      },
    });
    renderPage();
    expect(screen.getByText("Correcta")).toBeInTheDocument();
    expect(screen.getByText("Explicación grounded.")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    radios.forEach((r) => expect(r).toBeDisabled());
    expect(screen.getByRole("button", { name: "Siguiente pregunta →" })).toBeInTheDocument();
  });

  it("Siguiente pregunta avanza el índice", () => {
    mockExamReturn.session = baseSession({
      selections: { "Q-001": ["A"] },
      evaluations: {
        "Q-001": {
          bank_id: "a".repeat(64),
          question_id: "Q-001",
          module_id: "m",
          topic_id: "t",
          question_type: "single_choice",
          selected_option_ids: ["A"],
          verdict: "correct",
          correct_option_ids: ["A"],
          explanation: [{ text: "Ok.", source_refs: ["SRC-001"] }],
          competency: { text: "Comp", source_refs: ["SRC-001"] },
        },
      },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente pregunta →" }));
    expect(mockGoToIndex).toHaveBeenCalledWith(1);
  });

  it("en la última pregunta evaluada, el botón dice 'Ver resultados' y llama a submitExam", async () => {
    mockSubmitExam.mockResolvedValue({ total_questions: 2 });
    mockExamReturn.session = baseSession({
      currentIndex: 1,
      selections: { "Q-002": ["A"] },
      evaluations: {
        "Q-002": {
          bank_id: "a".repeat(64),
          question_id: "Q-002",
          module_id: "m",
          topic_id: "t",
          question_type: "single_choice",
          selected_option_ids: ["A"],
          verdict: "correct",
          correct_option_ids: ["A"],
          explanation: [{ text: "Ok.", source_refs: ["SRC-001"] }],
          competency: { text: "Comp", source_refs: ["SRC-001"] },
        },
      },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Ver resultados" }));
    await waitFor(() => expect(mockSubmitExam).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo/resultados")
    );
  });

  it("Anterior está deshabilitado en la primera pregunta", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "← Anterior" })).toBeDisabled();
  });
});
