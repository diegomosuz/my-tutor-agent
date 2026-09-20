import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AiStatusResponse } from "../types/api";
import { claimAiAudioPriority } from "./readAloudPriority";
import { speakSequenceUnified } from "./voicePlayback";
import { TutorConversation } from "./TutorConversation";
import { NOT_COVERED_MESSAGE, UNRELATED_MESSAGE, useTutor } from "./useTutor";
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
  /** Fase 7: si true, intenta voz neural (OpenAI TTS) en vez de Web
   * Speech API para leer la respuesta del tutor. */
  useNeuralVoice?: boolean;
  isInterrupting: boolean;
  onInterrupt: () => void;
  onContinueClass: () => void;
  onInspectRef?: (ref: string) => void;
  /** v1.4.0 (Bloque 3): "Ver tema relacionado" -- reutiliza la navegación
   * curricular ya existente (goToTopic en ClassroomPage), nunca un
   * segundo sistema de routing. */
  onNavigateToTopic?: (moduleId: string, topicId: string) => void;
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
  useNeuralVoice = false,
  isInterrupting,
  onInterrupt,
  onContinueClass,
  onInspectRef,
  onNavigateToTopic,
}: TutorPanelProps) {
  const [question, setQuestion] = useState("");
  const [neuralVoiceError, setNeuralVoiceError] = useState<string | null>(null);
  // v1.3.0 (Classroom UX -- Tutor Expanded Mode): estado de sesión/local
  // puro -- nunca localStorage, nunca Learning Progress, nunca analytics.
  // TutorPanel se remonta con una key nueva por tópico (ver ClassroomPage),
  // así que este useState ya vuelve a false en cada tópico nuevo sin lógica
  // adicional; al cambiar de escena (sin remount) se mantiene tal cual.
  const [allowGeneralKnowledge, setAllowGeneralKnowledge] = useState(false);
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
    const reply = await tutor.sendMessage(text, allowGeneralKnowledge);
    if (reply && voiceEnabled) {
      // v1.4.0 (Bloque 3): course_answer_chunks faltaba acá -- una
      // respuesta cross-topic (answer_chunks=[], todo en
      // course_answer_chunks, ver Bloque 2) quedaba en silencio total con
      // la voz activada. Mismo criterio que answer_chunks/
      // general_knowledge_chunks: se lee tal cual, sin reformular.
      const texts =
        reply.response_type === "answer"
          ? [
              ...reply.answer_chunks.map((chunk) => chunk.text),
              ...(reply.course_answer_chunks ?? []).map((chunk) => chunk.text),
              ...reply.general_knowledge_chunks,
            ]
          : reply.response_type === "clarification"
            ? [reply.clarification_question ?? ""]
            : reply.response_type === "unrelated"
              ? [UNRELATED_MESSAGE]
              : [NOT_COVERED_MESSAGE];
      // Cancela explícitamente la secuencia anterior (marca su propia
      // cadena como cancelada) ANTES de arrancar una nueva: algunos
      // navegadores disparan "onend" al cancelar una utterance, lo que
      // podría hacer que la cadena vieja siga hablando el chunk siguiente
      // si no se le avisa que está cancelada. speakSequenceUnified también
      // cancela ambos backends internamente al arrancar, así que nunca se
      // superponen dos voces en ningún caso.
      cancelTutorVoiceRef.current?.();
      setNeuralVoiceError(null);
      // v1.5.0 (PARTE 7/44): la voz del tutor también gana frente al
      // Markdown Reader -- se detiene antes de arrancar, nunca compiten.
      claimAiAudioPriority();
      cancelTutorVoiceRef.current = speakSequenceUnified(texts, {
        useNeural: useNeuralVoice,
        rate: voiceRate,
        onNeuralError: (message) => setNeuralVoiceError(message),
      });
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
        onNavigateToTopic={onNavigateToTopic}
      />

      {tutor.loading && <p className="tutor-panel__loading">El tutor está pensando…</p>}

      {tutor.error && (
        <div className="tutor-panel__error">
          <p className="tutor-panel__error-title">{tutor.error.title}</p>
          <p>{tutor.error.detail}</p>
        </div>
      )}

      {voiceEnabled && useNeuralVoice && !neuralVoiceError && (
        <span className="voice-disclosure">Voz generada por IA</span>
      )}
      {neuralVoiceError && (
        <div className="voice-neural-error">
          <span>{neuralVoiceError}</span>
          <button type="button" onClick={() => setNeuralVoiceError(null)}>
            Cerrar
          </button>
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

      <div className="tutor-panel__expanded-mode">
        <label className="tutor-panel__expanded-mode-toggle">
          <input
            type="checkbox"
            checked={allowGeneralKnowledge}
            onChange={(e) => setAllowGeneralKnowledge(e.target.checked)}
          />
          Ampliar con conocimiento general
        </label>
        <p className="tutor-panel__expanded-mode-help">
          Permite complementar las respuestas con conocimiento general cuando el contenido del
          curso no es suficiente.
        </p>
      </div>

      <div className="tutor-panel__footer">
        {tutor.messages.length > 0 && (
          <button type="button" className="tutor-panel__clear" onClick={tutor.clearConversation}>
            Limpiar conversación
          </button>
        )}
        {/* v1.4.0 (Bloque 3, PARTE 20/21): "apagado" ya NO significa "solo
            este tema" -- desde el Bloque 2, el tutor siempre puede usar el
            resto del curso además del tópico actual; el switch controla
            EXCLUSIVAMENTE si además se permite conocimiento general. */}
        <p className="tutor-panel__hint">
          {allowGeneralKnowledge
            ? "Modo ampliado activo: el tutor puede complementar con conocimiento general de IA cuando ni este tema ni el resto del curso alcanzan para responder."
            : "El tutor responde únicamente con contenido demostrado por el curso (este tema u otros temas relacionados), sin conocimiento general."}
        </p>
      </div>
    </div>
  );
}
