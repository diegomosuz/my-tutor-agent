import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { MicroCheckVerdict, TutorMicroCheck } from "../types/api";
import { describeTutorError } from "./tutorErrors";

const VERDICT_LABELS: Record<MicroCheckVerdict, string> = {
  correct: "Correcto",
  partially_correct: "Parcialmente correcto",
  needs_revision: "A revisar",
  unclear: "No queda claro",
};

export interface MicroCheckCardProps {
  courseId: string;
  moduleId: string;
  topicId: string;
  microCheck: TutorMicroCheck;
}

/**
 * Tarjeta compacta de un micro-check formativo (v1.8.0, Bloque 4:
 * "ADAPTIVE INTERACTION & FORMATIVE MICRO-CHECKS") -- se renderiza
 * DEBAJO de la respuesta del tutor a la que pertenece, nunca como modal
 * ni pantalla separada (PARTE 47).
 *
 * Estado 100% EFÍMERO (PARTE 50/51): vive únicamente en `useState` de
 * este componente -- nunca localStorage, nunca sessionStorage, nunca
 * persistido en el backend. Un refresh de página lo hace desaparecer por
 * completo (junto con toda la conversación del tutor, que ya funciona
 * así desde Fase 5) -- comportamiento aceptado y documentado
 * explícitamente (docs/ADAPTIVE_TUTOR_V1_8.md sección Bloque 4).
 *
 * Nunca dispara Certification/Guided Review/completar el tópico: el
 * único efecto de responder es mostrar feedback formativo en esta misma
 * tarjeta (PARTE 45/65/66/67).
 */
export function MicroCheckCard({ courseId, moduleId, topicId, microCheck }: MicroCheckCardProps) {
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<MicroCheckVerdict | null>(null);
  const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); // nunca auto-submit (PARTE 53): solo se evalúa al enviar el form explícitamente
    if (!answer.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.evaluateMicroCheckFeedback(courseId, moduleId, topicId, {
        micro_check_question: microCheck.question.text,
        student_answer: answer,
      });
      setVerdict(result.verdict);
      setFeedbackText(result.feedback.text);
    } catch (err) {
      setError(describeTutorError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleRetry() {
    setAnswer("");
    setVerdict(null);
    setFeedbackText(null);
    setError(null);
  }

  return (
    <div className="micro-check-card" role="group" aria-label="Comprobación rápida">
      <p className="micro-check-card__title">Comprobemos la idea</p>
      <p className="micro-check-card__question">{microCheck.question.text}</p>

      {!verdict && (
        <form className="micro-check-card__form" onSubmit={handleSubmit}>
          <label className="micro-check-card__label" htmlFor={`micro-check-answer-${microCheck.question.text.length}`}>
            Tu respuesta
          </label>
          <input
            id={`micro-check-answer-${microCheck.question.text.length}`}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Escribí tu respuesta…"
            maxLength={4000}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !answer.trim()}>
            {loading ? "Evaluando…" : "Responder"}
          </button>
        </form>
      )}

      {error && (
        <div className="micro-check-card__error">
          <p className="tutor-panel__error-title">{error.title}</p>
          <p>{error.detail}</p>
        </div>
      )}

      {verdict && feedbackText && (
        <div className={`micro-check-card__result micro-check-card__result--${verdict}`}>
          <span className="micro-check-card__verdict">{VERDICT_LABELS[verdict]}</span>
          <p className="micro-check-card__feedback">{feedbackText}</p>
          <button type="button" className="micro-check-card__retry" onClick={handleRetry}>
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
