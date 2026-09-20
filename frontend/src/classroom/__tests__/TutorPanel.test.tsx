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
vi.mock("../voicePlayback", () => ({
  speakSequenceUnified: (texts: string[], options: { rate?: number }) =>
    mockSpeakSequence(texts, options),
  cancelAllSpeech: vi.fn(),
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
    // (la pausa real ocurre dentro de useTutor.sendMessage, ya testeada en useTutor.test.ts).
    // Segundo arg = allowGeneralKnowledge (false por default, switch apagado).
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("¿Qué es un Pod?", false));
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
      general_knowledge_chunks: [],
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
    expect(mockSpeakSequence).toHaveBeenCalledWith(
      ["Un Pod agrupa contenedores."],
      expect.objectContaining({ rate: 1 })
    );
  });

  it("no lee por voz cuando voiceEnabled=false (nunca superpone narración de clase y tutor)", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "Un Pod agrupa contenedores.", source_refs: ["SRC-002"] }],
      general_knowledge_chunks: [],
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
      general_knowledge_chunks: [],
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
      general_knowledge_chunks: [],
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

  // --------------------------------------------------------------------
  // v1.3.0 (bloque "Classroom UX" -- Tutor Expanded Mode), PARTE 37 A-H
  // --------------------------------------------------------------------

  it("A: el switch 'Ampliar con conocimiento general' arranca apagado por default", () => {
    render(<TutorPanel {...baseProps()} />);
    const toggle = screen.getByRole("checkbox", { name: "Ampliar con conocimiento general" });
    expect(toggle).not.toBeChecked();
  });

  it("B: activar el switch envía allow_general_knowledge=true en el siguiente mensaje", async () => {
    mockSendMessage.mockResolvedValue(null);
    render(<TutorPanel {...baseProps()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Ampliar con conocimiento general" }));
    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "¿Cómo se relaciona esto con otra idea?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith("¿Cómo se relaciona esto con otra idea?", true)
    );
  });

  it("C: con el switch apagado (default) se envía allow_general_knowledge=false", async () => {
    mockSendMessage.mockResolvedValue(null);
    render(<TutorPanel {...baseProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "¿Qué es un Pod?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("¿Qué es un Pod?", false));
  });

  it("D: el switch persiste al cambiar solo de escena (sin remount, mismo tópico)", () => {
    const props = baseProps();
    const { rerender } = render(<TutorPanel {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Ampliar con conocimiento general" }));
    expect(screen.getByRole("checkbox", { name: "Ampliar con conocimiento general" })).toBeChecked();

    rerender(<TutorPanel {...props} sceneId="SCENE-002" />);
    expect(screen.getByRole("checkbox", { name: "Ampliar con conocimiento general" })).toBeChecked();
  });

  it("E: una respuesta con general_knowledge_used=true muestra el badge de transparencia", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Respuesta ampliada.",
        responseType: "answer",
        generalKnowledgeUsed: true,
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("Respuesta ampliada con conocimiento general")).toBeInTheDocument();
  });

  it("F: una respuesta grounded normal (general_knowledge_used=false) no muestra el badge", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Un Pod agrupa contenedores.",
        responseType: "answer",
        generalKnowledgeUsed: false,
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.queryByText("Respuesta ampliada con conocimiento general")).not.toBeInTheDocument();
  });

  it("G: response_type='unrelated' muestra el mensaje fijo de tema no relacionado", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "unrelated",
      answer_chunks: [],
      general_knowledge_chunks: [],
      clarification_question: null,
      general_knowledge_used: false,
    });
    const props = baseProps();
    props.voiceEnabled = true;
    render(<TutorPanel {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Ampliar con conocimiento general" }));

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "¿Cuál es la capital de Australia?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(1));
    expect(mockSpeakSequence.mock.calls[0][0][0]).toMatch(/no parece estar relacionada/i);
  });

  it("H: el texto de ayuda del switch nunca sugiere web/internet/búsqueda", () => {
    render(<TutorPanel {...baseProps()} />);
    const help = screen.getByText(
      "Permite complementar con conocimiento general de IA, pero solo para preguntas relacionadas con este tema o con el ámbito del curso"
    );
    const text = help.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/web|internet|búsqueda|actualizad/);
  });
});
