// Guided Review Session (v1.6.0, Bloque 3) — banner compacto de
// "Repaso guiado" dentro de Classroom. Reutiliza el Classroom EXISTENTE
// (nunca una segunda pantalla) y la navegación curricular real
// (`goToTopic`, ver ClassroomPage.tsx) — este componente es puramente
// presentacional, no decide nada: recibe el `ResolvedGuidedReviewStep`
// ya calculado y solo dispara los callbacks que el llamador implementa.
//
// Nunca reemplaza "Tema anterior/siguiente" curricular (PARTE 20): es
// una dimensión de navegación DISTINTA, con su propio texto explícito
// ("de repaso") para que quede claro que no son el mismo control.
import type { ResolvedGuidedReviewStep } from "../learning/guidedReviewSession";

export interface GuidedReviewBannerProps {
  step: ResolvedGuidedReviewStep;
  /** true si el tópico actualmente mostrado en Classroom es exactamente
   * `step.ref` -- false significa que el alumno navegó fuera del plan
   * (tema relacionado, nav curricular, browser Back) y la sesión quedó
   * "en pausa" (PARTE 23/24: nunca se infiere/avanza el índice por esto). */
  isOnPlanTopic: boolean;
  onNextReview: () => void;
  onPrevReview: () => void;
  onFinishReview: () => void;
  onReturnToReview: () => void;
  onExitReview: () => void;
}

export function GuidedReviewBanner({
  step,
  isOnPlanTopic,
  onNextReview,
  onPrevReview,
  onFinishReview,
  onReturnToReview,
  onExitReview,
}: GuidedReviewBannerProps) {
  if (!isOnPlanTopic) {
    return (
      <div className="guided-review-banner guided-review-banner--paused" role="status">
        <span className="guided-review-banner__label">Repaso guiado en pausa</span>
        <div className="guided-review-banner__actions">
          <button type="button" className="guided-review-banner__action" onClick={onReturnToReview}>
            Volver al repaso
          </button>
          <button
            type="button"
            className="guided-review-banner__action guided-review-banner__action--exit"
            onClick={onExitReview}
          >
            Salir del repaso
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="guided-review-banner" role="status">
      <span className="guided-review-banner__label">
        Repaso guiado · Tema {step.position} de {step.total}
      </span>
      <div className="guided-review-banner__actions">
        <button
          type="button"
          className="guided-review-banner__action"
          onClick={onPrevReview}
          disabled={step.isFirst}
          aria-label="Anterior del repaso"
        >
          ← Anterior de repaso
        </button>
        {step.isLast ? (
          <button type="button" className="guided-review-banner__action guided-review-banner__action--finish" onClick={onFinishReview}>
            Finalizar repaso
          </button>
        ) : (
          <button
            type="button"
            className="guided-review-banner__action"
            onClick={onNextReview}
            aria-label="Siguiente del repaso"
          >
            Siguiente de repaso →
          </button>
        )}
        <button
          type="button"
          className="guided-review-banner__action guided-review-banner__action--exit"
          onClick={onExitReview}
        >
          Salir del repaso
        </button>
      </div>
    </div>
  );
}
