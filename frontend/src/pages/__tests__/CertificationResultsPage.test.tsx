import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { getCourse: vi.fn().mockResolvedValue({ id: "curso-demo", title: "Demo Curso IA", description: "", order: 1, modules: [] }) },
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
import { CertificationResultsPage } from "../CertificationResultsPage";

const mockedLoadResult = loadCertificationResult as unknown as ReturnType<typeof vi.fn>;

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

beforeEach(() => {
  mockedLoadResult.mockReset();
  mockClearSession.mockReset();
  mockNavigate.mockReset();
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
