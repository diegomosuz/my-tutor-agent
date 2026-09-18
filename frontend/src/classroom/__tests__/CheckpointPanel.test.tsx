import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { api: { evaluateCheckpoint: vi.fn() }, ApiError };
});

vi.mock("../voicePlayback", () => ({
  speakSequenceUnified: vi.fn(() => vi.fn()),
  cancelAllSpeech: vi.fn(),
}));

import { api, ApiError } from "../../api/client";
import { speakSequenceUnified } from "../voicePlayback";
import { CheckpointPanel } from "../CheckpointPanel";
import type { LessonScene } from "../../types/api";

const mockedEvaluate = api.evaluateCheckpoint as unknown as ReturnType<typeof vi.fn>;
const mockedSpeakSequence = speakSequenceUnified as unknown as ReturnType<typeof vi.fn>;

const IDS = { courseId: "curso-demo", moduleId: "modulo-demo", topicId: "topico-demo" };

function checkScene(): LessonScene {
  return {
    scene_id: "SCENE-003",
    title: { text: "Verificación", source_refs: ["SRC-001"] },
    narration: { text: "Repasemos.", source_refs: ["SRC-001"] },
    key_points: [],
    visual: { text: "diagrama", source_refs: ["SRC-001"] },
    interaction: {
      interaction_type: "comprehension_check",
      question: { text: "¿Qué es un Pod?", source_refs: ["SRC-002"] },
      expected_answer: { text: "SECRETO_NO_DEBE_VERSE_JAMAS", source_refs: ["SRC-002"] },
    },
  } as unknown as LessonScene;
}

function reflectionScene(): LessonScene {
  return {
    scene_id: "SCENE-004",
    title: { text: "Reflexión", source_refs: ["SRC-001"] },
    narration: { text: "Pensemos.", source_refs: ["SRC-001"] },
    key_points: [],
    visual: { text: "diagrama", source_refs: ["SRC-001"] },
    interaction: {
      interaction_type: "reflection",
      question: { text: "¿Qué opinás?", source_refs: ["SRC-002"] },
    },
  } as unknown as LessonScene;
}

beforeEach(() => {
  mockedEvaluate.mockReset();
  mockedSpeakSequence.mockReset();
  mockedSpeakSequence.mockReturnValue(vi.fn());
});

describe("CheckpointPanel", () => {
  it("muestra la pregunta de la escena", () => {
    render(<CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />);
    expect(screen.getByText("¿Qué es un Pod?")).toBeInTheDocument();
  });

  it("NUNCA muestra expected_answer antes de responder", () => {
    const { container } = render(
      <CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />
    );
    expect(container.textContent).not.toMatch(/SECRETO_NO_DEBE_VERSE_JAMAS/);
  });

  it("NUNCA muestra expected_answer, ni siquiera después de evaluar", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "correct",
      feedback: [{ text: "Bien, un Pod agrupa contenedores.", source_refs: ["SRC-002"] }],
      ideal_answer: { text: "Un Pod es la unidad mínima de despliegue.", source_refs: ["SRC-002"] },
    });
    const { container } = render(
      <CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />
    );
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "Un Pod agrupa contenedores." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() => expect(screen.getByText("Correcto")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/SECRETO_NO_DEBE_VERSE_JAMAS/);
  });

  it("enviar respuesta llama a api.evaluateCheckpoint con scene_id y answer", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "partially_correct",
      feedback: [{ text: "Casi, falta precisión.", source_refs: ["SRC-002"] }],
      ideal_answer: null,
    });
    render(<CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "Es un contenedor." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() => expect(mockedEvaluate).toHaveBeenCalledTimes(1));
    expect(mockedEvaluate).toHaveBeenCalledWith("curso-demo", "modulo-demo", "topico-demo", {
      scene_id: "SCENE-003",
      answer: "Es un contenedor.",
    });
  });

  it("muestra el verdict y el feedback grounded tras evaluar", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "incorrect",
      feedback: [{ text: "No, un Pod no es eso.", source_refs: ["SRC-002"] }],
      ideal_answer: null,
    });
    render(<CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "No sé." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() => expect(screen.getByText("Incorrecto")).toBeInTheDocument());
    expect(screen.getByText("No, un Pod no es eso.")).toBeInTheDocument();
  });

  it("muestra ideal_answer después de evaluar si está presente", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "correct",
      feedback: [{ text: "Bien.", source_refs: ["SRC-002"] }],
      ideal_answer: { text: "Un Pod es la unidad mínima de despliegue.", source_refs: ["SRC-002"] },
    });
    render(<CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "Un Pod agrupa contenedores." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() =>
      expect(screen.getByText("Un Pod es la unidad mínima de despliegue.")).toBeInTheDocument()
    );
  });

  it("escenas de tipo reflection no renderizan el panel de checkpoint", () => {
    const { container } = render(
      <CheckpointPanel {...IDS} scene={reflectionScene()} voiceEnabled={false} voiceRate={1} />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("button", { name: "Comprobar" })).not.toBeInTheDocument();
  });

  it("un error controlado se muestra sin romper el panel", async () => {
    mockedEvaluate.mockRejectedValue(new ApiError(502, "El proveedor de IA falló."));
    render(<CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "Una respuesta." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() => expect(screen.queryByText(/no está disponible|falló|IA/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Comprobar" })).toBeInTheDocument();
  });

  it("el botón Comprobar se deshabilita mientras evalúa (evita doble envío)", async () => {
    let resolvePromise!: (value: unknown) => void;
    mockedEvaluate.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    render(<CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "Una respuesta." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Evaluando/ })).toBeDisabled());
    expect(mockedEvaluate).toHaveBeenCalledTimes(1);

    resolvePromise({ verdict: "correct", feedback: [{ text: "Ok", source_refs: ["SRC-002"] }], ideal_answer: null });
  });

  it("lee el feedback por voz cuando voiceEnabled=true, sin duplicar la secuencia", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "correct",
      feedback: [{ text: "Bien.", source_refs: ["SRC-002"] }],
      ideal_answer: null,
    });
    render(<CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={true} voiceRate={1} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "Una respuesta." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() => expect(mockedSpeakSequence).toHaveBeenCalledTimes(1));
    expect(mockedSpeakSequence).toHaveBeenCalledWith(["Bien."], expect.objectContaining({ rate: 1 }));
  });

  it("no lee el feedback por voz cuando voiceEnabled=false", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "correct",
      feedback: [{ text: "Bien.", source_refs: ["SRC-002"] }],
      ideal_answer: null,
    });
    render(<CheckpointPanel {...IDS} scene={checkScene()} voiceEnabled={false} voiceRate={1} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "Una respuesta." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));

    await waitFor(() => expect(screen.getByText("Correcto")).toBeInTheDocument());
    expect(mockedSpeakSequence).not.toHaveBeenCalled();
  });
});
