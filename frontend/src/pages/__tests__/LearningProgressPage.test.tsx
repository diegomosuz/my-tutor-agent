import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { getCourses: vi.fn(), getCourse: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from "../../api/client";
import { LearningProgressPage } from "../LearningProgressPage";
import {
  markTopicCompleted,
  markTopicStarted,
  recordCertificationAttempt,
} from "../../learning/learningProgressStore";
import type { CertificationAttemptSummary } from "../../learning/types";

const mockedGetCourses = api.getCourses as unknown as ReturnType<typeof vi.fn>;
const mockedGetCourse = api.getCourse as unknown as ReturnType<typeof vi.fn>;

const COURSE_SUMMARY = {
  id: "curso-demo",
  title: "Curso Demo",
  description: "",
  order: 1,
  module_count: 1,
  topic_count: 2,
};

const COURSE_DETAIL = {
  id: "curso-demo",
  title: "Curso Demo",
  description: "",
  order: 1,
  modules: [
    {
      id: "modulo-1",
      title: "Módulo 1",
      order: 1,
      topics: [
        { id: "topico-1", title: "Tópico 1", order: 1 },
        { id: "topico-2", title: "Tópico 2", order: 2 },
      ],
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <LearningProgressPage />
    </MemoryRouter>
  );
}

function attempt(overrides: Partial<CertificationAttemptSummary> = {}): CertificationAttemptSummary {
  return {
    attemptId: "attempt-1",
    courseId: "curso-demo",
    mode: "practice",
    moduleIds: ["modulo-1"],
    topicIds: ["topico-1"],
    questionCount: 5,
    answeredCount: 5,
    correctCount: 1,
    partialCount: 0,
    incorrectCount: 4,
    unansweredCount: 0,
    scorePercentage: 20,
    completedAt: "2026-01-01T00:00:00.000Z",
    performanceByTopic: [
      { module_id: "modulo-1", topic_id: "topico-1", attempted: 5, correct: 1, partially_correct: 0, incorrect: 4, unanswered: 0, practice_score_percent: 20 },
    ],
    competenciesToReinforce: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mockedGetCourses.mockReset();
  mockedGetCourse.mockReset();
  mockNavigate.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("LearningProgressPage", () => {
  // A. nuevo usuario: 0 progreso y empty states correctos.
  it("A: curso nunca iniciado muestra el mensaje de progreso vacío, nunca NaN/undefined", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getByText("Tu progreso aparecerá acá cuando empieces a estudiar.")).toBeInTheDocument()
    );
    expect(container.textContent).not.toMatch(/NaN|undefined|Invalid Date/);
  });

  it("sin prácticas ni simulacros muestra los mensajes vacíos correspondientes", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Aún no realizaste prácticas.")).toBeInTheDocument());
    expect(screen.getByText("Aún no realizaste simulacros.")).toBeInTheDocument();
  });

  it("sin cursos publicados muestra el estado vacío correspondiente", async () => {
    mockedGetCourses.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Todavía no hay cursos publicados")).toBeInTheDocument()
    );
  });

  it("con progreso real, muestra el porcentaje y la recomendación de Continuar", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText(/tópicos completados/)).toBeInTheDocument());
    expect(screen.getByText("Recomendado para vos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
    expect(screen.getByText("Dejaste este tópico en progreso.")).toBeInTheDocument();
  });

  it("con el curso completo, muestra 'Curso completado' y nunca el botón Continuar", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    markTopicCompleted("curso-demo", "modulo-1", "topico-2");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Curso completado")).toBeInTheDocument());
    expect(screen.queryByText("Continuar")).not.toBeInTheDocument();
  });

  it("con más de un curso, muestra el selector de curso", async () => {
    mockedGetCourses.mockResolvedValue([
      COURSE_SUMMARY,
      { ...COURSE_SUMMARY, id: "curso-otro", title: "Otro Curso" },
    ]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Curso")).toBeInTheDocument());
  });

  it("con un solo curso, nunca muestra el selector", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Tu progreso aparecerá acá cuando empieces a estudiar.")).toBeInTheDocument()
    );
    expect(screen.queryByLabelText("Curso")).not.toBeInTheDocument();
  });

  it("lista módulos y tópicos con su estado, cada tópico es un link al aula", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Tópico 1")).toBeInTheDocument());
    const link = screen.getByText("Tópico 1").closest("a");
    expect(link).toHaveAttribute("href", "/aula/curso-demo/modulo-1/topico-1");
  });

  // -------------------------------------------------------------------
  // v1.1.0 — adaptación pedagógica (PARTE 26)
  // -------------------------------------------------------------------

  it("Continuar navega al tópico correspondiente", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-1");
  });

  it("Revisar tema navega al tópico débil con ?review=true", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    recordCertificationAttempt("curso-demo", attempt());
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar tema" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Revisar tema" }));
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-1?review=true");
  });

  it("Iniciar práctica abre la preparación de certificación con los tópicos correctos", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    markTopicStarted("curso-demo", "modulo-1", "topico-2");
    recordCertificationAttempt("curso-demo", attempt());
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar práctica" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Iniciar práctica" }));
    expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo?mode=practice&topics=topico-1");
  });

  it("el motivo de la recomendación es siempre visible, con datos reales, nunca 'la IA recomienda'", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Dejaste este tópico en progreso.")).toBeInTheDocument());
    expect(container.textContent?.toLowerCase()).not.toContain("la ia recomienda");
  });

  it("'¿Por qué?' expande datos observados reales", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    recordCertificationAttempt("curso-demo", attempt());
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getAllByText("¿Por qué?").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("¿Por qué?")[0]);
    const whyData = container.querySelector(".learning-recommendation__why-data");
    expect(whyData).not.toBeNull();
    expect(whyData?.textContent).toContain("Último resultado");
    expect(whyData?.textContent).toContain("20%");
  });

  it("nunca usa lenguaje de predicción/certificación oficial ni gamificación en la página completa", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    markTopicCompleted("curso-demo", "modulo-1", "topico-2");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Curso completado")).toBeInTheDocument());
    const text = container.textContent?.toLowerCase() ?? "";
    for (const banned of ["listo para certificarte", "probabilidad", "nivel de dominio", "xp", "racha", "streak"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("aislamiento multi-curso: un resultado débil en otro curso no genera recomendación de refuerzo acá", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    recordCertificationAttempt("otro-curso", attempt({ courseId: "otro-curso" }));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Recomendado para vos")).toBeInTheDocument());
    expect(screen.queryByText("Reforzar")).not.toBeInTheDocument();
    expect(screen.queryByText("Practicar")).not.toBeInTheDocument();
  });
});
