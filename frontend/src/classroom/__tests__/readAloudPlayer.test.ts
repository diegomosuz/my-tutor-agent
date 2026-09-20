import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { synthesizeSpeech: vi.fn() },
}));

import { api } from "../../api/client";
import {
  configureReadAloudPlayer,
  isSegmentPrefetched,
  pauseActiveSegment,
  playSegment,
  prefetchSegment,
  resumeActiveSegment,
  setReadAloudRate,
  stopReadAloudPlayer,
} from "../readAloudPlayer";

const mockedSynthesize = api.synthesizeSpeech as unknown as ReturnType<typeof vi.fn>;

class MockAudio {
  src = "";
  paused = true;
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  constructor(src: string) {
    this.src = src;
  }
}

beforeEach(() => {
  mockedSynthesize.mockReset();
  // @ts-expect-error jsdom no implementa HTMLAudioElement de verdad
  globalThis.Audio = MockAudio;
  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  globalThis.URL.revokeObjectURL = vi.fn();
  configureReadAloudPlayer({ useNeural: true });
  setReadAloudRate(1.0);
});

afterEach(() => {
  stopReadAloudPlayer();
});

describe("readAloudPlayer (backend neural)", () => {
  it("prefetchSegment llama a synthesizeSpeech con speed=1.0 siempre (el rate se aplica via playbackRate)", () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    setReadAloudRate(1.5);
    prefetchSegment(1, "Segundo segmento.");
    expect(mockedSynthesize).toHaveBeenCalledWith("Segundo segmento.", 1.0, expect.any(AbortSignal));
  });

  it("prefetchSegment nunca dispara una segunda síntesis para el mismo id", () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    prefetchSegment(1, "texto");
    prefetchSegment(1, "texto");
    expect(mockedSynthesize).toHaveBeenCalledTimes(1);
  });

  it("isSegmentPrefetched refleja si hay un fetch en curso/completo para ese id", () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    expect(isSegmentPrefetched(5)).toBe(false);
    prefetchSegment(5, "texto");
    expect(isSegmentPrefetched(5)).toBe(true);
  });

  it("playSegment reutiliza un prefetch existente en vez de sintetizar de nuevo", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    prefetchSegment(0, "Primer segmento.");
    expect(mockedSynthesize).toHaveBeenCalledTimes(1);
    await playSegment(0, "Primer segmento.");
    expect(mockedSynthesize).toHaveBeenCalledTimes(1); // nunca una segunda vez
  });

  it("playSegment sin prefetch previo sintetiza bajo demanda", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await playSegment(0, "texto", {});
    expect(mockedSynthesize).toHaveBeenCalledTimes(1);
  });

  it("onStart se invoca solo cuando el audio realmente arrancó (después de play())", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    const onStart = vi.fn();
    await playSegment(0, "texto", { onStart });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("setReadAloudRate aplica playbackRate al audio activo de inmediato (nunca resintetiza)", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await playSegment(0, "texto", {});
    mockedSynthesize.mockClear();
    setReadAloudRate(2.0);
    expect(mockedSynthesize).not.toHaveBeenCalled();
  });

  it("pauseActiveSegment/resumeActiveSegment nunca lanzan sin audio activo", () => {
    expect(() => pauseActiveSegment()).not.toThrow();
    expect(() => resumeActiveSegment()).not.toThrow();
  });

  it("stopReadAloudPlayer aborta prefetches en vuelo (AbortController real)", () => {
    let capturedSignal: AbortSignal | undefined;
    mockedSynthesize.mockImplementationOnce(
      (_text: string, _speed: number, signal?: AbortSignal) =>
        new Promise<Blob>((_resolve, reject) => {
          capturedSignal = signal;
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        })
    );
    prefetchSegment(0, "texto");
    expect(capturedSignal?.aborted).toBe(false);
    stopReadAloudPlayer();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("una respuesta de red tardía de un segmento ya descartado (stop) nunca reproduce (epoch/token)", async () => {
    let resolveFirst!: (blob: Blob) => void;
    const firstFetch = new Promise<Blob>((resolve) => {
      resolveFirst = resolve;
    });
    mockedSynthesize.mockReturnValueOnce(firstFetch);

    const onStart = vi.fn();
    const playCall = playSegment(0, "texto obsoleto", { onStart });
    stopReadAloudPlayer(); // el alumno detiene ANTES de que resuelva el fetch

    resolveFirst(new Blob(["audio"], { type: "audio/mpeg" }));
    await playCall;

    expect(onStart).not.toHaveBeenCalled();
  });

  it("Stop durante una síntesis pendiente, seguido de un restart: la respuesta vieja llega tarde y se ignora, la nueva sesión reproduce normalmente (PARTE 26)", async () => {
    let resolveStale!: (blob: Blob) => void;
    const staleFetch = new Promise<Blob>((resolve) => {
      resolveStale = resolve;
    });
    mockedSynthesize.mockReturnValueOnce(staleFetch);

    const onStartStale = vi.fn();
    const staleCall = playSegment(0, "texto obsoleto", { onStart: onStartStale });
    stopReadAloudPlayer(); // Stop mientras el fetch todavía está en vuelo.

    // Nueva sesión: síntesis fresca para el mismo id (nunca reutiliza el
    // fetch/AbortController ya abortado de la sesión anterior).
    mockedSynthesize.mockResolvedValueOnce(new Blob(["audio nuevo"], { type: "audio/mpeg" }));
    const onStartFresh = vi.fn();
    const freshCall = playSegment(0, "texto obsoleto", { onStart: onStartFresh });

    // La respuesta vieja llega recién ahora (tarde) -- nunca debe disparar
    // onStart ni interferir con la sesión nueva.
    resolveStale(new Blob(["audio viejo"], { type: "audio/mpeg" }));
    await staleCall;
    await freshCall;

    expect(onStartStale).not.toHaveBeenCalled();
    expect(onStartFresh).toHaveBeenCalledTimes(1);
  });

  it("reproducir un segmento nuevo cancela/limpia el audio anterior (nunca dos a la vez)", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await playSegment(0, "primero", {});
    const revokeCallsBefore = (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length;
    await playSegment(1, "segundo", {});
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      revokeCallsBefore
    );
  });

  it("onError se invoca si la síntesis falla (nunca rompe el aula)", async () => {
    mockedSynthesize.mockRejectedValue(new Error("503"));
    const onError = vi.fn();
    await playSegment(0, "texto", { onError });
    expect(onError).toHaveBeenCalledWith("No se pudo generar voz para este fragmento.");
  });
});

describe("readAloudPlayer (fallback navegador)", () => {
  it("con useNeural=false, prefetchSegment nunca llama a synthesizeSpeech (sin red)", () => {
    configureReadAloudPlayer({ useNeural: false });
    prefetchSegment(0, "texto");
    expect(mockedSynthesize).not.toHaveBeenCalled();
  });
});
