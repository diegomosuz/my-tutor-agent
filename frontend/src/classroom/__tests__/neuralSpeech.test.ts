import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { synthesizeSpeech: vi.fn() },
}));

import { api } from "../../api/client";
import {
  cancelNeuralSpeech,
  isNeuralSpeechPlaying,
  pauseNeuralSpeech,
  resumeNeuralSpeech,
  speakTextNeural,
} from "../neuralSpeech";

const mockedSynthesize = api.synthesizeSpeech as unknown as ReturnType<typeof vi.fn>;

class MockAudio {
  src = "";
  paused = true;
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
});

afterEach(() => {
  cancelNeuralSpeech();
});

describe("neuralSpeech", () => {
  it("llama a api.synthesizeSpeech con el texto y speed correctos (+ AbortSignal, v1.3.0)", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await speakTextNeural("Bienvenido a la clase.", { speed: 1.15 });
    expect(mockedSynthesize).toHaveBeenCalledWith(
      "Bienvenido a la clase.",
      1.15,
      expect.any(AbortSignal)
    );
  });

  it("crea un object URL a partir del blob devuelto y lo reproduce", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await speakTextNeural("hola");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("queda reproduciendo tras una síntesis exitosa", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    const onEnd = vi.fn();
    await speakTextNeural("hola", { onEnd });
    expect(isNeuralSpeechPlaying()).toBe(true);
  });

  it("nunca envía la API key: synthesizeSpeech solo recibe texto, speed y un AbortSignal", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await speakTextNeural("hola", { speed: 1.0 });
    const args = mockedSynthesize.mock.calls[0];
    expect(args[0]).toBe("hola");
    expect(args[1]).toBe(1.0);
    expect(args[2]).toBeInstanceOf(AbortSignal);
    expect(args).toHaveLength(3);
  });

  it("onError se invoca si la síntesis falla (nunca rompe la clase)", async () => {
    mockedSynthesize.mockRejectedValue(new Error("503"));
    const onError = vi.fn();
    await speakTextNeural("hola", { onError });
    expect(onError).toHaveBeenCalledWith("No se pudo generar voz neural.");
  });

  it("cancelNeuralSpeech es siempre segura de llamar (no-op sin audio activo)", () => {
    expect(() => cancelNeuralSpeech()).not.toThrow();
  });

  it("pause/resume nunca rompen si no hay audio activo", () => {
    cancelNeuralSpeech();
    expect(() => pauseNeuralSpeech()).not.toThrow();
    expect(() => resumeNeuralSpeech()).not.toThrow();
  });

  it("una síntesis nueva cancela la anterior (nunca dos audios simultáneos)", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await speakTextNeural("primero");
    const firstRevokeCalls = (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length;
    await speakTextNeural("segundo");
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      firstRevokeCalls
    );
  });

  // --------------------------------------------------------------------
  // v1.3.0 (bloque "Classroom UX + Voice Lifecycle") — PARTE 5/8.C: race
  // real de TTS async. Antes de este bloque, una respuesta de red tardía
  // de una síntesis "vieja" (ya reemplazada por una nueva) igual pisaba
  // `currentAudio` y arrancaba a sonar -- dos voces simultáneas.
  // --------------------------------------------------------------------
  describe("v1.3.0 — protección de respuesta TTS async obsoleta", () => {
    it("una respuesta de red tardía de una síntesis ya reemplazada NUNCA reproduce", async () => {
      let resolveFirst!: (blob: Blob) => void;
      const firstFetch = new Promise<Blob>((resolve) => {
        resolveFirst = resolve;
      });
      mockedSynthesize.mockReturnValueOnce(firstFetch);

      // "Escena A" arranca a pedir TTS -- el fetch queda pendiente.
      const firstCall = speakTextNeural("texto de la escena A", {});

      // Antes de que resuelva, "cambia de escena": arranca una síntesis
      // nueva para B, que sí resuelve rápido.
      mockedSynthesize.mockResolvedValueOnce(new Blob(["audio-b"], { type: "audio/mpeg" }));
      await speakTextNeural("texto de la escena B", {});
      expect(isNeuralSpeechPlaying()).toBe(true);

      // Ahora "llega tarde" la respuesta de la escena A.
      resolveFirst(new Blob(["audio-a"], { type: "audio/mpeg" }));
      await firstCall;

      // El audio de B debe seguir siendo el activo -- A nunca debió
      // reemplazarlo ni reproducirse.
      expect(isNeuralSpeechPlaying()).toBe(true);
    });

    it("si se cancela (cambio de escena) mientras el fetch está en vuelo, la respuesta tardía no deja nada sonando", async () => {
      let resolveFirst!: (blob: Blob) => void;
      const firstFetch = new Promise<Blob>((resolve) => {
        resolveFirst = resolve;
      });
      mockedSynthesize.mockReturnValueOnce(firstFetch);

      const firstCall = speakTextNeural("texto de la escena A", {});
      cancelNeuralSpeech(); // navegación: sin nueva síntesis todavía

      resolveFirst(new Blob(["audio-a"], { type: "audio/mpeg" }));
      await firstCall;

      expect(isNeuralSpeechPlaying()).toBe(false);
    });

    it("cancelNeuralSpeech aborta el fetch en curso (AbortController real, ahorra la llamada)", async () => {
      let capturedSignal: AbortSignal | undefined;
      // Simula el comportamiento REAL de `fetch`: la promesa rechaza en
      // cuanto el AbortSignal se dispara (nunca queda colgada para
      // siempre, como sí quedaría un fetch real cancelado).
      mockedSynthesize.mockImplementationOnce(
        (_text: string, _speed: number, signal?: AbortSignal) =>
          new Promise<Blob>((_resolve, reject) => {
            capturedSignal = signal;
            signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          })
      );

      const call = speakTextNeural("texto largo", {});
      expect(capturedSignal?.aborted).toBe(false);
      cancelNeuralSpeech();
      expect(capturedSignal?.aborted).toBe(true);
      await call; // nunca debe lanzar/colgar la promesa original
    });

    it("onError nunca se invoca para una llamada ya obsoleta (evita notificar al llamador equivocado)", async () => {
      let rejectFirst!: (err: unknown) => void;
      const firstFetch = new Promise<Blob>((_resolve, reject) => {
        rejectFirst = reject;
      });
      mockedSynthesize.mockReturnValueOnce(firstFetch);
      const onErrorA = vi.fn();
      const firstCall = speakTextNeural("texto A", { onError: onErrorA });

      mockedSynthesize.mockResolvedValueOnce(new Blob(["audio-b"], { type: "audio/mpeg" }));
      await speakTextNeural("texto B", {});

      rejectFirst(new Error("network error tardío de A"));
      await firstCall;

      expect(onErrorA).not.toHaveBeenCalled();
      expect(isNeuralSpeechPlaying()).toBe(true); // B sigue sonando, intacto
    });
  });
});
