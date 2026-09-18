// Facade unificado sobre los dos backends de voz (Fase 7, sección 30):
// Web Speech API del navegador (`speech.ts`, Fase 4) y voz neural opcional
// (`neuralSpeech.ts`). Todos los consumidores (narración de la clase,
// tutor, checkpoint feedback, "leer pregunta" de certificación) pasan por
// acá en vez de llamar a cada backend por separado — así "nunca dos audios
// simultáneos" se garantiza en UN solo lugar: cancelSpeech() de este
// módulo cancela AMBOS backends siempre, sin importar cuál esté activo.
import {
  cancelSpeech as cancelBrowserSpeech,
  pauseSpeech as pauseBrowserSpeech,
  resumeSpeech as resumeBrowserSpeech,
  speakText as speakBrowserText,
} from "./speech";
import {
  cancelNeuralSpeech,
  pauseNeuralSpeech,
  resumeNeuralSpeech,
  speakTextNeural,
} from "./neuralSpeech";

export interface UnifiedSpeakOptions {
  useNeural: boolean;
  rate?: number;
  voice?: SpeechSynthesisVoice; // solo aplica al backend browser
  onDone?: () => void;
  /** Solo se invoca si useNeural=true y la síntesis falla. Nunca rompe la
   * clase (sección 33): el llamador decide si ofrece fallback. */
  onNeuralError?: (message: string) => void;
}

/** Cancela cualquier audio en curso en AMBOS backends — siempre segura de
 * llamar, incluso si ninguno está reproduciendo nada. */
export function cancelAllSpeech(): void {
  cancelBrowserSpeech();
  cancelNeuralSpeech();
}

export function pauseAllSpeech(): void {
  pauseBrowserSpeech();
  pauseNeuralSpeech();
}

export function resumeAllSpeech(): void {
  resumeBrowserSpeech();
  resumeNeuralSpeech();
}

/** Lee una lista de textos en orden (uno detrás de otro), con el backend
 * elegido. Cancela cualquier audio previo (de cualquiera de los dos
 * backends) antes de empezar. Devuelve una función para cancelar la
 * secuencia en curso. */
export function speakSequenceUnified(texts: string[], options: UnifiedSpeakOptions): () => void {
  let cancelled = false;

  function speakAt(index: number) {
    if (cancelled) return;
    if (index >= texts.length) {
      options.onDone?.();
      return;
    }
    const text = texts[index];
    if (options.useNeural) {
      speakTextNeural(text, {
        speed: options.rate,
        onEnd: () => speakAt(index + 1),
        onError: (message) => {
          options.onNeuralError?.(message);
        },
      });
    } else {
      speakBrowserText(text, {
        rate: options.rate,
        voice: options.voice,
        onEnd: () => speakAt(index + 1),
      });
    }
  }

  cancelAllSpeech();
  speakAt(0);

  return () => {
    cancelled = true;
    cancelAllSpeech();
  };
}
