// Envoltorio delgado sobre la Web Speech API de RECONOCIMIENTO de voz del
// navegador (SpeechRecognition / webkitSpeechRecognition). Opcional: si el
// navegador no la soporta, el botón de micrófono se deshabilita sin romper
// nada — el tutor sigue funcionando por texto (Fase 5, sección 29).
//
// No se instala ningún paquete para esto: es exclusivamente la API nativa
// del navegador, con feature detection explícita.

interface SpeechRecognitionResultLike {
  readonly transcript: string;
}

interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isSpeechRecognitionSupported(): boolean {
  try {
    return getSpeechRecognitionCtor() !== undefined;
  } catch {
    return false;
  }
}

export interface RecognizerHandle {
  start: () => void;
  stop: () => void;
}

export interface RecognizerCallbacks {
  /** Se llama únicamente con el transcript FINAL (interimResults=false).
   * Nunca se envía nada automáticamente: el llamador decide qué hacer con
   * el texto (en el tutor, se coloca en el input para que el alumno lo
   * revise antes de enviarlo). */
  onResult: (transcript: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

/** Crea un reconocedor de una sola frase (continuous=false,
 * interimResults=false). Idioma preferido es-AR con fallback implícito del
 * navegador si esa variante no está disponible. */
export function createRecognizer(callbacks: RecognizerCallbacks): RecognizerHandle | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = "es-AR";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    const transcript = lastResult?.[0]?.transcript ?? "";
    if (transcript.trim()) callbacks.onResult(transcript.trim());
  };
  recognition.onerror = (event) => {
    callbacks.onError?.(event.error || "unknown_error");
  };
  recognition.onend = () => {
    callbacks.onEnd?.();
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch {
        // start() puede lanzar si ya hay un reconocimiento en curso.
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // ignorar
      }
    },
  };
}
