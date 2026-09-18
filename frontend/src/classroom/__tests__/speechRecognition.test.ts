import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecognizer, isSpeechRecognitionSupported } from "../speechRecognition";

class FakeRecognition {
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 5;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  vi.restoreAllMocks();
});

describe("speechRecognition (Web Speech API - reconocimiento)", () => {
  it("isSpeechRecognitionSupported() es false cuando el navegador no lo soporta", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("isSpeechRecognitionSupported() es true cuando window.SpeechRecognition existe", () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it("isSpeechRecognitionSupported() es true con el prefijo webkitSpeechRecognition", () => {
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it("createRecognizer() devuelve null si no hay soporte (nunca rompe la app)", () => {
    expect(createRecognizer({ onResult: vi.fn() })).toBeNull();
  });

  it("createRecognizer() configura continuous=false e interimResults=false (una sola frase)", () => {
    let instance: FakeRecognition | undefined;
    class CapturingRecognition extends FakeRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = CapturingRecognition;

    createRecognizer({ onResult: vi.fn() });
    expect(instance?.continuous).toBe(false);
    expect(instance?.interimResults).toBe(false);
    expect(instance?.lang).toBe("es-AR");
  });

  it("onResult se llama solo con el transcript FINAL, recortado", () => {
    let instance: FakeRecognition | undefined;
    class CapturingRecognition extends FakeRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = CapturingRecognition;

    const onResult = vi.fn();
    const handle = createRecognizer({ onResult });
    expect(handle).not.toBeNull();

    instance?.onresult?.({
      results: [[{ transcript: "  qué es un pod  " }]],
    });

    expect(onResult).toHaveBeenCalledWith("qué es un pod");
  });

  it("onResult NO se llama si el transcript final está vacío", () => {
    let instance: FakeRecognition | undefined;
    class CapturingRecognition extends FakeRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = CapturingRecognition;

    const onResult = vi.fn();
    createRecognizer({ onResult });
    instance?.onresult?.({ results: [[{ transcript: "   " }]] });

    expect(onResult).not.toHaveBeenCalled();
  });

  it("onError delega el mensaje de error del navegador", () => {
    let instance: FakeRecognition | undefined;
    class CapturingRecognition extends FakeRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = CapturingRecognition;

    const onError = vi.fn();
    createRecognizer({ onResult: vi.fn(), onError });
    instance?.onerror?.({ error: "no-speech" });

    expect(onError).toHaveBeenCalledWith("no-speech");
  });

  it("start() y stop() delegan al objeto SpeechRecognition subyacente sin lanzar", () => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    const handle = createRecognizer({ onResult: vi.fn() });
    expect(() => handle?.start()).not.toThrow();
    expect(() => handle?.stop()).not.toThrow();
  });
});
