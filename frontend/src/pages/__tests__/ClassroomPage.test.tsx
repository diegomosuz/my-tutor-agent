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
const mockSynthesizeSpeech = vi.fn();

vi.mock("../../api/client", () => ({
  api: {
    getCourse: (...args: unknown[]) => mockGetCourse(...args),
    getTopic: (...args: unknown[]) => mockGetTopic(...args),
    generateLesson: (...args: unknown[]) => mockGenerateLesson(...args),
    getSystemStatus: (...args: unknown[]) => mockGetSystemStatus(...args),
    getAiStatus: (...args: unknown[]) => mockGetAiStatus(...args),
    askTutor: (...args: unknown[]) => mockAskTutor(...args),
    evaluateCheckpoint: (...args: unknown[]) => mockEvaluateCheckpoint(...args),
    synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args),
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
  mockSynthesizeSpeech.mockReset();
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
  it("A: los controles de escena son el elemento INMEDIATAMENTE posterior a la slide (orden DOM exacto)", async () => {
    const { container } = await renderWithLesson();

    const stage = container.querySelector(".classroom-stage");
    expect(stage).not.toBeNull();
    const children = Array.from(stage!.children).map((el) => el.className);

    const slideIndex = children.findIndex((c) => c.includes("slide-panel"));
    const controlsIndex = children.findIndex((c) => c.includes("scene-controls"));
    const narrationIndex = children.findIndex((c) => c.includes("narration-panel"));
    const tutorIndex = children.findIndex((c) => c.includes("tutor-panel"));
    const topicNavIndex = children.findIndex((c) => c.includes("module-topic-nav"));

    expect(slideIndex).toBeGreaterThanOrEqual(0);
    // scene-controls debe ser el HERMANO SIGUIENTE de slide-panel — no
    // alcanza con que "aparezca después"; no puede haber nada en el medio
    // (nunca más narración/checkpoint entre la slide y los controles).
    expect(controlsIndex).toBe(slideIndex + 1);
    // Orden completo: Slide -> Controles -> Narración -> Tutor -> nav.
    expect(narrationIndex).toBe(controlsIndex + 1);
    expect(tutorIndex).toBeGreaterThan(narrationIndex);
    expect(topicNavIndex).toBeGreaterThan(tutorIndex);
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

    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Diapositiva anterior" }));
    await waitFor(() => expect(screen.getByText("Introducción")).toBeInTheDocument());
  });

  it("E: Siguiente funciona (avanza de escena 1 a escena 2)", async () => {
    await renderWithLesson();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
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

    expect(screen.getByRole("button", { name: "Diapositiva anterior" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Resumen")).toBeInTheDocument());

    // v1.3.0 (BLOQUE C): última escena -- "Siguiente diapositiva" queda
    // deshabilitado, NUNCA se relabelea a "Finalizar". El CTA explícito y
    // separado "Completar tema y continuar" es lo único que avanza.
    expect(screen.getByRole("button", { name: "Siguiente diapositiva" })).toBeDisabled();
    const completeButton = screen.getByRole("button", { name: "Completar último tema" });
    expect(completeButton).not.toBeDisabled();
    fireEvent.click(completeButton);
    await waitFor(() => expect(screen.getByText("✓ Tema completado")).toBeInTheDocument());
  });

  it("J: el tutor sigue operativo (pregunta cubierta) dentro del nuevo layout", async () => {
    mockAskTutor.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [groundedText("Un Pod es la unidad mínima de despliegue.", ["SRC-002"])],
      general_knowledge_chunks: [],
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

    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Resumen")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Completar último tema" }));

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

  it("L2: con checkpoint, el orden DOM es Controles -> Narración -> Checkpoint -> Tutor", async () => {
    const { container } = await renderWithLesson(checkpointLesson());

    const stage = container.querySelector(".classroom-stage");
    expect(stage).not.toBeNull();
    const children = Array.from(stage!.children).map((el) => el.className);

    const controlsIndex = children.findIndex((c) => c.includes("scene-controls"));
    const narrationIndex = children.findIndex((c) => c.includes("narration-panel"));
    const checkpointIndex = children.findIndex((c) => c.includes("checkpoint-panel"));
    const tutorIndex = children.findIndex((c) => c.includes("tutor-panel"));

    expect(controlsIndex).toBeGreaterThanOrEqual(0);
    expect(narrationIndex).toBeGreaterThan(controlsIndex);
    expect(checkpointIndex).toBeGreaterThan(narrationIndex);
    expect(tutorIndex).toBeGreaterThan(checkpointIndex);
    // El checkpoint es contenido pedagógico de la escena, no un control del
    // player: nunca debe terminar debajo del toolbar de controles.
    expect(checkpointIndex).toBeGreaterThan(controlsIndex);
  });

  it("M: navegar entre escenas no introduce requests duplicados de curso/tópico/lección", async () => {
    await renderWithLesson();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Diapositiva anterior" }));
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

// ----------------------------------------------------------------------
// v1.3.0 (bloque "Classroom UX" -- BLOQUE C: navegación), PARTE 21 A-J
// ----------------------------------------------------------------------

const MULTI_MODULE_COURSE = {
  id: "curso-demo",
  title: "Curso demo",
  description: "",
  order: 1,
  modules: [
    {
      id: "modulo-1",
      title: "Módulo 1",
      order: 1,
      topics: [
        { id: "topico-a", title: "Tópico A", order: 1 },
        { id: "topico-b", title: "Tópico B", order: 2 },
      ],
    },
    {
      id: "modulo-2",
      title: "Módulo 2",
      order: 2,
      topics: [{ id: "topico-c", title: "Tópico C", order: 1 }],
    },
  ],
};

describe("ClassroomPage — v1.3.0 Classroom UX (BLOQUE C: navegación)", () => {
  it("A: sin LessonPlan (modo sin IA) no se renderizan controles de escena, solo navegación de tópico", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Preparar clase con IA/ });

    expect(screen.queryByRole("group", { name: "Controles de la escena" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Navegación entre tópicos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tema anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tema siguiente" })).toBeDisabled();
  });

  it("B: la navegación de tópico está siempre visible, incluso con una LessonPlan activa", async () => {
    await renderWithLesson();
    expect(screen.getByRole("group", { name: "Navegación entre tópicos" })).toBeInTheDocument();
  });

  it("C: 'Tema siguiente' navega al próximo tópico cruzando módulos", async () => {
    mockGetCourse.mockReset().mockResolvedValue(MULTI_MODULE_COURSE);
    renderPage("/aula/curso-demo/modulo-1/topico-b");
    await screen.findByRole("button", { name: /Preparar clase con IA/ });

    fireEvent.click(screen.getByRole("button", { name: "Tema siguiente" }));
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-2/topico-c");
  });

  it("D: 'Tema anterior' nunca dispara navegación de escena (son affordances separadas)", async () => {
    mockGetCourse.mockReset().mockResolvedValue(MULTI_MODULE_COURSE);
    await renderWithLesson(SAMPLE_LESSON, "/aula/curso-demo/modulo-1/topico-b");

    fireEvent.click(screen.getByRole("button", { name: "Tema anterior" }));
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-a");
    // La escena actual de la LessonPlan no cambió por este click de tópico.
    expect(screen.getByText("Introducción")).toBeInTheDocument();
  });

  it("E: navegar de escena (Siguiente diapositiva) nunca dispara navegación de tópico", async () => {
    mockGetCourse.mockReset().mockResolvedValue(MULTI_MODULE_COURSE);
    await renderWithLesson(SAMPLE_LESSON, "/aula/curso-demo/modulo-1/topico-b");

    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("F: 'Completar tema y continuar' marca el tema completo y navega automáticamente al próximo tópico", async () => {
    mockGetCourse.mockReset().mockResolvedValue(MULTI_MODULE_COURSE);
    await renderWithLesson(SAMPLE_LESSON, "/aula/curso-demo/modulo-1/topico-a");

    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Resumen")).toBeInTheDocument());

    const completeButton = screen.getByRole("button", { name: "Completar tema y continuar →" });
    fireEvent.click(completeButton);

    await waitFor(() => {
      const progress = getCourseLearningProgress("curso-demo");
      expect(progress?.topics["modulo-1:topico-a"]?.status).toBe("completed");
    });
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-b");
  });

  it("G: en el último tópico del curso, 'Completar último tema' nunca inventa un destino", async () => {
    mockGetCourse.mockReset().mockResolvedValue(MULTI_MODULE_COURSE);
    await renderWithLesson(SAMPLE_LESSON, "/aula/curso-demo/modulo-2/topico-c");

    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Resumen")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Completar último tema" }));
    await waitFor(() => expect(screen.getByText("✓ Tema completado")).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("H: 'Siguiente diapositiva' nunca se relabelea a 'Finalizar' en la última escena", async () => {
    await renderWithLesson();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Componentes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Siguiente diapositiva" }));
    await waitFor(() => expect(screen.getByText("Resumen")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Finalizar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalizar tema" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente diapositiva" })).toBeDisabled();
  });

  it("I: el CTA de completar tema solo aparece en la última escena, nunca antes", async () => {
    await renderWithLesson();
    expect(
      screen.queryByRole("button", { name: /Completar (tema y continuar|último tema)/ })
    ).not.toBeInTheDocument();
  });

  it("J: repetir escena y pausar/reanudar nunca navegan de tópico", async () => {
    mockGetCourse.mockReset().mockResolvedValue(MULTI_MODULE_COURSE);
    await renderWithLesson(SAMPLE_LESSON, "/aula/curso-demo/modulo-1/topico-b");

    fireEvent.click(screen.getByRole("button", { name: "Pausar clase" }));
    fireEvent.click(screen.getByRole("button", { name: "Reanudar clase" }));
    fireEvent.click(screen.getByRole("button", { name: "Repetir escena actual" }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------
// v1.3.0 (BLOQUE 6: content-panel navigation), PARTE 11 A-B — la
// navegación de tópico vive junto al panel de Markdown, ya NO debajo del
// Tutor. Reusa exactamente la misma navegación (mismos aria-labels,
// mismos handlers) — solo cambia su ubicación en el DOM.
// ----------------------------------------------------------------------
describe("ClassroomPage — v1.3.0 content-panel navigation (BLOQUE 6)", () => {
  it("A: la navegación de tópico vive dentro de .content-panel, antes de .content-panel__body", async () => {
    const { container } = await renderWithLesson();

    const panel = container.querySelector(".content-panel");
    expect(panel).not.toBeNull();
    const children = Array.from(panel!.children).map((el) => el.className);

    const navIndex = children.findIndex((c) => c.includes("content-panel__topic-nav"));
    const bodyIndex = children.findIndex((c) => c.includes("content-panel__body"));

    expect(navIndex).toBeGreaterThanOrEqual(0);
    expect(bodyIndex).toBeGreaterThan(navIndex);
  });

  it("B: la navegación de tópico ya NO vive dentro de .classroom-stage (no está debajo del Tutor)", async () => {
    const { container } = await renderWithLesson();

    const stage = container.querySelector(".classroom-stage");
    expect(stage).not.toBeNull();
    expect(stage!.querySelector(".content-panel__topic-nav")).toBeNull();

    // sigue existiendo una sola instancia real del toolbar en toda la página
    expect(screen.getAllByRole("group", { name: "Navegación entre tópicos" })).toHaveLength(1);
  });
});

// ----------------------------------------------------------------------
// v1.5.0 ("Guided Markdown Read Aloud") — integración real dentro del
// árbol completo de ClassroomPage. Fuerza voz neural configurada (mismo
// mock de Audio/URL que useReadAloud.test.ts) para poder llevar al
// Reader a un estado "playing" real y verificar que una acción de IA lo
// detiene de inmediato (PARTE 41, "TEST CRÍTICO" de la especificación).
// ----------------------------------------------------------------------
describe("ClassroomPage — v1.5.0 Guided Markdown Read Aloud", () => {
  class MockAudio {
    src = "";
    paused = true;
    playbackRate = 1;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play = vi.fn(() => {
      this.paused = false;
      return Promise.resolve();
    });
    pause = vi.fn(() => {
      this.paused = true;
    });
    constructor(src: string) {
      this.src = src;
    }
  }

  beforeEach(() => {
    mockGetSystemStatus.mockReset().mockResolvedValue({
      app_version: "1.5.0",
      backend: "ok",
      courses: { count: 1, diagnostics: "ok" },
      llm: { provider: "openai", model: "", configured: false, prompt_version: "", certification_prompt_version: "" },
      voice: { provider: "openai", neural_configured: true, tts_model: "gpt-4o-mini-tts" },
      cache_writable: true,
    });
    // El fetch de síntesis nunca resuelve por sí solo en este bloque: cada
    // test controla explícitamente cuándo "llega" el audio.
    mockSynthesizeSpeech.mockReturnValue(new Promise(() => {}));
    // @ts-expect-error jsdom no implementa HTMLAudioElement de verdad
    globalThis.Audio = MockAudio;
    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake-url");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("A: el botón 'Leer tema' está disponible junto a la navegación de tópico", async () => {
    renderPage();
    // El botón existe desde el primer render, pero arranca disabled hasta
    // que useReadAloud termina de segmentar el Markdown ya montado (efecto
    // async) -- se espera a que quede habilitado, nunca se asume síncrono.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Leer tema/ })).not.toBeDisabled()
    );
  });

  it("B (PARTE 41, crítico): Generar clase con IA detiene el Reader de inmediato, incluso ANTES de que termine la generación", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Leer tema/ })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /Leer tema/ }));

    // El Reader queda "cargando" (fetch de síntesis todavía en vuelo,
    // nunca resuelve en este test).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cargando/ })).toBeInTheDocument()
    );

    // La generación de IA tampoco resuelve todavía -- lo que importa es
    // que el Reader se detiene en el momento del CLICK, no cuando la
    // generación termina.
    let resolveGeneration: (plan: typeof SAMPLE_LESSON) => void = () => {};
    mockGenerateLesson.mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );
    const generateButton = screen.getByRole("button", { name: /Preparar clase con IA/ });
    fireEvent.click(generateButton);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^🔊 Leer tema/ })).toBeInTheDocument()
    );

    resolveGeneration(SAMPLE_LESSON);
  });

  it("C (PARTE 46, crítico -- bug real corregido): con voz activada por preferencia de una sesión previa pero SIN lección/escena generada, 'Leer tema' está habilitado", async () => {
    // Reproduce el bug real reportado: `voiceEnabled` queda persistido en
    // localStorage de una sesión anterior, pero en ESTA sesión el alumno
    // todavía no generó ninguna clase con IA (no existe `engine.currentScene`)
    // -- por lo tanto ningún audio de IA puede estar sonando. "Leer tema"
    // nunca debe quedar deshabilitado solo por esta preferencia persistida
    // sin una sesión de audio real detrás.
    window.localStorage.setItem("pwc-tutor:voice-enabled", "1");
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Leer tema/ })).not.toBeDisabled()
    );
  });

  it("D (PARTE 46): con una escena de IA realmente narrando 'Leer tema' se deshabilita, y al apagar la voz vuelve a habilitarse sin lock obsoleto", async () => {
    await renderWithLesson();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Leer tema/ })).not.toBeDisabled()
    );

    fireEvent.click(screen.getByRole("button", { name: "Activar voz" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Leer tema/ })).toBeDisabled()
    );

    fireEvent.click(screen.getByRole("button", { name: "Desactivar voz" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Leer tema/ })).not.toBeDisabled()
    );
  });
});
