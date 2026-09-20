import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { api: { askTutor: vi.fn() }, ApiError };
});

import { api, ApiError } from "../../api/client";
import { NOT_COVERED_MESSAGE, useTutor } from "../useTutor";

const mockedAskTutor = api.askTutor as unknown as ReturnType<typeof vi.fn>;

const IDS = { courseId: "curso-demo", moduleId: "modulo-demo", topicId: "topico-demo" };

beforeEach(() => {
  mockedAskTutor.mockReset();
});

function answerReply(text = "Kubernetes orquesta contenedores.", refs = ["SRC-002"]) {
  return {
    response_type: "answer" as const,
    answer_chunks: [{ text, source_refs: refs }],
    general_knowledge_chunks: [],
    clarification_question: null,
    general_knowledge_used: false,
  };
}

describe("useTutor", () => {
  it("1. enviar pregunta llama al endpoint correcto", async () => {
    mockedAskTutor.mockResolvedValue(answerReply());
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: "SCENE-002" }));

    await act(async () => {
      await result.current.sendMessage("¿Qué es Kubernetes?");
    });

    expect(mockedAskTutor).toHaveBeenCalledTimes(1);
    const [courseId, moduleId, topicId, body] = mockedAskTutor.mock.calls[0];
    expect(courseId).toBe("curso-demo");
    expect(moduleId).toBe("modulo-demo");
    expect(topicId).toBe("topico-demo");
    expect(body).toMatchObject({ message: "¿Qué es Kubernetes?", scene_id: "SCENE-002" });
  });

  it("2. loading es true durante la solicitud y false al terminar", async () => {
    let resolvePromise!: (value: unknown) => void;
    mockedAskTutor.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.sendMessage("hola");
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    resolvePromise(answerReply());
    await act(async () => {
      await pending;
    });
    expect(result.current.loading).toBe(false);
  });

  it("3. respuesta answer se agrega a la conversación", async () => {
    mockedAskTutor.mockResolvedValue(answerReply("Un Pod es la unidad mínima.", ["SRC-004"]));
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("¿Qué es un Pod?");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[1].role).toBe("assistant");
    expect(result.current.messages[1].content).toBe("Un Pod es la unidad mínima.");
    expect(result.current.messages[1].sourceRefs).toEqual(["SRC-004"]);
  });

  it("4. not_covered se muestra con el mensaje fijo determinístico", async () => {
    mockedAskTutor.mockResolvedValue({
      response_type: "not_covered",
      answer_chunks: [],
      clarification_question: null,
    });
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("¿Cuál es la capital de Francia?");
    });

    const assistantMessage = result.current.messages[1];
    expect(assistantMessage.content).toBe(NOT_COVERED_MESSAGE);
    expect(assistantMessage.responseType).toBe("not_covered");
  });

  it("5. clarification se muestra con la pregunta de aclaración", async () => {
    mockedAskTutor.mockResolvedValue({
      response_type: "clarification",
      answer_chunks: [],
      clarification_question: "¿A cuál concepto te referís?",
    });
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("¿Y eso?");
    });

    expect(result.current.messages[1].content).toBe("¿A cuál concepto te referís?");
    expect(result.current.messages[1].responseType).toBe("clarification");
  });

  it("6. un error controlado se refleja en `error`, sin romper la conversación", async () => {
    mockedAskTutor.mockRejectedValue(new ApiError(503, "El proveedor LLM configurado no tiene credencial."));
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("hola");
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.title).toBe("IA no configurada");
    expect(result.current.loading).toBe(false);
  });

  it("14. la historia enviada al backend se limita a los últimos 10 mensajes", async () => {
    mockedAskTutor.mockResolvedValue(answerReply());
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await result.current.sendMessage(`pregunta ${i}`);
      });
    }
    // 6 preguntas -> 12 mensajes en la conversación completa (6 user + 6 assistant).
    expect(result.current.messages).toHaveLength(12);

    // Pero el historial ENVIADO en la última llamada nunca supera 10.
    const lastCall = mockedAskTutor.mock.calls[mockedAskTutor.mock.calls.length - 1];
    const lastCallBody = lastCall[3];
    expect(lastCallBody.recent_history.length).toBeLessThanOrEqual(10);
  });

  it("15. limpiar conversación funciona", async () => {
    mockedAskTutor.mockResolvedValue(answerReply());
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("hola");
    });
    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearConversation();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // --------------------------------------------------------------------
  // v1.4.0 (Bloque 3 -- "Provenance UX + Related Topic Navigation")
  // --------------------------------------------------------------------

  it("16. respuesta legacy (v1.3.0, sin course_answer_chunks/course_sources) se normaliza sin romper", async () => {
    mockedAskTutor.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "Un Pod agrupa contenedores.", source_refs: ["SRC-002"] }],
      general_knowledge_chunks: [],
      clarification_question: null,
      general_knowledge_used: false,
    });
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("¿Qué es un Pod?");
    });

    const assistantMessage = result.current.messages[1];
    expect(assistantMessage.content).toBe("Un Pod agrupa contenedores.");
    expect(assistantMessage.provenance).toEqual({
      currentTopicTexts: ["Un Pod agrupa contenedores."],
      courseTexts: [],
      generalTexts: [],
      courseSources: [],
    });
  });

  it("17. course_answer_chunks se separa de answer_chunks/general_knowledge_chunks en provenance", async () => {
    mockedAskTutor.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [],
      course_answer_chunks: [
        { text: "Evolucioná una API sin romper clientes viejos.", source_refs: ["COURSE-SRC-001"] },
      ],
      course_sources: [
        {
          ref: "COURSE-SRC-001",
          module_id: "diseno-tecnico-especificado",
          module_title: "Diseño Técnico Especificado",
          topic_id: "diseno-de-apis-y-contratos-evolutivos",
          topic_title: "Diseño de APIs y contratos evolutivos",
          original_source_ref: "SRC-017",
          heading_path: ["Diseño de APIs y contratos evolutivos", "Práctica guiada"],
        },
      ],
      general_knowledge_chunks: [],
      clarification_question: null,
      general_knowledge_used: false,
    });
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("¿Cómo se diseñan contratos de API evolutivos?");
    });

    const assistantMessage = result.current.messages[1];
    expect(assistantMessage.provenance?.currentTopicTexts).toEqual([]);
    expect(assistantMessage.provenance?.courseTexts).toEqual([
      "Evolucioná una API sin romper clientes viejos.",
    ]);
    expect(assistantMessage.provenance?.courseSources).toHaveLength(1);
    expect(assistantMessage.provenance?.courseSources[0].topic_id).toBe(
      "diseno-de-apis-y-contratos-evolutivos"
    );
    // Nunca filtra por SRC-XXX del tópico actual -- sourceRefs (para el
    // panel de grounding en desarrollo) sigue vacío porque answer_chunks
    // está vacío, aunque haya course_answer_chunks.
    expect(assistantMessage.sourceRefs).toEqual([]);
  });

  it("18. dos course_sources del mismo tópico se deduplican en provenance.courseSources", async () => {
    mockedAskTutor.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [],
      course_answer_chunks: [
        { text: "Primera afirmación.", source_refs: ["COURSE-SRC-001"] },
        { text: "Segunda afirmación.", source_refs: ["COURSE-SRC-002"] },
      ],
      course_sources: [
        {
          ref: "COURSE-SRC-001",
          module_id: "modulo-x",
          module_title: "Módulo X",
          topic_id: "topico-x",
          topic_title: "Tópico X",
          original_source_ref: "SRC-001",
          heading_path: [],
        },
        {
          ref: "COURSE-SRC-002",
          module_id: "modulo-x",
          module_title: "Módulo X",
          topic_id: "topico-x",
          topic_title: "Tópico X",
          original_source_ref: "SRC-004",
          heading_path: [],
        },
      ],
      general_knowledge_chunks: [],
      clarification_question: null,
      general_knowledge_used: false,
    });
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("pregunta");
    });

    expect(result.current.messages[1].provenance?.courseSources).toHaveLength(1);
  });

  it("19. course_sources sin course_answer_chunks (respuesta inconsistente) nunca produce related topics fantasma", async () => {
    mockedAskTutor.mockResolvedValue({
      response_type: "answer",
      answer_chunks: [{ text: "Texto del tópico actual.", source_refs: ["SRC-002"] }],
      course_answer_chunks: [],
      course_sources: [
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
      general_knowledge_chunks: [],
      clarification_question: null,
      general_knowledge_used: false,
    });
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    await act(async () => {
      await result.current.sendMessage("pregunta");
    });

    expect(result.current.messages[1].provenance?.courseSources).toEqual([]);
  });

  it("no envía una solicitud si ya hay una en curso (evita doble envío)", async () => {
    let resolvePromise!: (value: unknown) => void;
    mockedAskTutor.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    const { result } = renderHook(() => useTutor({ ...IDS, sceneId: null }));

    let firstCall: Promise<unknown>;
    act(() => {
      firstCall = result.current.sendMessage("primera");
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      await result.current.sendMessage("segunda mientras carga");
    });

    expect(mockedAskTutor).toHaveBeenCalledTimes(1);

    resolvePromise(answerReply());
    await act(async () => {
      await firstCall;
    });
  });
});
