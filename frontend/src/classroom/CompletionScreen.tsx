import type { LessonPlan } from "../types/api";

export interface CompletionScreenProps {
  lesson: LessonPlan;
  onRepeat: () => void;
  onBackToCourse: () => void;
}

/** Experiencia de cierre al llegar al final de una LessonPlan (Fase 4).
 * Muestra el recap ya generado (grounded, Fase 3) — no certificación, no
 * scoring: eso queda para una fase posterior. */
export function CompletionScreen({ lesson, onRepeat, onBackToCourse }: CompletionScreenProps) {
  return (
    <div className="completion-screen">
      <span className="completion-screen__badge">✓ Tema completado</span>
      <h3 className="completion-screen__title">{lesson.lesson_title.text}</h3>
      {lesson.recap.length > 0 && (
        <ul className="completion-screen__recap">
          {lesson.recap.map((item, i) => (
            <li key={i}>{item.text}</li>
          ))}
        </ul>
      )}
      <div className="completion-screen__actions">
        <button type="button" className="completion-screen__button" onClick={onRepeat}>
          ↻ Repetir tema
        </button>
        <button
          type="button"
          className="completion-screen__button completion-screen__button--primary"
          onClick={onBackToCourse}
        >
          Volver al curso →
        </button>
      </div>
    </div>
  );
}
