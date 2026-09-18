import type { ExamQuestionView } from "../types/api";

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
 * single_choice, checkbox para multiple_choice. */
export function QuestionPlayer({
  question,
  index,
  total,
  selectedOptionIds,
  onChange,
  disabled,
}: QuestionPlayerProps) {
  const isMultiple = question.question_type === "multiple_choice";

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
                name={`question-${question.question_id}`}
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
    </div>
  );
}
