import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AiStatusResponse } from "../types/api";
import { speakSequence } from "./speech";
import { TutorConversation } from "./TutorConversation";
import { NOT_COVERED_MESSAGE, useTutor } from "./useTutor";
import { useSpeechRecognition } from "./useSpeechRecognition";

const SUGGESTIONS = [
  "Explícame esta escena de otra manera",
  "¿Qué conceptos debo recordar?",
  "Resumí esta parte",
  "¿Qué diferencia hay entre los conceptos mencionados?",
];

export interface TutorPanelProps {
  courseId: string | undefined;
  moduleId: string | undefined;
  topicId: string | undefined;
  sceneId: string | null;
  aiStatus: AiStatusResponse | null;
  voiceEnabled: boolean;
  voiceRate: number;
  isInterrupting: boolean;
  onInterrupt: () => void;
  onContinueClass: () => void;
  onInspectRef?: (ref: string) => void;
}

/**
 * Panel "Pregunta al asistente IA" (Fase 5): conversación real con el
 * tutor grounded. Nunca es una aplicación de chat separada — sigue siendo
 * un panel acotado dentro del aula (sección 26).
 */
export function TutorPanel({
  courseId,
  moduleId,
  topicId,
  sceneId,
  aiStatus,
  voiceEnabled,
  voiceRate,
  isInterrupting,
  onInterrupt,
  onContinueClass,
  onInspectRef,
}: TutorPanelProps) {
  const [question, setQuestion] = useState("");
  const tutor = useTutor({ courseId, moduleId, topicId, sceneId, onBeforeSend: onInterrupt });
  const recognition = useSpeechRecognition();
  const cancelTutorVoiceRef = useRef<(() => void) | null>(null);

  // Coloca el transcript final del micrófono en el input, SIN enviarlo
  // automáticamente: el alumno decide si lo edita y lo envía (sección 29).
  useEffect(() => {
    if (recognition.transcript) {
      setQuestion(recognition.transcript);
      recognition.resetTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recognition.transcript]);

  // Cancelar cualquier lectura de la respuesta del tutor al desmontar.
  useEffect(() => {
    return () => {
      cancelTutorVoiceRef.current?.();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = question;
    if (!text.trim() || tutor.loading) return; // evita doble envío
    setQuestion("");
    const reply = await tutor.sendMessage(text);
    if (reply && voiceEnabled) {
      const texts =
        reply.response_type === "answer"
          ? reply.answer_chunks.map((chunk) => chunk.text)
          : reply.response_type === "clarification"
            ? [reply.clarification_question ?? ""]
            : [NOT_COVERED_MESSAGE];
      // Cancela explícitamente la secuencia anterior (marca su propia
      // cadena como cancelada) ANTES de arrancar una nueva: algunos
      // navegadores disparan "onend" al cancelar una utterance, lo que
      // podría hacer que la cadena vieja siga hablando el chunk siguiente
      // si no se le avisa que está cancelada. speakSequence también hace
      // su propio cancelSpeech() interno al arrancar, así que nunca se
      // superponen dos voces en ningún caso.
      cancelTutorVoiceRef.current?.();
      cancelTutorVoiceRef.current = speakSequence(texts, { rate: voiceRate });
    }
  }

  const aiConfigured = aiStatus?.configured ?? null;

  return (
    <div className="tutor-panel">
      <div className="tutor-panel__header">
        <span className="tutor-panel__icon" aria-hidden="true" />
        <h3>Pregunta al asistente IA</h3>
        {aiConfigured !== null && (
          <span
            className={
              "tutor-panel__ai-status " +
              (aiConfigured ? "tutor-panel__ai-status--on" : "tutor-panel__ai-status--off")
            }
          >
            {aiConfigured ? "● Agente IA activo" : "○ IA no configurada"}
          </span>
        )}
      </div>

      {isInterrupting && (
        <div className="tutor-panel__interrupt-banner">
          <span>La clase está en pausa mientras conversás con el tutor.</span>
          <button type="button" onClick={onContinueClass}>
            ▶ Continuar clase
          </button>
        </div>
      )}

      <TutorConversation
        messages={tutor.messages}
        showSourceRefs={import.meta.env.DEV}
        onInspectRef={onInspectRef}
      />

      {tutor.loading && <p className="tutor-panel__loading">El tutor está pensando…</p>}

      {tutor.error && (
        <div className="tutor-panel__error">
          <p className="tutor-panel__error-title">{tutor.error.title}</p>
          <p>{tutor.error.detail}</p>
        </div>
      )}

      <form className="tutor-panel__form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={aiConfigured === false ? "IA no configurada" : "Escribí tu pregunta sobre este tema…"}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={tutor.loading}
          maxLength={4000}
        />
        {recognition.supported ? (
          <button
            type="button"
            className={recognition.isListening ? "tutor-panel__mic tutor-panel__mic--active" : "tutor-panel__mic"}
            onClick={() => (recognition.isListening ? recognition.stop() : recognition.start())}
            disabled={tutor.loading}
            aria-pressed={recognition.isListening}
            aria-label={recognition.isListening ? "Detener dictado" : "Dictar pregunta por voz"}
            title={recognition.isListening ? "Detener dictado" : "Dictar pregunta por voz"}
          >
            🎤
          </button>
        ) : (
          <button
            type="button"
            className="tutor-panel__mic"
            disabled
            aria-label="Dictado por voz no disponible en este navegador"
            title="Dictado por voz no disponible en este navegador"
          >
            🎤
          </button>
        )}
        <button type="submit" disabled={tutor.loading || !question.trim()}>
          Enviar
        </button>
      </form>

      <div className="tutor-panel__suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="assistant-panel__chip"
            onClick={() => setQuestion(suggestion)}
            disabled={tutor.loading}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="tutor-panel__footer">
        {tutor.messages.length > 0 && (
          <button type="button" className="tutor-panel__clear" onClick={tutor.clearConversation}>
            Limpiar conversación
          </button>
        )}
        <p className="tutor-panel__hint">
          El tutor responde únicamente en base al contenido de este tema.
        </p>
      </div>
    </div>
  );
}
