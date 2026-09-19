// Controller de Pedagogical Animations (PARTE 13 de la especificación):
// un hook por escena, vive y muere con el ciclo de vida del componente
// visual que lo usa. No es un segundo sistema de navegación: consume
// `isPaused` del mismo `useClassroomEngine` que ya controla Pausar/
// Reanudar narración (PARTE 15 — un único control de playback, nunca dos
// botones de pausa distintos).
//
// Reset "gratis": `SceneRenderer` ya monta cada escena con
// `key={scene.scene_id}-${renderKey}` (ver useClassroomEngine.ts), y
// `renderKey` cambia en cada cambio de escena, "Repetir" y Previo/
// Siguiente. Eso fuerza un remount completo del árbol visual -- así que
// un `usePedagogicalAnimation` que arranca su secuencia al montar ya
// obtiene "reset al cambiar de escena" y "Repetir reinicia la animación"
// sin ningún mecanismo adicional (PARTE 14/16/17). `reset()`/`play()`
// igual se exponen para completar el contrato pedido y para poder
// testear el hook de forma aislada sin depender de un remount real.
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnimationSequence } from "./pedagogicalAnimation";
import { ANIMATION_TIMING } from "./animationTiming";
import { prefersReducedMotion } from "./prefersReducedMotion";

export type ElementStatus = "hidden" | "active" | "revealed";

export interface PedagogicalAnimationController {
  currentStepIndex: number;
  isPlaying: boolean;
  isComplete: boolean;
  elementStatus: (id: string) => ElementStatus;
  play: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  complete: () => void;
}

function buildElementStepIndex(sequence: AnimationSequence): Map<string, number> {
  const map = new Map<string, number>();
  sequence.steps.forEach((step, stepIndex) => {
    for (const el of step.elements) {
      if (!map.has(el.id)) map.set(el.id, stepIndex);
    }
  });
  return map;
}

export function usePedagogicalAnimation(
  sequence: AnimationSequence,
  isPaused: boolean
): PedagogicalAnimationController {
  const totalSteps = sequence.steps.length;
  const elementStepIndex = useMemo(() => buildElementStepIndex(sequence), [sequence]);

  // -1 = todavía no reveló ningún elemento (todo "hidden"); con
  // isComplete=true, todo pasa a "revealed" sin importar el índice.
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isComplete, setIsComplete] = useState(totalSteps === 0);
  const [isPlaying, setIsPlaying] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  // Refs "espejo" del estado más reciente: el timeout encadenado programa
  // su PRÓXIMO paso leyendo estos valores en el momento en que dispara,
  // nunca un closure viejo de un render anterior.
  const stepRef = useRef(currentStepIndex);
  stepRef.current = currentStepIndex;
  const completeRef = useRef(isComplete);
  completeRef.current = isComplete;

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // Bug real encontrado en hardening (StrictMode double-invoke, ver
  // docs/PEDAGOGICAL_ANIMATIONS.md sección 22): CUALQUIER programación
  // que parte de fromStepIndex=-1 (nada revelado todavía) debe usar
  // initialDelayMs, nunca stepIntervalMs -- sin importar si llega ahí por
  // el arranque inicial, por un resume() antes del primer reveal, o por
  // el segundo montaje sintético de React.StrictMode en desarrollo (los
  // refs, a diferencia del estado, sobreviven ese doble-montaje, así que
  // la rama "ya arrancado" de abajo podía terminar reprogramando con el
  // delay equivocado).
  function delayFor(fromStepIndex: number): number {
    return fromStepIndex < 0 ? ANIMATION_TIMING.initialDelayMs : ANIMATION_TIMING.stepIntervalMs;
  }

  function scheduleFrom(delayMs: number, fromStepIndex: number) {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const next = fromStepIndex + 1;
      setCurrentStepIndex(next);
      if (next >= totalSteps - 1) {
        setIsComplete(true);
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
        scheduleFrom(ANIMATION_TIMING.stepIntervalMs, next);
      }
    }, delayMs);
  }

  function complete() {
    clearTimer();
    setCurrentStepIndex(Math.max(totalSteps - 1, -1));
    setIsComplete(true);
    setIsPlaying(false);
  }

  function play() {
    clearTimer();
    if (totalSteps === 0) {
      setIsComplete(true);
      setIsPlaying(false);
      return;
    }
    if (prefersReducedMotion()) {
      complete();
      return;
    }
    setCurrentStepIndex(-1);
    setIsComplete(false);
    setIsPlaying(true);
    scheduleFrom(delayFor(-1), -1);
  }

  function pause() {
    clearTimer();
    setIsPlaying(false);
  }

  function resume() {
    if (completeRef.current || totalSteps === 0) return;
    setIsPlaying(true);
    // "Continúa desde el mismo punto, no reinicia" (PARTE 15/36): se
    // reprograma el intervalo completo desde el paso actual, nunca vuelve
    // a currentStepIndex=-1. Si el paso actual TODAVÍA es -1 (se pausó
    // antes del primer reveal), usa initialDelayMs, no stepIntervalMs.
    scheduleFrom(delayFor(stepRef.current), stepRef.current);
  }

  function reset() {
    startedRef.current = true;
    play();
  }

  // Único efecto que arranca la secuencia (una vez) y refleja el
  // `isPaused` externo (PARTE 15) — deliberadamente UN solo efecto, no
  // dos, para evitar una condición de carrera real detectada en revisión:
  // un efecto de "arranque" separado de un efecto de "isPaused" programaba
  // DOS timers competidores cuando el componente montaba con isPaused ya
  // en true (p.ej. el alumno pausó, después usó Previo/Siguiente).
  useEffect(() => {
    if (totalSteps === 0) {
      setIsComplete(true);
      setIsPlaying(false);
      return;
    }
    if (!startedRef.current) {
      startedRef.current = true;
      if (prefersReducedMotion()) {
        complete();
        return;
      }
      if (!isPaused) {
        setIsPlaying(true);
        scheduleFrom(delayFor(-1), -1);
      }
      // Si isPaused ya es true al montar: queda en reposo (-1, sin
      // timer) hasta que este mismo efecto vuelva a correr con
      // isPaused=false (rama de abajo).
      return;
    }
    if (completeRef.current) return;
    if (isPaused) {
      clearTimer();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      scheduleFrom(delayFor(stepRef.current), stepRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  useEffect(() => clearTimer, []);

  function elementStatus(id: string): ElementStatus {
    if (totalSteps === 0 || isComplete) return "revealed";
    const stepIndex = elementStepIndex.get(id);
    if (stepIndex === undefined) return "hidden";
    if (stepIndex < currentStepIndex) return "revealed";
    if (stepIndex === currentStepIndex) return "active";
    return "hidden";
  }

  return {
    currentStepIndex,
    isPlaying,
    isComplete,
    elementStatus,
    play,
    pause,
    resume,
    reset,
    complete,
  };
}
