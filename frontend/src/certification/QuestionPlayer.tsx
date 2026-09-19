import { useEffect, useRef, useState } from "react";
import type { ExamQuestionView } from "../types/api";
import { speakSequenceUnified } from "../classroom/voicePlayback";
import { useVoicePreference } from "../classroom/useVoicePreference";
import { isSpeechSupported } from "../classroom/speech";

export interface QuestionPlayerProps {
  question: ExamQuestionView;
  index: number;
  total: number;
  selectedOptionIds: string[];
  onChange: (optionIds: string[]) => void;
  disabled?: boolean;
}

/** Renderiza el stem y las opciones de UNA pregunta como texto React
 * plano (nunca `dangerouslySetInnerHTML`): el stem/las opciones son
 * siempre texto generado por el LLM, nunca interpretado como HTML/Markdown
 * (sección 30 de Fase 5, mismo principio en Fase 6). Radio para
 * single_choice, checkbox para multiple_choice.
 *
 * "Leer pregunta" (Fase 7, sección 32) reutiliza el mismo subsistema de
 * voz que el resto de la app: lee SOLO stem + opciones, NUNCA la
 * respuesta correcta ni la explicación (esta vista, `ExamQuestionView`,
 * estructuralmente no las tiene — ver `types/api.ts`). */
export function QuestionPlayer({
  question,
  index,
  total,
  selectedOptionIds,
  onChange,
  disabled,
}: QuestionPlayerProps) {
  const isMultiple = question.question_type === "multiple_choice";
  const { useNeural } = useVoicePreference();
  const speechSupported = isSpeechSupported();
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const cancelReadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cancelReadRef.current?.();
    };
  }, []);

  // Cancelar la lectura en curso al cambiar de pregunta. question_id por
  // sí solo no identifica una pregunta de forma única dentro de un examen
  // (cada QuestionBank numera su propio Q-001, Q-002, ...), por eso se
  // incluye bank_id en la dependencia.
  useEffect(() => {
    cancelReadRef.current?.();
    setIsReading(false);
  }, [question.bank_id, question.question_id]);

  function toggleOption(optionId: string) {
    if (disabled) return;
    if (isMultiple) {
      const next = selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId];
      onChange(next);
    } else {
      onChange([optionId]);
    }
  }

  function handleReadQuestion() {
    cancelReadRef.current?.();
    setReadError(null);
    const texts = [
      question.stem,
      ...question.options.map((o) => `Opción ${o.option_id}: ${o.text}`),
    ];
    setIsReading(true);
    cancelReadRef.current = speakSequenceUnified(texts, {
      useNeural,
      onDone: () => setIsReading(false),
      onNeuralError: (message) => {
        setReadError(message);
        setIsReading(false);
      },
    });
  }

  function handleStopReading() {
    cancelReadRef.current?.();
    setIsReading(false);
  }

  return (
    <div className="cert-question">
      <div className="cert-question__meta">
        <span>
          Pregunta {index + 1} de {total}
        </span>
        {isMultiple && <span className="cert-question__hint">Seleccioná todas las que correspondan</span>}
      </div>
      <p className="cert-question__stem">{question.stem}</p>
      <div className="cert-question__options" role={isMultiple ? "group" : "radiogroup"}>
        {question.options.map((option) => {
          const checked = selectedOptionIds.includes(option.option_id);
          return (
            <label
              key={option.option_id}
              className={
                "cert-option" + (checked ? " cert-option--selected" : "") + (disabled ? " cert-option--disabled" : "")
              }
            >
              <input
                type={isMultiple ? "checkbox" : "radio"}
                name={`question-${question.bank_id}-${question.question_id}`}
                checked={checked}
                disabled={disabled}
                onChange={() => toggleOption(option.option_id)}
              />
              <span className="cert-option__id">{option.option_id}</span>
              <span className="cert-option__text">{option.text}</span>
            </label>
          );
        })}
      </div>
      {(speechSupported || useNeural) && (
        <div className="cert-question__voice">
          <button type="button" onClick={isReading ? handleStopReading : handleReadQuestion}>
            {isReading ? "⏹ Detener lectura" : "🔊 Leer pregunta"}
          </button>
          {useNeural && <span className="voice-disclosure">Voz generada por IA</span>}
          {readError && <span className="cert-question__voice-error">{readError}</span>}
        </div>
      )}
    </div>
  );
}
