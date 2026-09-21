// v1.5.0 ("Guided Markdown Read Aloud"): hook de orquestación del Reader.
// Junta segmentación (readAloudSegments.ts), reproducción/prefetch
// (readAloudPlayer.ts), resaltado (readAloudHighlight.ts) y la señal de
// prioridad de IA (readAloudPriority.ts) en una máquina de estados chica
// (PARTE 9), sin introducir Redux/Zustand/contexto global nuevo -- mismo
// criterio que el resto del aula (`useClassroomEngine`, `useTutor`).
import { useCallback, useEffect, useRef, useState } from "react";
import { loadReadAloudRate, saveReadAloudRate, type ReadAloudRate } from "./classroomStorage";
import { prefersReducedMotion } from "./prefersReducedMotion";
import { isAiAudioActive, onAiAudioActiveChange, onAiAudioPriority } from "./readAloudPriority";
import {
  applyReadAloudHighlight,
  clearReadAloudHighlight,
  resolveSegmentRange,
} from "./readAloudHighlight";
import {
  configureReadAloudPlayer,
  pauseActiveSegment,
  playSegment,
  prefetchSegment,
  resumeActiveSegment,
  setReadAloudRate,
  stopReadAloudPlayer,
} from "./readAloudPlayer";
import { buildSpeechSegments, clearReadAloudBlockAttrs, type SpeechSegment } from "./readAloudSegments";

export type ReadAloudState = "idle" | "loading" | "playing" | "paused" | "completed" | "error";

export interface UseReadAloudParams {
  /** El contenedor donde vive el Markdown ya renderizado (SafeMarkdown) --
   * se segmenta y se resalta ADENTRO de este elemento, nunca fuera. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** false cuando el tab "Explicación" no está visible, o todavía no hay
   * tópico cargado -- el Reader nunca debe operar sobre contenido oculto. */
  active: boolean;
  /** Identidad del tópico actual (`course:module:topic`). Cualquier
   * cambio reinicia el Reader por completo (PARTE 38/39/40). */
  topicKey: string;
  useNeural: boolean;
  voice?: SpeechSynthesisVoice;
  /** true mientras la narración de la clase está habilitada (con o sin
   * pausa) -- el Reader queda deshabilitado, nunca la reemplaza (PARTE 8/45). */
  aiAudioSessionActive: boolean;
}

export interface UseReadAloudResult {
  state: ReadAloudState;
  rate: ReadAloudRate;
  setRate: (rate: ReadAloudRate) => void;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  hasReadableContent: boolean;
  errorMessage: string | null;
  disabled: boolean;
}

const PREFETCH_AHEAD = 2;

/** `scrollIntoView` con feature detection real (PARTE 20/21) -- jsdom y
 * algunos entornos no lo implementan; nunca debe romper el Reader por
 * esto, es una conveniencia visual, no una operación crítica. Respeta
 * `prefers-reduced-motion` (sin scroll suave) y usa `block: "nearest"`
 * para nunca mover más que el contenedor con scroll real (nunca la
 * ventana completa si el contenido ya está dentro del panel). */
function safeScrollIntoView(el: Element | null | undefined): void {
  if (!el || typeof el.scrollIntoView !== "function") return;
  try {
    el.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  } catch {
    // Algunos navegadores viejos solo aceptan un boolean -- degradación segura.
    try {
      el.scrollIntoView();
    } catch {
      // nunca romper el Reader por esto
    }
  }
}

export function useReadAloud({
  containerRef,
  active,
  topicKey,
  useNeural,
  voice,
  aiAudioSessionActive,
}: UseReadAloudParams): UseReadAloudResult {
  const [state, setState] = useState<ReadAloudState>("idle");
  const [rate, setRateState] = useState<ReadAloudRate>(() => loadReadAloudRate());
  const [hasReadableContent, setHasReadableContent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Bug real de hardening v1.5.0: `aiAudioSessionActive` (prop) solo
  // cubre la narración de escena; la voz del tutor/checkpoint/
  // certificación únicamente dispara `claimAiAudioPriority()` (un evento
  // puntual), así que sin esta señal complementaria el Reader volvía a
  // quedar habilitado apenas pasaba ese instante -- reiniciarlo a mitad
  // de una respuesta hablada de varios chunks producía audio superpuesto
  // (confirmado con instrumentación real de HTMLAudioElement). Refleja
  // "hay audio de IA sonando AHORA", marcado por `voicePlayback.ts`
  // (único choque de todos los consumidores de voz de IA), nunca por un
  // consumidor individual.
  const [aiVoiceActive, setAiVoiceActive] = useState(() => isAiAudioActive());

  const segmentsRef = useRef<SpeechSegment[]>([]);
  const currentIndexRef = useRef(0);
  const stateRef = useRef<ReadAloudState>("idle");
  stateRef.current = state;

  useEffect(() => {
    configureReadAloudPlayer({ useNeural, voice });
  }, [useNeural, voice]);
  useEffect(() => {
    setReadAloudRate(rate);
  }, [rate]);

  // Detiene la SESIÓN DE REPRODUCCIÓN actual (audio, prefetch, highlight,
  // epoch) y vuelve el índice a 0 -- exactamente lo que Stop y la
  // prioridad de IA deben hacer. Nunca toca `segmentsRef` ni el marcado
  // `data-read-aloud-block` del DOM: los SpeechSegments siguen siendo
  // válidos (mismo Markdown, mismo tópico) y una sesión NUEVA debe poder
  // arrancar de inmediato a partir de ellos -- Stop destruye la sesión de
  // reproducción, nunca inutiliza el Reader (bug real corregido, ver
  // docs/GUIDED_READ_ALOUD_V1_5.md).
  const stopPlaybackSession = useCallback(() => {
    stopReadAloudPlayer();
    clearReadAloudHighlight();
    currentIndexRef.current = 0;
  }, []);

  // Reset completo: además de lo anterior, invalida los SpeechSegments y
  // su marcado en el DOM -- exclusivo de un cambio de tópico/desmontaje,
  // donde el root actual ya no es válido o está por reconstruirse desde
  // cero (nunca de Stop/prioridad de IA, que sí deben preservar la
  // capacidad de iniciar una sesión nueva sobre el mismo tópico).
  const clearAll = useCallback(() => {
    stopPlaybackSession();
    const root = containerRef.current;
    if (root) clearReadAloudBlockAttrs(root);
    segmentsRef.current = [];
  }, [containerRef, stopPlaybackSession]);

  const hardStop = useCallback(
    (nextState: ReadAloudState = "idle") => {
      stopPlaybackSession();
      setErrorMessage(null);
      setState(nextState);
    },
    [stopPlaybackSession]
  );

  // Reconstruye la lista de segmentos legibles cada vez que cambia el
  // tópico o deja de estar activo -- nunca reusa segmentos de otro
  // tópico (evita leer/resaltar contenido que ya no está en pantalla).
  useEffect(() => {
    hardStop("idle");
    if (!active) {
      segmentsRef.current = [];
      setHasReadableContent(false);
      return;
    }
    const root = containerRef.current;
    if (!root) {
      segmentsRef.current = [];
      setHasReadableContent(false);
      return;
    }
    const segments = buildSpeechSegments(root);
    segmentsRef.current = segments;
    setHasReadableContent(segments.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, active]);

  // Prioridad de IA (PARTE 4-8): cualquier arranque real de audio de IA
  // detiene el Reader de inmediato, sin esperar a que ese audio empiece a
  // sonar. Nunca se reanuda solo.
  useEffect(() => {
    return onAiAudioPriority(() => {
      if (stateRef.current !== "idle") hardStop("idle");
    });
  }, [hardStop]);

  // Mantiene `aiVoiceActive` sincronizado durante TODA la secuencia de
  // voz de IA (no solo el instante del claim) -- ver comentario en la
  // declaración del estado más arriba.
  useEffect(() => {
    return onAiAudioActiveChange((active) => {
      setAiVoiceActive(active);
    });
  }, []);

  // Desmontar el aula/cambiar de tab: nunca deja audio/highlight vivo.
  useEffect(() => {
    return () => {
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const highlightAndFollow = useCallback(
    (index: number) => {
      const root = containerRef.current;
      const segment = segmentsRef.current[index];
      if (!root || !segment) return;
      if (segment.kind === "image-alt") {
        // Las imágenes no tienen un Range de texto -- se resalta el
        // propio <img> completo (misma API, un Range de un solo nodo).
        const el = root.querySelector(
          `[data-read-aloud-block="${segment.blockKey}"]`
        );
        if (el) {
          const range = document.createRange();
          range.selectNode(el);
          applyReadAloudHighlight(range);
          safeScrollIntoView(el);
        }
        return;
      }
      const range = resolveSegmentRange(root, segment.blockKey, segment.startOffset, segment.endOffset);
      applyReadAloudHighlight(range);
      if (range) {
        safeScrollIntoView(range.startContainer.parentElement);
      }
    },
    [containerRef]
  );

  const playAt = useCallback(
    (index: number) => {
      const segments = segmentsRef.current;
      if (index >= segments.length) {
        clearReadAloudHighlight();
        setState("completed");
        return;
      }
      currentIndexRef.current = index;
      setState("loading");
      const segment = segments[index];

      // Adelanta hasta PREFETCH_AHEAD segmentos siguientes mientras este
      // arranca -- nunca más que eso (PARTE 23).
      for (let ahead = 1; ahead <= PREFETCH_AHEAD; ahead += 1) {
        const next = segments[index + ahead];
        if (next) prefetchSegment(next.id, next.text);
      }

      playSegment(segment.id, segment.text, {
        onStart: () => {
          setState("playing");
          highlightAndFollow(index);
        },
        onEnd: () => {
          playAt(index + 1);
        },
        onError: (message) => {
          setErrorMessage(message);
          setState("error");
        },
      });
    },
    [highlightAndFollow]
  );

  const play = useCallback(() => {
    if (aiAudioSessionActive || aiVoiceActive || !hasReadableContent) return;
    if (state === "paused") {
      resumeActiveSegment();
      setState("playing");
      return;
    }
    setErrorMessage(null);
    const startIndex = state === "error" ? currentIndexRef.current : 0;
    playAt(startIndex);
  }, [aiAudioSessionActive, aiVoiceActive, hasReadableContent, state, playAt]);

  const pause = useCallback(() => {
    if (state !== "playing") return;
    pauseActiveSegment();
    setState("paused");
  }, [state]);

  const resume = useCallback(() => {
    if (state !== "paused") return;
    resumeActiveSegment();
    setState("playing");
  }, [state]);

  const stop = useCallback(() => {
    hardStop("idle");
  }, [hardStop]);

  const setRate = useCallback((next: ReadAloudRate) => {
    setRateState(next);
    saveReadAloudRate(next);
  }, []);

  return {
    state,
    rate,
    setRate,
    play,
    pause,
    resume,
    stop,
    hasReadableContent,
    errorMessage,
    disabled: aiAudioSessionActive || aiVoiceActive || !hasReadableContent,
  };
}
