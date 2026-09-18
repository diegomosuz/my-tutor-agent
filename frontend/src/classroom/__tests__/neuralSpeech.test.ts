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
  it("llama a api.synthesizeSpeech con el texto y speed correctos", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await speakTextNeural("Bienvenido a la clase.", { speed: 1.15 });
    expect(mockedSynthesize).toHaveBeenCalledWith("Bienvenido a la clase.", 1.15);
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

  it("nunca envía la API key: synthesizeSpeech solo recibe texto y speed", async () => {
    mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
    await speakTextNeural("hola", { speed: 1.0 });
    const args = mockedSynthesize.mock.calls[0];
    expect(args).toEqual(["hola", 1.0]);
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
});
