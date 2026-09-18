import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { CheckpointEvaluationBody, LessonScene } from "../types/api";
import { speakSequenceUnified } from "./voicePlayback";
import { describeTutorError } from "./tutorErrors";

const VERDICT_LABELS: Record<string, string> = {
  correct: "Correcto",
  partially_correct: "Parcialmente correcto",
  incorrect: "Incorrecto",
  not_assessable: "No evaluable",
};

export interface CheckpointPanelProps {
  courseId: string;
  moduleId: string;
  topicId: string;
  scene: LessonScene;
  voiceEnabled: boolean;
  voiceRate: number;
  /** Fase 7: si true, intenta voz neural (OpenAI TTS) para leer el
   * feedback en vez de Web Speech API. */
  useNeuralVoice?: boolean;
}

/**
 * Comprobación de comprensión de una escena (Fase 5, sección 20/36).
 * `scene.interaction.expected_answer` NUNCA se muestra acá: es contexto
 * interno que el backend usa solo para el prompt del evaluador (ver
 * `checkpoint_service.py`). Lo que sí se muestra tras evaluar es
 * `result.ideal_answer`, un campo distinto, producido por la evaluación
 * misma y validado contra el material autorizado.
 */
export function CheckpointPanel({
  courseId,
  moduleId,
  topicId,
  scene,
  voiceEnabled,
  voiceRate,
  useNeuralVoice = false,
}: CheckpointPanelProps) {
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckpointEvaluationBody | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [neuralVoiceError, setNeuralVoiceError] = useState<string | null>(null);
  const cancelVoiceRef = useRef<(() => void) | null>(null);

  // Todos los hooks van ANTES de cualquier return condicional (reglas de
  // hooks de React); el chequeo de `interaction` decide solo el JSX final.
  useEffect(() => {
    return () => {
      cancelVoiceRef.current?.();
    };
  }, []);

  const interaction = scene.interaction;
  if (!interaction || interaction.interaction_type !== "comprehension_check") {
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!answer.trim() || loading) return; // evita doble envío
    setLoading(true);
    setError(null);
    try {
      const evaluation = await api.evaluateCheckpoint(courseId, moduleId, topicId, {
        scene_id: scene.scene_id,
        answer,
      });
      setResult(evaluation);
      if (voiceEnabled) {
        // Cancela cualquier lectura anterior (ej. un reintento rápido)
        // antes de empezar una nueva — nunca se superponen dos voces.
        cancelVoiceRef.current?.();
        setNeuralVoiceError(null);
        cancelVoiceRef.current = speakSequenceUnified(
          evaluation.feedback.map((chunk) => chunk.text),
          {
            useNeural: useNeuralVoice,
            rate: voiceRate,
            onNeuralError: (message) => setNeuralVoiceError(message),
          }
        );
      }
    } catch (err) {
      setError(describeTutorError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleRetry() {
    setAnswer("");
    setResult(null);
    setError(null);
  }

  return (
    <div className="checkpoint-panel">
      <h4 className="checkpoint-panel__title">Comprobación de comprensión</h4>
      <p className="checkpoint-panel__question">{interaction.question.text}</p>

      {!result && (
        <form className="checkpoint-panel__form" onSubmit={handleSubmit}>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Escribí tu respuesta…"
            maxLength={4000}
            disabled={loading}
            rows={3}
          />
          <button type="submit" disabled={loading || !answer.trim()}>
            {loading ? "Evaluando…" : "Comprobar"}
          </button>
        </form>
      )}

      {error && (
        <div className="checkpoint-panel__error">
          <p className="tutor-panel__error-title">{error.title}</p>
          <p>{error.detail}</p>
        </div>
      )}

      {result && (
        <div className={`checkpoint-panel__result checkpoint-panel__result--${result.verdict}`}>
          <span className="checkpoint-panel__verdict">{VERDICT_LABELS[result.verdict]}</span>
          {result.feedback.map((chunk, i) => (
            <p key={i} className="checkpoint-panel__feedback">
              {chunk.text}
            </p>
          ))}
          {result.ideal_answer && (
            <div className="checkpoint-panel__ideal">
              <strong>Respuesta de referencia:</strong>
              <p>{result.ideal_answer.text}</p>
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
          <button type="button" className="checkpoint-panel__retry" onClick={handleRetry}>
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
