import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimAiAudioPriority,
  isAiAudioActive,
  onAiAudioPriority,
  setAiAudioActive,
} from "../readAloudPriority";

describe("readAloudPriority", () => {
  beforeEach(() => {
    setAiAudioActive(false);
  });

  it("notifica a todos los suscriptores cuando se reclama prioridad", () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = onAiAudioPriority(listenerA);
    const unsubB = onAiAudioPriority(listenerB);

    claimAiAudioPriority();

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });

  it("un suscriptor cancelado ya no recibe notificaciones", () => {
    const listener = vi.fn();
    const unsubscribe = onAiAudioPriority(listener);
    unsubscribe();

    claimAiAudioPriority();

    expect(listener).not.toHaveBeenCalled();
  });

  it("claimAiAudioPriority sin suscriptores nunca lanza", () => {
    expect(() => claimAiAudioPriority()).not.toThrow();
  });

  it("setAiAudioActive/isAiAudioActive reflejan el último valor asignado", () => {
    expect(isAiAudioActive()).toBe(false);
    setAiAudioActive(true);
    expect(isAiAudioActive()).toBe(true);
    setAiAudioActive(false);
    expect(isAiAudioActive()).toBe(false);
  });
});
