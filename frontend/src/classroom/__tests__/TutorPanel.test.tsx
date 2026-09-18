import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendMessage = vi.fn();
const mockClearConversation = vi.fn();
let mockUseTutorReturn: {
  messages: unknown[];
  loading: boolean;
  error: { title: string; detail: string } | null;
  sendMessage: typeof mockSendMessage;
  clearConversation: typeof mockClearConversation;
};

vi.mock("../useTutor", async () => {
  const actual = await vi.importActual<typeof import("../useTutor")>("../useTutor");
  return {
    ...actual,
    useTutor: vi.fn(() => mockUseTutorReturn),
  };
});

const mockRecognitionStart = vi.fn();
const mockRecognitionStop = vi.fn();
const mockResetTranscript = vi.fn();
let mockRecognitionReturn: {
  supported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  start: typeof mockRecognitionStart;
  stop: typeof mockRecognitionStop;
  resetTranscript: typeof mockResetTranscript;
};

vi.mock("../useSpeechRecognition", () => ({
  useSpeechRecognition: vi.fn(() => mockRecognitionReturn),
}));

const mockSpeakSequenceCancel = vi.fn();
const mockSpeakSequence = vi.fn(
  (_texts: string[], _options: { rate?: number }) => mockSpeakSequenceCancel
);
vi.mock("../speech", () => ({
  speakSequence: (texts: string[], options: { rate?: number }) => mockSpeakSequence(texts, options),
}));

import { TutorPanel } from "../TutorPanel";

const IDS = { courseId: "curso-demo", moduleId: "modulo-demo", topicId: "topico-demo" };

function baseProps() {
  return {
    ...IDS,
    sceneId: "SCENE-001",
    aiStatus: { configured: true, provider: "openai", model: "gpt-4o", prompt_version: "tutor-v1" },
    voiceEnabled: false,
    voiceRate: 1,
    isInterrupting: false,
    onInterrupt: vi.fn(),
    onContinueClass: vi.fn(),
  };
}

beforeEach(() => {
  mockSendMessage.mockReset();
  mockClearConversation.mockReset();
  mockSpeakSequence.mockClear();
  mockSpeakSequenceCancel.mockReset();
  mockRecognitionStart.mockReset();
  mockRecognitionStop.mockReset();
  mockResetTranscript.mockReset();
  mockUseTutorReturn = {
    messages: [],
    loading: false,
    error: null,
    sendMessage: mockSendMessage,
    clearConversation: mockClearConversation,
  };
  mockRecognitionReturn = {
    supported: false,
    isListening: false,
    transcript: "",
    error: null,
    start: mockRecognitionStart,
    stop: mockRecognitionStop,
    resetTranscript: mockResetTranscript,
  };
});

describe("TutorPanel", () => {
  it("muestra el estado de carga mientras el tutor responde", () => {
    mockUseTutorReturn.loading = true;
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("El tutor está pensando…")).toBeInTheDocument();
  });

  it("muestra un error controlado sin romper el panel", () => {
    mockUseTutorReturn.error = { title: "IA no configurada", detail: "Falta credencial." };
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("IA no configurada")).toBeInTheDocument();
    expect(screen.getByText("Falta credencial.")).toBeInTheDocument();
  });

  it("al enviar una pregunta, pausa la clase llamando a onInterrupt (vía onBeforeSend)", async () => {
    mockSendMessage.mockResolvedValue(null);
    const props = baseProps();
    render(<TutorPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "¿Qué es un Pod?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    // useTutor recibe onBeforeSend=onInterrupt; se verifica que sendMessage se llamó
    // (la pausa real ocurre dentro de useTutor.sendMessage, ya testeada en useTutor.test.ts)
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("¿Qué es un Pod?"));
  });

  it("muestra el banner de interrupción con botón Continuar clase cuando isInterrupting=true", () => {
    const props = baseProps();
    props.isInterrupting = true;
    render(<TutorPanel {...props} />);
    expect(screen.getByText("La clase está en pausa mientras conversás con el tutor.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "▶ Continuar clase" }));
    expect(props.onContinueClass).toHaveBeenCalledTimes(1);
  });

  it("lee la respuesta del tutor por voz cuando voiceEnabled=true", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "Un Pod agrupa contenedores.", source_refs: ["SRC-002"] }],
      clarification_question: null,
    });
    const props = baseProps();
    props.voiceEnabled = true;
    render(<TutorPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "¿Qué es un Pod?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(1));
    expect(mockSpeakSequence).toHaveBeenCalledWith(["Un Pod agrupa contenedores."], { rate: 1 });
  });

  it("no lee por voz cuando voiceEnabled=false (nunca superpone narración de clase y tutor)", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "Un Pod agrupa contenedores.", source_refs: ["SRC-002"] }],
      clarification_question: null,
    });
    render(<TutorPanel {...baseProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "¿Qué es un Pod?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled());
    expect(mockSpeakSequence).not.toHaveBeenCalled();
  });

  it("cancela cualquier lectura previa antes de leer una respuesta nueva", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "Respuesta 1.", source_refs: ["SRC-002"] }],
      clarification_question: null,
    });
    const props = baseProps();
    props.voiceEnabled = true;
    render(<TutorPanel {...props} />);

    const input = screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…");
    fireEvent.change(input, { target: { value: "Primera pregunta" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(1));

    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "Respuesta 2.", source_refs: ["SRC-003"] }],
      clarification_question: null,
    });
    fireEvent.change(input, { target: { value: "Segunda pregunta" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(2));
    expect(mockSpeakSequenceCancel).toHaveBeenCalled();
  });

  it("el micrófono se deshabilita/oculta con tooltip claro cuando no hay soporte", () => {
    mockRecognitionReturn.supported = false;
    render(<TutorPanel {...baseProps()} />);
    const micButton = screen.getByLabelText("Dictado por voz no disponible en este navegador");
    expect(micButton).toBeDisabled();
  });

  it("el micrófono está habilitado y llama a start() al hacer click cuando hay soporte", () => {
    mockRecognitionReturn.supported = true;
    render(<TutorPanel {...baseProps()} />);
    const micButton = screen.getByLabelText("Dictar pregunta por voz");
    expect(micButton).not.toBeDisabled();
    fireEvent.click(micButton);
    expect(mockRecognitionStart).toHaveBeenCalledTimes(1);
  });

  it("el transcript final del micrófono llena el input SIN enviar automáticamente", () => {
    mockRecognitionReturn.supported = true;
    mockRecognitionReturn.transcript = "qué es un pod";
    render(<TutorPanel {...baseProps()} />);

    const input = screen.getByPlaceholderText(
      "Escribí tu pregunta sobre este tema…"
    ) as HTMLInputElement;
    expect(input.value).toBe("qué es un pod");
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockResetTranscript).toHaveBeenCalled();
  });

  it("no permite doble envío: el botón se deshabilita mientras loading=true", () => {
    mockUseTutorReturn.loading = true;
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("muestra 'IA no configurada' cuando aiStatus.configured es false", () => {
    const props = baseProps();
    props.aiStatus = { configured: false, provider: "openai", model: "gpt-4o", prompt_version: "tutor-v1" };
    render(<TutorPanel {...props} />);
    expect(screen.getByText("○ IA no configurada")).toBeInTheDocument();
  });

  it("botón limpiar conversación llama a clearConversation", () => {
    mockUseTutorReturn.messages = [{ id: "1", role: "user", content: "hola" }];
    render(<TutorPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar conversación" }));
    expect(mockClearConversation).toHaveBeenCalledTimes(1);
  });

  it("hacer click en una sugerencia carga la pregunta en el input sin enviarla", () => {
    render(<TutorPanel {...baseProps()} />);
    fireEvent.click(screen.getByText("Resumí esta parte"));
    const input = screen.getByPlaceholderText(
      "Escribí tu pregunta sobre este tema…"
    ) as HTMLInputElement;
    expect(input.value).toBe("Resumí esta parte");
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
