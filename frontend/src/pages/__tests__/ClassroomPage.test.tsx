import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_INFO, SAMPLE_LESSON } from "../../classroom/__tests__/fixtures";

const mockGetCourse = vi.fn();
const mockGetTopic = vi.fn();
const mockGenerateLesson = vi.fn();
const mockGetSystemStatus = vi.fn();
const mockGetAiStatus = vi.fn();

vi.mock("../../api/client", () => ({
  api: {
    getCourse: (...args: unknown[]) => mockGetCourse(...args),
    getTopic: (...args: unknown[]) => mockGetTopic(...args),
    generateLesson: (...args: unknown[]) => mockGenerateLesson(...args),
    getSystemStatus: (...args: unknown[]) => mockGetSystemStatus(...args),
    getAiStatus: (...args: unknown[]) => mockGetAiStatus(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { ClassroomPage } from "../ClassroomPage";

const COURSE = {
  id: "curso-demo",
  title: "Curso demo",
  description: "",
  order: 1,
  modules: [
    {
      id: "modulo-demo",
      title: "Módulo demo",
      order: 1,
      topics: [{ id: "topico-demo", title: "Tópico demo", order: 1 }],
    },
  ],
};

const TOPIC_RESPONSE = {
  course: { id: "curso-demo", title: "Curso demo", description: "", order: 1 },
  module: COURSE.modules[0],
  topic: { id: "topico-demo", title: "Tópico demo", order: 1 },
  metadata: { title: "Tópico demo", order: 1 },
  content_markdown: "# Tópico demo",
  canonical: CANONICAL_INFO,
};

function renderPage(entry = "/aula/curso-demo/modulo-demo/topico-demo") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/aula/:courseId/:moduleId/:topicId" element={<ClassroomPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockGetCourse.mockReset().mockResolvedValue(COURSE);
  mockGetTopic.mockReset().mockResolvedValue(TOPIC_RESPONSE);
  mockGenerateLesson.mockReset();
  mockGetSystemStatus.mockReset().mockResolvedValue({
    app_version: "1.1.0",
    backend: "ok",
    courses: { count: 1, diagnostics: "ok" },
    llm: { provider: "openai", model: "", configured: false, prompt_version: "", certification_prompt_version: "" },
    voice: { provider: "browser", neural_configured: false, tts_model: "gpt-4o-mini-tts" },
    cache_writable: true,
  });
  mockGetAiStatus.mockReset().mockResolvedValue({
    provider: "openai",
    model: "gpt-4o-mini",
    configured: true,
    prompt_version: "lesson-v2",
  });
  try {
    window.localStorage.clear();
  } catch {
    // ignorar
  }
});

describe("ClassroomPage — v1.1.0 UX de doble submit y mensajes de espera", () => {
  it("doble click en 'Preparar clase con IA' llama a generateLesson() una sola vez", async () => {
    let resolveGeneration: (plan: typeof SAMPLE_LESSON) => void = () => {};
    mockGenerateLesson.mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );

    renderPage();

    const button = await screen.findByRole("button", { name: /Preparar clase con IA/ });
    fireEvent.click(button);
    fireEvent.click(button); // segundo click mientras la primera request está pendiente
    fireEvent.click(button);

    expect(mockGenerateLesson).toHaveBeenCalledTimes(1);

    resolveGeneration(SAMPLE_LESSON);
    await waitFor(() => expect(screen.getByText("Introducción a Kubernetes")).toBeInTheDocument());
  });

  it("muestra el mensaje inicial de espera mientras genera la clase, sin porcentaje inventado", async () => {
    mockGenerateLesson.mockReturnValue(new Promise(() => {})); // nunca resuelve en este test
    renderPage();

    const button = await screen.findByRole("button", { name: /Preparar clase con IA/ });
    fireEvent.click(button);

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Preparando clase…");
    expect(status.textContent).not.toMatch(/%|\d+\s*(de|\/)\s*\d+/);
  });

  it("tras un error, el botón vuelve a estar disponible (no queda deshabilitado para siempre)", async () => {
    mockGenerateLesson.mockRejectedValueOnce(new Error("fallo de red"));
    renderPage();

    const button = await screen.findByRole("button", { name: /Preparar clase con IA/ });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Reintentar")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Reintentar"));
    expect(mockGenerateLesson).toHaveBeenCalledTimes(2);
  });

  // v1.1.0 (adaptación pedagógica, PARTE 15): modo repaso puramente visual.
  it("con ?review=true muestra el badge 'Repaso' sin generar una LessonPlan distinta", async () => {
    mockGenerateLesson.mockResolvedValue(SAMPLE_LESSON);
    renderPage("/aula/curso-demo/modulo-demo/topico-demo?review=true");

    const button = await screen.findByRole("button", { name: /Preparar clase con IA/ });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Introducción a Kubernetes")).toBeInTheDocument());
    expect(screen.getByText("Repaso")).toBeInTheDocument();
    expect(mockGenerateLesson).toHaveBeenCalledWith("curso-demo", "modulo-demo", "topico-demo", false);
  });

  it("sin ?review=true nunca muestra el badge 'Repaso'", async () => {
    mockGenerateLesson.mockResolvedValue(SAMPLE_LESSON);
    renderPage();

    const button = await screen.findByRole("button", { name: /Preparar clase con IA/ });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Introducción a Kubernetes")).toBeInTheDocument());
    expect(screen.queryByText("Repaso")).not.toBeInTheDocument();
  });
});
