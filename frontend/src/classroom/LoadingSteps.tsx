import { useEffect, useState } from "react";

const STEPS = ["Analizando contenido", "Organizando explicación", "Preparando experiencia visual"];

/** Feedback visual mientras se genera una LessonPlan. Los pasos NO están
 * temporizados para simular exactitud con el backend (no hay un progreso
 * real medible desde el cliente): simplemente rotan mientras la solicitud
 * está en curso, como indicador de actividad. */
export function LoadingSteps() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="loading-steps" role="status" aria-live="polite">
      <span className="loading-steps__spinner" aria-hidden="true" />
      <span className="loading-steps__text">Preparando tu clase… {STEPS[stepIndex]}</span>
    </div>
  );
}
