import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelSpeech,
  isSpeechSupported,
  pauseSpeech,
  pickSpanishVoice,
  resumeSpeech,
  speakText,
} from "../speech";

function makeVoice(lang: string, name = lang): SpeechSynthesisVoice {
  return { lang, name, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

describe("speech.ts", () => {
  describe("pickSpanishVoice", () => {
    it("prioriza es-AR si existe", () => {
      const voices = [makeVoice("en-US"), makeVoice("es-ES"), makeVoice("es-AR")];
      expect(pickSpanishVoice(voices)?.lang).toBe("es-AR");
    });

    it("usa cualquier es-* si no hay es-AR", () => {
      const voices = [makeVoice("en-US"), makeVoice("es-MX")];
      expect(pickSpanishVoice(voices)?.lang).toBe("es-MX");
    });

    it("devuelve undefined si no hay ninguna voz en español (fallback a voz default)", () => {
      const voices = [makeVoice("en-US"), makeVoice("fr-FR")];
      expect(pickSpanishVoice(voices)).toBeUndefined();
    });

    it("devuelve undefined con una lista vacía", () => {
      expect(pickSpanishVoice([])).toBeUndefined();
    });
  });

  describe("con speechSynthesis mockeado (nunca navegador real)", () => {
    let speakSpy: ReturnType<typeof vi.fn>;
    let pauseSpy: ReturnType<typeof vi.fn>;
    let resumeSpy: ReturnType<typeof vi.fn>;
    let cancelSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      speakSpy = vi.fn();
      pauseSpy = vi.fn();
      resumeSpy = vi.fn();
      cancelSpy = vi.fn();
      // @ts-expect-error -- mock mínimo de la API del navegador para test
      window.speechSynthesis = {
        speak: speakSpy,
        pause: pauseSpy,
        resume: resumeSpy,
        cancel: cancelSpy,
        getVoices: () => [],
      };
      // @ts-expect-error -- jsdom no define SpeechSynthesisUtterance
      window.SpeechSynthesisUtterance = function (this: { text: string }, text: string) {
        this.text = text;
      };
    });

    afterEach(() => {
      // @ts-expect-error -- limpiar el mock entre tests
      delete window.speechSynthesis;
      // @ts-expect-error -- limpiar el mock entre tests
      delete window.SpeechSynthesisUtterance;
    });

    it("isSpeechSupported detecta el mock como soportado", () => {
      expect(isSpeechSupported()).toBe(true);
    });

    it("speakText usa el texto EXACTO recibido, sin modificar tecnicismos", () => {
      speakText("Usamos un API Gateway con fine-tuning y RAG.");
      expect(speakSpy).toHaveBeenCalledTimes(1);
      const utterance = speakSpy.mock.calls[0][0];
      expect(utterance.text).toBe("Usamos un API Gateway con fine-tuning y RAG.");
    });

    it("pauseSpeech / resumeSpeech / cancelSpeech delegan en speechSynthesis", () => {
      pauseSpeech();
      resumeSpeech();
      cancelSpeech();
      expect(pauseSpy).toHaveBeenCalledTimes(1);
      expect(resumeSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("sin soporte del navegador", () => {
    it("isSpeechSupported es false y las funciones son no-op seguras", () => {
      // @ts-expect-error -- simular navegador sin soporte
      delete window.speechSynthesis;
      expect(isSpeechSupported()).toBe(false);
      expect(() => speakText("hola")).not.toThrow();
      expect(() => pauseSpeech()).not.toThrow();
      expect(() => resumeSpeech()).not.toThrow();
      expect(() => cancelSpeech()).not.toThrow();
    });
  });
});
