// Tests del controller usePedagogicalAnimation (PARTE 31/33): fake timers
// siempre (nunca sleeps reales -- suite rápida), play/pause/resume/reset/
// complete, reset por remount (simulado), cleanup de timers al unmount.
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePedagogicalAnimation } from "../usePedagogicalAnimation";
import { ANIMATION_TIMING } from "../animationTiming";
import type { AnimationSequence } from "../pedagogicalAnimation";

const THREE_STEP_SEQUENCE: AnimationSequence = {
  mode: "progressive",
  steps: [
    { elements: [{ kind: "step", id: "step-0" }], action: "reveal" },
    { elements: [{ kind: "connector", id: "connector-0" }], action: "reveal" },
    { elements: [{ kind: "step", id: "step-1" }], action: "reveal" },
  ],
};

const NONE_SEQUENCE: AnimationSequence = { mode: "none", steps: [] };

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePedagogicalAnimation", () => {
  it("arranca en 'hidden' para todo y progresa paso a paso con el timing centralizado", () => {
    const { result } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));

    expect(result.current.elementStatus("step-0")).toBe("hidden");
    expect(result.current.isComplete).toBe(false);

    act(() => {
      vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs);
    });
    expect(result.current.elementStatus("step-0")).toBe("active");
    expect(result.current.elementStatus("connector-0")).toBe("hidden");

    act(() => {
      vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs);
    });
    expect(result.current.elementStatus("step-0")).toBe("revealed");
    expect(result.current.elementStatus("connector-0")).toBe("active");

    act(() => {
      vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs);
    });
    // Al completar la secuencia, TODO pasa a "revealed" de una vez
    // (incluido el último elemento recién aparecido) — una vez completa,
    // ya no hay un "paso siguiente" contra el cual distinguir "active".
    expect(result.current.elementStatus("connector-0")).toBe("revealed");
    expect(result.current.elementStatus("step-1")).toBe("revealed");
    expect(result.current.isComplete).toBe(true);
  });

  it("secuencia vacía (mode none) -> isComplete inmediato, todo 'revealed'", () => {
    const { result } = renderHook(() => usePedagogicalAnimation(NONE_SEQUENCE, false));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.elementStatus("cualquier-id")).toBe("revealed");
  });

  it("pause: nada nuevo aparece mientras está pausado", () => {
    const { result } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(result.current.elementStatus("step-0")).toBe("active");

    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(10_000)); // mucho tiempo, pausado
    expect(result.current.elementStatus("step-0")).toBe("active");
    expect(result.current.elementStatus("connector-0")).toBe("hidden");
    expect(result.current.isPlaying).toBe(false);
  });

  it("resume: continúa desde el mismo punto, nunca reinicia a hidden", () => {
    const { result } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    act(() => result.current.pause());
    act(() => result.current.resume());
    // Todavía no pasó el intervalo completo: sigue en el mismo paso.
    expect(result.current.elementStatus("step-0")).toBe("active");
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs));
    expect(result.current.elementStatus("step-0")).toBe("revealed");
    expect(result.current.elementStatus("connector-0")).toBe("active");
  });

  it("isPaused externo (prop) pausa y reanuda igual que las acciones manuales", () => {
    const { result, rerender } = renderHook(
      ({ isPaused }) => usePedagogicalAnimation(THREE_STEP_SEQUENCE, isPaused),
      { initialProps: { isPaused: false } }
    );
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(result.current.elementStatus("step-0")).toBe("active");

    rerender({ isPaused: true });
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.elementStatus("connector-0")).toBe("hidden");

    rerender({ isPaused: false });
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs));
    expect(result.current.elementStatus("connector-0")).toBe("active");
  });

  it("montado con isPaused=true desde el inicio: no arranca ningún timer hasta que isPaused pase a false", () => {
    const { result, rerender } = renderHook(
      ({ isPaused }) => usePedagogicalAnimation(THREE_STEP_SEQUENCE, isPaused),
      { initialProps: { isPaused: true } }
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.elementStatus("step-0")).toBe("hidden");
    expect(result.current.isPlaying).toBe(false);

    rerender({ isPaused: false });
    // Resume desde currentStepIndex=-1 (nada revelado todavía) debe usar
    // initialDelayMs, NO stepIntervalMs -- se verifica con el delay más
    // corto exacto, no con un margen que enmascare cuál de los dos se usó
    // realmente (ver el test de StrictMode, más abajo, para el bug real
    // que esta distinción destapó).
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(result.current.elementStatus("step-0")).toBe("active");
  });

  it("reset: vuelve a -1 y repite la progresión desde cero", () => {
    const { result } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs));
    expect(result.current.elementStatus("step-0")).toBe("revealed");

    act(() => result.current.reset());
    expect(result.current.elementStatus("step-0")).toBe("hidden");
    expect(result.current.isComplete).toBe(false);

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(result.current.elementStatus("step-0")).toBe("active");
  });

  it("complete: salta directo al estado final sin más timers", () => {
    const { result } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));
    act(() => result.current.complete());
    expect(result.current.isComplete).toBe(true);
    expect(result.current.elementStatus("step-0")).toBe("revealed");
    expect(result.current.elementStatus("step-1")).toBe("revealed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("prefers-reduced-motion: salta directo al estado final, nunca programa un timer", () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.elementStatus("step-0")).toBe("revealed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unmount limpia el timer pendiente (no timer leak, no setState after unmount)", () => {
    const { result, unmount } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(result.current.elementStatus("step-0")).toBe("active");
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    // Avanzar el reloj tras el unmount no debe lanzar (nada de setState
    // sobre un componente ya desmontado).
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });

  it("nunca hay más de un timer activo a la vez (no duplicate timers)", () => {
    renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs));
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
  });

  it("re-montar con una secuencia distinta (simula remount por renderKey) arranca limpio, sin arrastrar estado previo", () => {
    const { result, unmount } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false));
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(result.current.elementStatus("step-0")).toBe("active");
    unmount();

    const other: AnimationSequence = {
      mode: "progressive",
      steps: [{ elements: [{ kind: "step", id: "step-0" }], action: "reveal" }],
    };
    const { result: second } = renderHook(() => usePedagogicalAnimation(other, false));
    expect(second.current.elementStatus("step-0")).toBe("hidden");
  });

  it("React.StrictMode (doble-invoke de efectos en desarrollo): nunca más de un timer activo, y el primer reveal sigue respetando initialDelayMs (no stepIntervalMs)", () => {
    // Bug real encontrado en hardening: el guard basado en un ref
    // (startedRef) sobrevive el "fake unmount" sintético de StrictMode
    // (los refs no se reinician, solo los efectos se re-ejecutan), así
    // que la segunda invocación tomaba la rama "ya arrancado" -- que
    // antes de este fix reprogramaba siempre con stepIntervalMs, incluso
    // partiendo de currentStepIndex=-1. Corregido con delayFor().
    const { result } = renderHook(() => usePedagogicalAnimation(THREE_STEP_SEQUENCE, false), {
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    });

    expect(vi.getTimerCount()).toBe(1); // nunca dos timers compitiendo

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(result.current.elementStatus("step-0")).toBe("active");
    expect(vi.getTimerCount()).toBe(1);
  });
});
