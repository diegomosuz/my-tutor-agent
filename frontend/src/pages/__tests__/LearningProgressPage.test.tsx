import { render, screen, waitFor } from "@testing-library/react";
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

import { api } from "../../api/client";
import { LearningProgressPage } from "../LearningProgressPage";
import { markTopicCompleted, markTopicStarted } from "../../learning/learningProgressStore";

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

beforeEach(() => {
  window.localStorage.clear();
  mockedGetCourses.mockReset();
  mockedGetCourse.mockReset();
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

  it("con progreso real, muestra el porcentaje y el botón Continuar", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText(/tópicos completados/)).toBeInTheDocument());
    expect(screen.getByText("Continuar aprendiendo")).toBeInTheDocument();
    expect(screen.getByText("Continuar")).toBeInTheDocument();
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
});
