import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { TutorCourseSource, TutorMessage, TutorReplyBody } from "../types/api";
import { dedupeCourseSourcesByTopic } from "./courseSources";
import { describeTutorError } from "./tutorErrors";

// Límite espejo del backend (TutorRequest.recent_history, máximo 10
// mensajes) — nunca tiene sentido enviar más de lo que el backend acepta.
const MAX_HISTORY_MESSAGES = 10;

// v1.4.0 (Bloque 3, PARTE 21): el copy anterior ("Podés preguntarme sobre
// el contenido visible de este tema") sugería que el tutor solo conoce el
// tópico actual -- desde el Bloque 2 esto ya no es así: `not_covered` en
// modo estricto significa que NI el tópico actual NI el resto del curso
// alcanzan para responder (ver docs/COURSE_GROUNDED_TUTOR_V1_4.md
// sección 18), no que el tutor esté limitado a un solo tema.
export const NOT_COVERED_MESSAGE =
  "Este tema y el resto del curso no contienen información suficiente para responder eso. Podés preguntarme sobre el contenido del curso.";

// v1.3.0 (Classroom UX -- Tutor Expanded Mode): solo puede ocurrir cuando
// el alumno activó "Ampliar con conocimiento general" -- en modo estricto
// el backend nunca produce response_type="unrelated" (ver REGLA 20/backend
// PARTE 22-24). El backend redacta el mensaje fijo del lado del frontend,
// igual que NOT_COVERED_MESSAGE: el LLM nunca compone este texto.
// v1.3.0 (BLOQUE 6): el copy se actualiza para reflejar que la relevancia
// ya no se limita al tema actual, sino también al ámbito del curso
// (CourseScope, REGLA 22) -- "unrelated" ahora significa "ni el tema ni
// el curso", no solo "ni el tema".
export const UNRELATED_MESSAGE =
  "Esa pregunta no parece estar relacionada con este tema ni con el resto del curso. Puedo ayudarte con preguntas sobre el contenido de este tema o de otros temas del curso, incluso yendo un poco más allá con conocimiento general, pero no con temas sin relación.";

/**
 * v1.4.0 (Bloque 3): provenance estructurada de una respuesta
 * `response_type="answer"` -- preserva los TRES canales grounded
 * separados (tópico actual / resto del curso / conocimiento general) en
 * vez de aplanarlos en un único string, para que la UI pueda mostrar de
 * dónde viene cada parte (ver `TutorConversation.tsx`). Reemplaza al
 * flag genérico `generalKnowledgeUsed` de v1.3.0: la misma información
 * (¿hay conocimiento general acá?) ahora se deriva de
 * `generalTexts.length > 0`, con la ventaja de que también distingue el
 * canal de curso, que v1.3.0 no tenía.
 */
export interface TutorAnswerProvenance {
  currentTopicTexts: string[];
  courseTexts: string[];
  generalTexts: string[];
  /** Deduplicado por tópico (`dedupeCourseSourcesByTopic`), en el orden
   * de relevancia real del retrieval. Vacío si `courseTexts` está vacío,
   * incluso si el backend (respuesta legacy o inconsistente) trajera
   * `course_sources` sin `course_answer_chunks` -- nunca se muestra una
   * sección "Temas relacionados" sin contenido de curso real que la
   * respalde. */
  courseSources: TutorCourseSource[];
}

export interface TutorConversationMessage {
  id: string;
  role: "user" | "assistant";
  /** Texto plano de fallback: se usa para el mensaje del alumno, para
   * clarification/unrelated/not_covered, y como historial enviado al
   * backend (`buildRecentHistory`) incluso para "answer" -- nunca para
   * RENDERIZAR una respuesta "answer" (eso usa `provenance`). */
  content: string;
  responseType?: TutorReplyBody["response_type"];
  /** Solo presente en mensajes del tutor de tipo "answer"; nunca se
   * muestra al alumno, solo en el panel de grounding en desarrollo.
   * Exclusivamente SRC-XXX del tópico actual (nunca COURSE-SRC-XXX: el
   * panel de grounding solo puede resolver SourceBlocks del tópico
   * actual, ver ClassroomPage/GroundingPanel). */
  sourceRefs?: string[];
  /** Solo presente en mensajes del tutor de tipo "answer". */
  provenance?: TutorAnswerProvenance;
}

function replyToMessage(reply: TutorReplyBody): TutorConversationMessage {
  if (reply.response_type === "answer") {
    const currentTopicTexts = reply.answer_chunks.map((chunk) => chunk.text);
    const courseTexts = (reply.course_answer_chunks ?? []).map((chunk) => chunk.text);
    const generalTexts = reply.general_knowledge_chunks;
    const courseSources =
      courseTexts.length > 0 ? dedupeCourseSourcesByTopic(reply.course_sources ?? []) : [];
    const content = [...currentTopicTexts, ...courseTexts, ...generalTexts].join("\n\n");
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      responseType: "answer",
      sourceRefs: Array.from(new Set(reply.answer_chunks.flatMap((c) => c.source_refs))),
      provenance: { currentTopicTexts, courseTexts, generalTexts, courseSources },
    };
  }
  if (reply.response_type === "clarification") {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: reply.clarification_question ?? "",
      responseType: "clarification",
    };
  }
  if (reply.response_type === "unrelated") {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: UNRELATED_MESSAGE,
      responseType: "unrelated",
    };
  }
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: NOT_COVERED_MESSAGE,
    responseType: "not_covered",
  };
}

function buildRecentHistory(messages: TutorConversationMessage[]): TutorMessage[] {
  return messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 4000),
  }));
}

export interface UseTutorParams {
  courseId: string | undefined;
  moduleId: string | undefined;
  topicId: string | undefined;
  sceneId: string | null;
  /** Se llama justo antes de disparar la primera solicitud de una nueva
   * pregunta — punto de integración para pausar la clase (sección 27). */
  onBeforeSend?: () => void;
}

export interface UseTutorResult {
  messages: TutorConversationMessage[];
  loading: boolean;
  error: { title: string; detail: string } | null;
  sendMessage: (text: string, allowGeneralKnowledge?: boolean) => Promise<TutorReplyBody | null>;
  clearConversation: () => void;
}

/** Conversación del tutor, en memoria React durante la sesión (nunca se
 * persiste en backend ni en base de datos — sección 53 de la
 * especificación de Fase 5). Se resetea al cambiar de tópico porque
 * `ClassroomPage` monta una instancia nueva de este hook por
 * curso/módulo/tópico (ver `key` en TutorPanel). */
export function useTutor({
  courseId,
  moduleId,
  topicId,
  sceneId,
  onBeforeSend,
}: UseTutorParams): UseTutorResult {
  const [messages, setMessages] = useState<TutorConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function sendMessage(
    text: string,
    allowGeneralKnowledge = false
  ): Promise<TutorReplyBody | null> {
    const trimmed = text.trim();
    if (!trimmed || loading || !courseId || !moduleId || !topicId) return null;

    onBeforeSend?.();
    setError(null);

    const userMessage: TutorConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const historyForRequest = buildRecentHistory(messages);
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const reply = await api.askTutor(
        courseId,
        moduleId,
        topicId,
        {
          message: trimmed,
          scene_id: sceneId,
          recent_history: historyForRequest,
          allow_general_knowledge: allowGeneralKnowledge,
        },
        controller.signal
      );
      setMessages((prev) => [...prev, replyToMessage(reply)]);
      return reply;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return null;
      }
      setError(describeTutorError(err instanceof ApiError ? err : err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  function clearConversation() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setLoading(false);
  }

  return { messages, loading, error, sendMessage, clearConversation };
}
