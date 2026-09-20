// v1.5.0 ("Guided Markdown Read Aloud"): UI del Reader -- ubicada junto al
// panel de Markdown y a "Tema anterior/siguiente" (PARTE 32), nunca
// debajo del Tutor. Presentacional: toda la lógica vive en
// `useReadAloud.ts`.
import { READ_ALOUD_RATE_OPTIONS, type ReadAloudRate } from "./classroomStorage";
import type { UseReadAloudResult } from "./useReadAloud";

export interface ReadAloudControlsProps {
  reader: UseReadAloudResult;
}

const RATE_LABELS: Record<ReadAloudRate, string> = {
  0.75: "0.75×",
  1.0: "1×",
  1.25: "1.25×",
  1.5: "1.5×",
  2.0: "2×",
};

const MAIN_LABEL: Record<UseReadAloudResult["state"], string> = {
  idle: "🔊 Leer tema",
  loading: "Cargando…",
  playing: "⏸ Pausar lectura",
  paused: "▶ Continuar lectura",
  completed: "🔁 Leer nuevamente",
  error: "🔊 Reintentar lectura",
};

export function ReadAloudControls({ reader }: ReadAloudControlsProps) {
  const { state, rate, setRate, play, pause, resume, stop, disabled, errorMessage } = reader;

  function handleMainClick() {
    if (state === "playing") pause();
    else if (state === "paused") resume();
    else play();
  }

  const showStop = state === "playing" || state === "paused" || state === "loading";

  return (
    <div className="read-aloud-controls">
      <button
        type="button"
        className="read-aloud-controls__main"
        onClick={handleMainClick}
        disabled={disabled || state === "loading"}
        aria-label={MAIN_LABEL[state] + " (contenido del tema)"}
      >
        {MAIN_LABEL[state]}
      </button>

      {showStop && (
        <button
          type="button"
          className="read-aloud-controls__stop"
          onClick={stop}
          aria-label="Detener lectura del tema"
          title="Detener"
        >
          ■
        </button>
      )}

      <select
        className="read-aloud-controls__rate"
        value={rate}
        onChange={(e) => setRate(Number.parseFloat(e.target.value) as ReadAloudRate)}
        aria-label="Velocidad de lectura del tema"
      >
        {READ_ALOUD_RATE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {RATE_LABELS[option]}
          </option>
        ))}
      </select>

      {state === "error" && errorMessage && (
        <span className="read-aloud-controls__error" role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
