import { describe, expect, it, vi } from "vitest";
import { claimAiAudioPriority, onAiAudioPriority } from "../readAloudPriority";

describe("readAloudPriority", () => {
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
});
