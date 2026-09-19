import { useEffect, useState } from "react";

export interface AiOperationStatusProps {
  /** Mensaje mostrado apenas arranca la operación. */
  initialMessage: string;
  /** Mensaje mostrado si la operación sigue en curso pasado `delayMs` —
   * nunca describe una fase específica del backend (el frontend no puede
   * saberlo): solo avisa que puede tardar. */
  delayedMessage: string;
  /** Milisegundos antes de mostrar `delayedMessage`. */
  delayMs?: number;
}

/** Feedback de una operación con IA que puede tardar (v1.1.0, bloque de
 * performance, PARTE 10). Nunca inventa un porcentaje ni "fases" que el
 * cliente no puede conocer realmente (a diferencia del `LoadingSteps`
 * anterior, que rotaba nombres de fase fijos) — solo dos mensajes fijos,
 * el segundo aparece por tiempo transcurrido, nunca como telemetría real
 * del backend. Reusado en generación de clase y de práctica/simulacro de
 * certificación. */
export function AiOperationStatus({ initialMessage, delayedMessage, delayMs = 6000 }: AiOperationStatusProps) {
  const [showDelayed, setShowDelayed] = useState(false);

  useEffect(() => {
    setShowDelayed(false);
    const id = window.setTimeout(() => setShowDelayed(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  return (
    <div className="ai-operation-status" role="status" aria-live="polite">
      <span className="ai-operation-status__spinner" aria-hidden="true" />
      <span className="ai-operation-status__text">{showDelayed ? delayedMessage : initialMessage}</span>
    </div>
  );
}
