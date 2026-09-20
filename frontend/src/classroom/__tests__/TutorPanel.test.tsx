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

  it("E: una respuesta con general_knowledge_chunks muestra el label de conocimiento general", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Respuesta ampliada.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: [],
          generalTexts: ["Respuesta ampliada."],
          courseSources: [],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("Ampliado con conocimiento general")).toBeInTheDocument();
  });

  it("F: una respuesta grounded normal (solo tópico actual) no muestra el label de conocimiento general", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Un Pod agrupa contenedores.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: ["Un Pod agrupa contenedores."],
          courseTexts: [],
          generalTexts: [],
          courseSources: [],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.queryByText("Ampliado con conocimiento general")).not.toBeInTheDocument();
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
      "Permite complementar las respuestas con conocimiento general cuando el contenido del curso no es suficiente."
    );
    const text = help.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/web|internet|búsqueda|actualizad/);
  });

  // --------------------------------------------------------------------
  // v1.4.0 (Bloque 3 -- "Provenance UX + Related Topic Navigation"),
  // PARTE 30-38
  // --------------------------------------------------------------------

  it("no sugiere que el switch apagado limite el tutor a un solo tema", () => {
    render(<TutorPanel {...baseProps()} />);
    const hint = screen.getByText(/El tutor responde únicamente con contenido demostrado/);
    // v1.4.0 (Bloque 3, PARTE 21): la afirmación vieja era literalmente
    // "El tutor responde únicamente en base al contenido de este tema." --
    // ya no debe existir tal cual (el nuevo texto SÍ menciona "este tema"
    // como uno de dos orígenes posibles, nunca como el único).
    expect(hint.textContent).not.toBe(
      "El tutor responde únicamente en base al contenido de este tema."
    );
    expect(hint.textContent).toMatch(/curso/i);
  });

  it("PARTE 30: respuesta solo de tópico actual muestra 'Basado en este tema' y ningún otro label", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Un Pod agrupa contenedores.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: ["Un Pod agrupa contenedores."],
          courseTexts: [],
          generalTexts: [],
          courseSources: [],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("Basado en este tema")).toBeInTheDocument();
    expect(screen.queryByText("Basado en el curso")).not.toBeInTheDocument();
    expect(screen.queryByText("Ampliado con conocimiento general")).not.toBeInTheDocument();
  });

  it("PARTE 31: respuesta de curso muestra 'Basado en el curso' + Temas relacionados + CTA, sin label general", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Evolucioná una API sin romper clientes viejos.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: ["Evolucioná una API sin romper clientes viejos."],
          generalTexts: [],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "diseno-tecnico-especificado",
              module_title: "Diseño Técnico Especificado",
              topic_id: "diseno-de-apis-y-contratos-evolutivos",
              topic_title: "Diseño de APIs y contratos evolutivos",
              original_source_ref: "SRC-017",
              heading_path: [],
            },
          ],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("Basado en el curso")).toBeInTheDocument();
    expect(screen.queryByText("Basado en este tema")).not.toBeInTheDocument();
    expect(screen.queryByText("Ampliado con conocimiento general")).not.toBeInTheDocument();
    expect(screen.getByText("Temas relacionados")).toBeInTheDocument();
    expect(screen.getByText("Diseño de APIs y contratos evolutivos")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Ver tema relacionado: Diseño de APIs y contratos evolutivos",
      })
    ).toBeInTheDocument();
  });

  it("PARTE 32: respuesta solo de conocimiento general no muestra label de tema/curso ni Temas relacionados", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "En general, suele considerarse que...",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: [],
          generalTexts: ["En general, suele considerarse que..."],
          courseSources: [],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("Ampliado con conocimiento general")).toBeInTheDocument();
    expect(screen.queryByText("Basado en este tema")).not.toBeInTheDocument();
    expect(screen.queryByText("Basado en el curso")).not.toBeInTheDocument();
    expect(screen.queryByText("Temas relacionados")).not.toBeInTheDocument();
  });

  it("PARTE 33: mezcla tópico actual + curso muestra ambos labels, sin mezclar el contenido", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Texto del tópico actual.\n\nTexto de otro tópico.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: ["Texto del tópico actual."],
          courseTexts: ["Texto de otro tópico."],
          generalTexts: [],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "modulo-x",
              module_title: "Módulo X",
              topic_id: "topico-x",
              topic_title: "Tópico X",
              original_source_ref: "SRC-001",
              heading_path: [],
            },
          ],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("Basado en este tema")).toBeInTheDocument();
    expect(screen.getByText("Basado en el curso")).toBeInTheDocument();
    expect(screen.getByText("Texto del tópico actual.")).toBeInTheDocument();
    expect(screen.getByText("Texto de otro tópico.")).toBeInTheDocument();
  });

  it("PARTE 34: mezcla curso + conocimiento general -- el general no hereda course_sources", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Texto del curso.\n\nTexto general.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: ["Texto del curso."],
          generalTexts: ["Texto general."],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "modulo-x",
              module_title: "Módulo X",
              topic_id: "topico-x",
              topic_title: "Tópico X",
              original_source_ref: "SRC-001",
              heading_path: [],
            },
          ],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("Basado en el curso")).toBeInTheDocument();
    expect(screen.getByText("Ampliado con conocimiento general")).toBeInTheDocument();
    expect(screen.getAllByText("Temas relacionados")).toHaveLength(1);
  });

  it("PARTE 35: triple mezcla (tópico + curso + general) renderiza los tres niveles", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "A.\n\nB.\n\nC.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: ["A."],
          courseTexts: ["B."],
          generalTexts: ["C."],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "modulo-x",
              module_title: "Módulo X",
              topic_id: "topico-x",
              topic_title: "Tópico X",
              original_source_ref: "SRC-001",
              heading_path: [],
            },
          ],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.getByText("Basado en este tema")).toBeInTheDocument();
    expect(screen.getByText("Basado en el curso")).toBeInTheDocument();
    expect(screen.getByText("Ampliado con conocimiento general")).toBeInTheDocument();
    expect(screen.getByText("A.")).toBeInTheDocument();
    expect(screen.getByText("B.")).toBeInTheDocument();
    expect(screen.getByText("C.")).toBeInTheDocument();
  });

  // PARTE 36 (dedup por tópico) se prueba a nivel de `useTutor` (tests 17
  // y 18 de useTutor.test.ts, con la función real de dedup contra la
  // forma real de una respuesta del backend) -- acá, en TutorPanel,
  // `useTutor` está mockeado, así que un test acá solo podría verificar
  // que TutorConversation renderiza fielmente lo que recibe, no que
  // dedupliqué correctamente (esa garantía ya la da la capa de datos).

  it("PARTE 37: course_sources de dos tópicos distintos muestra dos items, en orden de primera aparición", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Texto de curso.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: ["Texto de curso."],
          generalTexts: [],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "modulo-b",
              module_title: "Módulo B",
              topic_id: "topico-b",
              topic_title: "Tópico B (más relevante)",
              original_source_ref: "SRC-001",
              heading_path: [],
            },
            {
              ref: "COURSE-SRC-002",
              module_id: "modulo-a",
              module_title: "Módulo A",
              topic_id: "topico-a",
              topic_title: "Tópico A (menos relevante)",
              original_source_ref: "SRC-002",
              heading_path: [],
            },
          ],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    const items = screen.getAllByText(/Tópico (A|B) \(/);
    expect(items.map((el) => el.textContent)).toEqual([
      "Tópico B (más relevante)",
      "Tópico A (menos relevante)",
    ]);
  });

  it("PARTE 38: click en 'Ver tema relacionado' llama a onNavigateToTopic con module/topic correctos", () => {
    const onNavigateToTopic = vi.fn();
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Texto de curso.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: ["Texto de curso."],
          generalTexts: [],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "diseno-tecnico-especificado",
              module_title: "Diseño Técnico Especificado",
              topic_id: "diseno-de-apis-y-contratos-evolutivos",
              topic_title: "Diseño de APIs y contratos evolutivos",
              original_source_ref: "SRC-017",
              heading_path: [],
            },
          ],
        },
      },
    ];
    const props = baseProps();
    render(<TutorPanel {...props} onNavigateToTopic={onNavigateToTopic} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver tema relacionado: Diseño de APIs y contratos evolutivos",
      })
    );
    expect(onNavigateToTopic).toHaveBeenCalledWith(
      "diseno-tecnico-especificado",
      "diseno-de-apis-y-contratos-evolutivos"
    );
  });

  it("PARTE 22: sin course_answer_chunks ni course_sources, no muestra 'Temas relacionados'", () => {
    mockUseTutorReturn.messages = [
      {
        id: "1",
        role: "assistant",
        content: "Un Pod agrupa contenedores.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: ["Un Pod agrupa contenedores."],
          courseTexts: [],
          generalTexts: [],
          courseSources: [],
        },
      },
    ];
    render(<TutorPanel {...baseProps()} />);
    expect(screen.queryByText("Temas relacionados")).not.toBeInTheDocument();
  });

  it("PARTE 39: voz incluye course_answer_chunks (antes quedaba en silencio total si answer_chunks estaba vacío)", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [],
      course_answer_chunks: [
        { text: "Evolucioná una API sin romper clientes viejos.", source_refs: ["COURSE-SRC-001"] },
      ],
      course_sources: [],
      general_knowledge_chunks: [],
      clarification_question: null,
      general_knowledge_used: false,
    });
    const props = baseProps();
    props.voiceEnabled = true;
    render(<TutorPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "¿Cómo se diseñan contratos de API evolutivos?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(1));
    expect(mockSpeakSequence).toHaveBeenCalledWith(
      ["Evolucioná una API sin romper clientes viejos."],
      expect.objectContaining({ rate: 1 })
    );
  });

  // ------------------------------------------------------------------
  // v1.4.0 Bloque 4 (hardening), PARTE 47: completitud de la voz para
  // las 6 combinaciones de canales. "A" (solo tópico actual) y "B" (solo
  // curso) ya están cubiertas arriba ("lee la respuesta del tutor por
  // voz..." y "PARTE 39" respectivamente) -- acá se agregan C-F.
  // ------------------------------------------------------------------

  it("PARTE 47-C: voz de una respuesta solo de conocimiento general", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [],
      course_answer_chunks: [],
      course_sources: [],
      general_knowledge_chunks: ["En general, suele considerarse que..."],
      clarification_question: null,
      general_knowledge_used: true,
    });
    const props = baseProps();
    props.voiceEnabled = true;
    render(<TutorPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "¿Qué es la observabilidad?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(1));
    expect(mockSpeakSequence).toHaveBeenCalledWith(
      ["En general, suele considerarse que..."],
      expect.objectContaining({ rate: 1 })
    );
  });

  it("PARTE 47-D: voz de tópico actual + curso, en orden (tópico primero)", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "Texto del tópico actual.", source_refs: ["SRC-002"] }],
      course_answer_chunks: [
        { text: "Texto de otro tópico.", source_refs: ["COURSE-SRC-001"] },
      ],
      course_sources: [],
      general_knowledge_chunks: [],
      clarification_question: null,
      general_knowledge_used: false,
    });
    const props = baseProps();
    props.voiceEnabled = true;
    render(<TutorPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "pregunta mixta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(1));
    expect(mockSpeakSequence).toHaveBeenCalledWith(
      ["Texto del tópico actual.", "Texto de otro tópico."],
      expect.objectContaining({ rate: 1 })
    );
  });

  it("PARTE 47-E: voz de curso + conocimiento general, en orden (curso primero)", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [],
      course_answer_chunks: [
        { text: "Texto de otro tópico.", source_refs: ["COURSE-SRC-001"] },
      ],
      course_sources: [],
      general_knowledge_chunks: ["Texto de conocimiento general."],
      clarification_question: null,
      general_knowledge_used: true,
    });
    const props = baseProps();
    props.voiceEnabled = true;
    render(<TutorPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "pregunta mixta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(1));
    expect(mockSpeakSequence).toHaveBeenCalledWith(
      ["Texto de otro tópico.", "Texto de conocimiento general."],
      expect.objectContaining({ rate: 1 })
    );
  });

  it("PARTE 47-F: voz de la triple mezcla (tópico + curso + general), una sola vez cada una, en orden", async () => {
    mockSendMessage.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "A.", source_refs: ["SRC-002"] }],
      course_answer_chunks: [{ text: "B.", source_refs: ["COURSE-SRC-001"] }],
      course_sources: [],
      general_knowledge_chunks: ["C."],
      clarification_question: null,
      general_knowledge_used: true,
    });
    const props = baseProps();
    props.voiceEnabled = true;
    render(<TutorPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu pregunta sobre este tema…"), {
      target: { value: "pregunta triple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockSpeakSequence).toHaveBeenCalledTimes(1));
    expect(mockSpeakSequence).toHaveBeenCalledWith(
      ["A.", "B.", "C."],
      expect.objectContaining({ rate: 1 })
    );
  });
});
