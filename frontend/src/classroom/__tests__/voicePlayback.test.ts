import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCancelBrowser = vi.fn();
const mockPauseBrowser = vi.fn();
const mockResumeBrowser = vi.fn();
const mockSpeakBrowser = vi.fn();

vi.mock("../speech", () => ({
  cancelSpeech: () => mockCancelBrowser(),
  pauseSpeech: () => mockPauseBrowser(),
  resumeSpeech: () => mockResumeBrowser(),
  speakText: (text: string, options: unknown) => mockSpeakBrowser(text, options),
}));

const mockCancelNeural = vi.fn();
const mockPauseNeural = vi.fn();
const mockResumeNeural = vi.fn();
const mockSpeakNeural = vi.fn();

vi.mock("../neuralSpeech", () => ({
  cancelNeuralSpeech: () => mockCancelNeural(),
  pauseNeuralSpeech: () => mockPauseNeural(),
  resumeNeuralSpeech: () => mockResumeNeural(),
  speakTextNeural: (text: string, options: unknown) => mockSpeakNeural(text, options),
}));

import { isAiAudioActive } from "../readAloudPriority";
import {
  cancelAllSpeech,
  pauseAllSpeech,
  resumeAllSpeech,
  speakSequenceUnified,
} from "../voicePlayback";

beforeEach(() => {
  mockCancelBrowser.mockReset();
  mockPauseBrowser.mockReset();
  mockResumeBrowser.mockReset();
  mockSpeakBrowser.mockReset();
  mockCancelNeural.mockReset();
  mockPauseNeural.mockReset();
  mockResumeNeural.mockReset();
  mockSpeakNeural.mockReset();
});

afterEach(() => {
  cancelAllSpeech();
});

describe("voicePlayback", () => {
  it("cancelAllSpeech cancela AMBOS backends siempre", () => {
    cancelAllSpeech();
    expect(mockCancelBrowser).toHaveBeenCalledTimes(1);
    expect(mockCancelNeural).toHaveBeenCalledTimes(1);
  });

  it("pauseAllSpeech pausa AMBOS backends", () => {
    pauseAllSpeech();
    expect(mockPauseBrowser).toHaveBeenCalledTimes(1);
    expect(mockPauseNeural).toHaveBeenCalledTimes(1);
  });

  it("resumeAllSpeech resume AMBOS backends", () => {
    resumeAllSpeech();
    expect(mockResumeBrowser).toHaveBeenCalledTimes(1);
    expect(mockResumeNeural).toHaveBeenCalledTimes(1);
  });

  it("useNeural=true usa el backend neural, nunca el de browser", () => {
    speakSequenceUnified(["hola"], { useNeural: true });
    expect(mockSpeakNeural).toHaveBeenCalledTimes(1);
    expect(mockSpeakBrowser).not.toHaveBeenCalled();
  });

  it("useNeural=false usa el backend browser (modo browser sin cambios)", () => {
    speakSequenceUnified(["hola"], { useNeural: false, rate: 1.15 });
    expect(mockSpeakBrowser).toHaveBeenCalledWith("hola", expect.objectContaining({ rate: 1.15 }));
    expect(mockSpeakNeural).not.toHaveBeenCalled();
  });

  it("cancela cualquier audio previo (ambos backends) antes de una secuencia nueva", () => {
    speakSequenceUnified(["hola"], { useNeural: true });
    expect(mockCancelBrowser).toHaveBeenCalled();
    expect(mockCancelNeural).toHaveBeenCalled();
  });

  it("avanza al siguiente texto cuando el backend neural llama onEnd", () => {
    mockSpeakNeural.mockImplementation((_text, options) => {
      options.onEnd();
    });
    speakSequenceUnified(["uno", "dos"], { useNeural: true });
    expect(mockSpeakNeural).toHaveBeenCalledTimes(2);
    expect(mockSpeakNeural.mock.calls[0][0]).toBe("uno");
    expect(mockSpeakNeural.mock.calls[1][0]).toBe("dos");
  });

  it("llama onDone cuando termina toda la secuencia", () => {
    mockSpeakNeural.mockImplementation((_text, options) => {
      options.onEnd();
    });
    const onDone = vi.fn();
    speakSequenceUnified(["uno"], { useNeural: true, onDone });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("propaga errores de voz neural vía onNeuralError (nunca rompe la secuencia)", () => {
    mockSpeakNeural.mockImplementation((_text, options) => {
      options.onError("credencial rechazada");
    });
    const onNeuralError = vi.fn();
    speakSequenceUnified(["uno"], { useNeural: true, onNeuralError });
    expect(onNeuralError).toHaveBeenCalledWith("credencial rechazada");
  });

  it("cancelar la secuencia devuelta detiene el avance a chunks siguientes", () => {
    const captured: { onEnd: (() => void) | null } = { onEnd: null };
    mockSpeakNeural.mockImplementation((_text, options) => {
      captured.onEnd = options.onEnd;
    });
    const cancel = speakSequenceUnified(["uno", "dos"], { useNeural: true });
    cancel();
    mockSpeakNeural.mockClear();
    captured.onEnd?.();
    expect(mockSpeakNeural).not.toHaveBeenCalled(); // nunca avanza tras cancelar
  });

  it("(hardening v1.5.0, bug real -- overlap con el Markdown Reader) isAiAudioActive() queda true durante TODA la secuencia, no solo el primer chunk", () => {
    const captured: { onEnd: (() => void) | null } = { onEnd: null };
    mockSpeakNeural.mockImplementation((_text, options) => {
      captured.onEnd = options.onEnd;
    });
    expect(isAiAudioActive()).toBe(false);
    speakSequenceUnified(["uno", "dos", "tres"], { useNeural: true });
    expect(isAiAudioActive()).toBe(true);
    // Sigue true al pasar al segundo chunk -- antes del fix, nada
    // mantenía esta señal viva más allá del instante inicial, así que el
    // Reader podía reiniciarse acá y sonar junto con este audio.
    captured.onEnd?.();
    expect(isAiAudioActive()).toBe(true);
    captured.onEnd?.();
    expect(isAiAudioActive()).toBe(true);
    // Último chunk: al terminar, se libera.
    captured.onEnd?.();
    expect(isAiAudioActive()).toBe(false);
  });

  it("isAiAudioActive() se libera si la secuencia se cancela a mitad de camino", () => {
    mockSpeakNeural.mockImplementation(() => {});
    speakSequenceUnified(["uno", "dos"], { useNeural: true });
    expect(isAiAudioActive()).toBe(true);
    cancelAllSpeech();
    expect(isAiAudioActive()).toBe(false);
  });

  it("isAiAudioActive() se libera si un chunk falla (nunca queda pegada en true)", () => {
    mockSpeakNeural.mockImplementation((_text, options) => {
      options.onError("fallo de red");
    });
    speakSequenceUnified(["uno"], { useNeural: true });
    expect(isAiAudioActive()).toBe(false);
  });

  it("una secuencia vacía nunca deja isAiAudioActive() en true", () => {
    speakSequenceUnified([], { useNeural: true });
    expect(isAiAudioActive()).toBe(false);
  });
});
