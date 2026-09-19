import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_INFO, SAMPLE_LESSON } from "../../classroom/__tests__/fixtures";
import type { LessonPlan, LessonScene } from "../../types/api";
import {
  getCourseLearningProgress,
} from "../../learning/learningProgressStore";
import { ApiError } from "../../api/client";

const mockGetCourse = vi.fn();
const mockGetTopic = vi.fn();
const mockGenerateLesson = vi.fn();
const mockGetSystemStatus = vi.fn();
const mockGetAiStatus = vi.fn();
const mockAskTutor = vi.fn();
const mockEvaluateCheckpoint = vi.fn();

vi.mock("../../api/client", () => ({
  api: {
    getCourse: (...args: unknown[]) => mockGetCourse(...args),
    getTopic: (...args: unknown[]) => mockGetTopic(...args),
    generateLesson: (...args: unknown[]) => mockGenerateLesson(...args),
    getSystemStatus: (...args: unknown[]) => mockGetSystemStatus(...args),
    getAiStatus: (...args: unknown[]) => mockGetAiStatus(...args),
    askTutor: (...args: unknown[]) => mockAskTutor(...args),
    evaluateCheckpoint: (...args: unknown[]) => mockEvaluateCheckpoint(...args),
  },
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

function groundedText(text: string, refs: string[] = ["SRC-001"]) {
  return { text, source_refs: refs };
}

// Lección de un solo escena con comprehension_check, para probar el
// Checkpoint sin depender de SAMPLE_LESSON (que nunca trae interaction).
function checkpointLesson(): LessonPlan {
  const scene: LessonScene = {
    scene_id: "SCENE-001",
    scene_type: "checkpoint",
    title: groundedText("Verificación"),
    key_points: [groundedText("Punto clave", ["SRC-002"])],
    narration: [groundedText("Repasemos lo visto.", ["SRC-002"])],
    visual: {
      visual_type: "bullets",
      layout_hint: "default",
      source_refs: ["SRC-002"],
      description: "",
      emphasis: "neutral",
      process_steps: [],
      comparison: null,
      nodes: [],
      edges: [],
    },
    interaction: {
      interaction_type: "comprehension_check",
      question: groundedText("¿Qué es un Pod?", ["SRC-002"]),
      expected_answer: groundedText("SECRETO_NUNCA_VISIBLE", ["SRC-002"]),
    },
  };
  return { ...SAMPLE_LESSON, scenes: [scene] };
}

function renderPage(entry = "/aula/curso-demo/modulo-demo/topico-demo") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/aula/:courseId/:moduleId/:topicId" element={<ClassroomPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function renderWithLesson(lesson: LessonPlan = SAMPLE_LESSON, entry?: string) {
  mockGenerateLesson.mockResolvedValue(lesson);
  const utils = renderPage(entry);
  const button = await screen.findByRole("button", { name: /Preparar clase con IA/ });
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByText(lesson.lesson_title.text)).toBeInTheDocument());
  return utils;
}

beforeEach(() => {
  mockGetCourse.mockReset().mockResolvedValue(COURSE);
  mockGetTopic.mockReset().mockResolvedValue(TOPIC_RESPONSE);
  mockGenerateLesson.mockReset();
  mockAskTutor.mockReset();
  mockEvaluateCheckpoint.mockReset();
  mockNavigate.mockReset();
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

// -------------------------------------------------------------------
// v1.1.1 — reorganización de navegación del aula (UX de layout, sin
// tocar ClassroomEngine/TutorService/Checkpoint/Learning Progress).
// -------------------------------------------------------------------
describe("ClassroomPage — v1.1.1 navegación del aula", () => {
  it("A: los controles de escena aparecen inmediatamente después del área visual", async () => {
    const { container } = await renderWithLesson();

    const stage = container.querySelector(".classroom-stage");
    expect(stage).not.toBeNull();
    const children = Array.from(stage!.children).map((el) => el.className);

    const slideIndex = children.findIndex((c) => c.includes("slide-panel"));
    const controlsIndex = children.findIndex((c) => c.includes("scene-controls"));
    const tutorIndex = children.findIndex((c) => c.includes("tutor-panel"));

    expect(slideIndex).toBeGreaterThanOrEqual(0);
    expect(controlsIndex).toBeGreaterThan(slideIndex);
    // El toolbar de escena precede al tutor: Slide -> Controles -> Tutor.
    expect(tutorIndex).toBeGreaterThan(controlsIndex);
  });

  it("B: 'Salir de la clase' NO forma parte del toolbar de controles de la escena", async () => {
    await renderWithLesson();

    const toolbar = screen.getByRole("group", { name: "Controles de la escena" });
    expect(within(toolbar).queryByText("Salir de la clase")).not.toBeInTheDocument();
  });

  it("C: 'Salir de la clase' está disponible en el header y navega fuera del aula", async () => {
    await renderWithLesson();

    const exitButton = screen.getByRole("button", { name: "Salir de la clase" });
    fireEvent.click(exitButton);
    expect(mockNavigate).toHaveBeenCalledWith("/cursos/curso-demo");
  });

  it("D: Previo funciona (retrocede de escena 2 a escena 1)", async () => {
    await renderWithLesson();

    fireEvent.click(screen.getByRole("button", { name: /Siguiente escena o tópico/ }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Escena o tópico anterior" }));
    await waitFor(() => expect(screen.getByText("Introducción")).toBeInTheDocument());
  });

  it("E: Siguiente funciona (avanza de escena 1 a escena 2)", async () => {
    await renderWithLesson();

    fireEvent.click(screen.getByRole("button", { name: /Siguiente escena o tópico/ }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
  });

  it("F: Pause/Resume alterna correctamente con un único control", async () => {
    await renderWithLesson();

    const pauseButton = screen.getByRole("button", { name: "Pausar clase" });
    fireEvent.click(pauseButton);

    const resumeButton = await screen.findByRole("button", { name: "Reanudar clase" });
    expect(screen.queryByRole("button", { name: "Pausar clase" })).not.toBeInTheDocument();

    fireEvent.click(resumeButton);
    expect(await screen.findByRole("button", { name: "Pausar clase" })).toBeInTheDocument();
  });

  it("G: Repetir funciona (permanece en la misma escena)", async () => {
    await renderWithLesson();

    fireEvent.click(screen.getByRole("button", { name: "Repetir escena actual" }));
    // repeatScene() nunca cambia de escena, solo reinicia narración/animación.
    expect(screen.getByText("Introducción")).toBeInTheDocument();
  });

  it("H: Activar/Desactivar voz funciona", async () => {
    mockGetSystemStatus.mockResolvedValue({
      app_version: "1.1.0",
      backend: "ok",
      courses: { count: 1, diagnostics: "ok" },
      llm: { provider: "openai", model: "", configured: false, prompt_version: "", certification_prompt_version: "" },
      voice: { provider: "auto", neural_configured: true, tts_model: "gpt-4o-mini-tts" },
      cache_writable: true,
    });
    await renderWithLesson();

    const voiceButton = await screen.findByRole("button", { name: "Activar voz" });
    fireEvent.click(voiceButton);
    expect(await screen.findByRole("button", { name: "Desactivar voz" })).toBeInTheDocument();
  });

  it("I: el estado disabled de Previo/Siguiente sigue siendo correcto en los extremos", async () => {
    await renderWithLesson();

    expect(screen.getByRole("button", { name: "Escena o tópico anterior" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Siguiente escena o tópico/ }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Siguiente escena o tópico/ }));
    await waitFor(() => expect(screen.getByText("Resumen")).toBeInTheDocument());

    // Última escena: "Siguiente" pasa a "Finalizar" y sigue habilitado.
    const finishButton = screen.getByRole("button", { name: "Finalizar tema" });
    expect(finishButton).not.toBeDisabled();
    fireEvent.click(finishButton);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Finalizar tema" })).toBeDisabled()
    );
  });

  it("J: el tutor sigue operativo (pregunta cubierta) dentro del nuevo layout", async () => {
    mockAskTutor.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [groundedText("Un Pod es la unidad mínima de despliegue.", ["SRC-002"])],
      clarification_question: null,
    });
    await renderWithLesson();

    const input = screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…");
    fireEvent.change(input, { target: { value: "¿Qué es un Pod?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(screen.getByText("Un Pod es la unidad mínima de despliegue.")).toBeInTheDocument()
    );
    expect(mockAskTutor).toHaveBeenCalledTimes(1);
  });

  it("K: Learning Progress sigue registrando completion al terminar el tema", async () => {
    await renderWithLesson();

    fireEvent.click(screen.getByRole("button", { name: /Siguiente escena o tópico/ }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Siguiente escena o tópico/ }));
    await waitFor(() => expect(screen.getByText("Resumen")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Finalizar tema" }));

    await waitFor(() => {
      const progress = getCourseLearningProgress("curso-demo");
      expect(progress?.topics["modulo-demo:topico-demo"]?.status).toBe("completed");
    });
  });

  it("L: el Checkpoint no se rompe con el nuevo layout (responder y ver feedback)", async () => {
    mockEvaluateCheckpoint.mockResolvedValue({
      verdict: "correct",
      feedback: [groundedText("¡Correcto! Un Pod agrupa uno o más contenedores.", ["SRC-002"])],
      ideal_answer: null,
    });
    await renderWithLesson(checkpointLesson());

    const answerInput = screen.getByPlaceholderText(/tu respuesta/i);
    fireEvent.change(answerInput, { target: { value: "Es la unidad mínima de Kubernetes." } });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() =>
      expect(screen.getByText("¡Correcto! Un Pod agrupa uno o más contenedores.")).toBeInTheDocument()
    );
    expect(mockEvaluateCheckpoint).toHaveBeenCalledTimes(1);
    // El expected_answer NUNCA debe llegar a pantalla.
    expect(screen.queryByText("SECRETO_NUNCA_VISIBLE")).not.toBeInTheDocument();
  });

  it("M: navegar entre escenas no introduce requests duplicados de curso/tópico/lección", async () => {
    await renderWithLesson();

    fireEvent.click(screen.getByRole("button", { name: /Siguiente escena o tópico/ }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Escena o tópico anterior" }));
    await waitFor(() => expect(screen.getByText("Introducción")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Repetir escena actual" }));

    expect(mockGenerateLesson).toHaveBeenCalledTimes(1);
    expect(mockGetCourse).toHaveBeenCalledTimes(1);
    expect(mockGetTopic).toHaveBeenCalledTimes(1);
  });

  it("N: la estructura del toolbar es válida (elementos button reales, sin divs clickeables)", async () => {
    const { container } = await renderWithLesson();

    const toolbar = container.querySelector(".scene-controls")!;
    expect(toolbar).not.toBeNull();
    const clickableDivs = Array.from(toolbar.querySelectorAll("div[onclick]"));
    expect(clickableDivs).toHaveLength(0);
    // Todo control interactivo del toolbar es un <button> o <select> real.
    const interactiveEls = toolbar.querySelectorAll("button, select");
    expect(interactiveEls.length).toBeGreaterThan(0);
    interactiveEls.forEach((el) => {
      expect(["BUTTON", "SELECT"]).toContain(el.tagName);
    });
  });

  // Bug real preexistente encontrado durante el QA de este bloque (no
  // relacionado con el layout): el early-return de `error` vivía antes de
  // un useMemo, violando las reglas de hooks de React. Un tópico
  // inexistente (404) disparaba "Rendered fewer hooks than expected" y
  // rompía toda la página. Esta prueba falla de forma ruidosa (la excepción
  // de React no queda silenciada por ningún ErrorBoundary acá) si la
  // regresión vuelve a aparecer.
  it("un tópico inexistente (404) muestra el estado de error sin romper por reglas de hooks", async () => {
    mockGetTopic.mockReset().mockRejectedValue(new ApiError(404, "not found"));
    renderPage("/aula/curso-demo/modulo-demo/topico-fantasma");

    await waitFor(() =>
      expect(
        screen.getByText("Este tópico no existe o no está disponible en el material del curso.")
      ).toBeInTheDocument()
    );
  });
});
