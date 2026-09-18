// Envoltorio delgado sobre la síntesis de voz neural opcional (OpenAI TTS
// vía POST /api/speech, Fase 7). Mismo espíritu que `speech.ts` (Fase 4):
// funciones chicas, sin estado de React, feature-detection explícita — acá
// la "feature detection" es simplemente si el backend reporta
// `voice.neural_configured=true` (ver `useVoicePreference.ts`).
//
// El audio SIEMPRE se reproduce con un único <audio> a la vez: cualquier
// síntesis nueva cancela/limpia la anterior antes de empezar (nunca dos
// audios simultáneos). El object URL del blob se revoca apenas termina o
// se cancela — nunca se guarda audio en localStorage/sessionStorage.
import { api } from "../api/client";

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

function cleanup(): void {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.src = "";
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }
  currentAudio = null;
  currentObjectUrl = null;
}

export interface NeuralSpeakOptions {
  speed?: number;
  onEnd?: () => void;
  /** Se invoca ante cualquier falla (sin credencial, error del proveedor,
   * timeout, request cancelado): nunca rompe la clase, el llamador decide
   * si ofrece fallback a voz del navegador (sección 33). */
  onError?: (message: string) => void;
}

/** Sintetiza y reproduce UN texto. Cancela cualquier audio neural previo
 * antes de empezar. No reescribe el texto: es exactamente el que ya pasó
 * por el pipeline de grounding (lesson narration / tutor answer chunk /
 * checkpoint feedback / certification question, sección 23). */
export async function speakTextNeural(text: string, options: NeuralSpeakOptions = {}): Promise<void> {
  if (!text) return;
  cleanup();
  try {
    const blob = await api.synthesizeSpeech(text, options.speed ?? 1.0);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    currentObjectUrl = url;
    audio.onended = () => {
      cleanup();
      options.onEnd?.();
    };
    audio.onerror = () => {
      cleanup();
      options.onError?.("No se pudo reproducir el audio generado.");
    };
    await audio.play();
  } catch {
    cleanup();
    options.onError?.("No se pudo generar voz neural.");
  }
}

export function pauseNeuralSpeech(): void {
  currentAudio?.pause();
}

export function resumeNeuralSpeech(): void {
  currentAudio?.play().catch(() => {
    // Reanudar puede fallar si el browser exige una interacción explícita
    // del usuario; no rompe nada, el alumno puede volver a pulsar Play.
  });
}

/** Cancela y limpia cualquier audio neural en curso — SIEMPRE segura de
 * llamar aunque no haya nada reproduciéndose (no-op). */
export function cancelNeuralSpeech(): void {
  cleanup();
}

export function isNeuralSpeechPlaying(): boolean {
  return !!currentAudio && !currentAudio.paused;
}
