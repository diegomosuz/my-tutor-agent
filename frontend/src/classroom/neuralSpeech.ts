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
//
// v1.3.0 (bloque "Classroom UX + Voice Lifecycle"): bug real corregido —
// `speakTextNeural` hace un fetch de red real (`POST /api/speech`) antes de
// poder reproducir nada. Si el usuario cambia de escena/tópico MIENTRAS ese
// fetch está en vuelo, la respuesta llega "tarde": antes de este fix, esa
// respuesta tardía igual pisaba `currentAudio` y arrancaba a sonar, sin
// importar que ya hubiera un audio nuevo (o ninguno) reproduciéndose — dos
// voces sonando a la vez. Se corrige con un doble mecanismo (PARTE 5 de la
// especificación, "AbortController y/o epoch"):
// 1. `AbortController` real, cancela el fetch de red en curso (ahorra la
//    llamada real a OpenAI TTS que de todos modos se iba a descartar).
// 2. Un `playbackToken` incremental: cada `speakTextNeural`/`cleanup()`
//    invalida cualquier llamada anterior en curso. Cualquier punto async
//    (post-fetch, post-`audio.play()`) vuelve a chequear su propio token
//    contra el token global antes de tocar `currentAudio` — cubre también
//    la ventana entre que el audio ya se creó y `play()` resuelve, que un
//    AbortController de fetch no protege.
import { api } from "../api/client";

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let currentAbortController: AbortController | null = null;
let playbackToken = 0;

function cleanup(): void {
  playbackToken += 1; // invalida cualquier respuesta async en vuelo
  currentAbortController?.abort();
  currentAbortController = null;
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
   * si ofrece fallback a voz del navegador (sección 33). Nunca se invoca
   * para una llamada que ya quedó obsoleta (ver playbackToken arriba). */
  onError?: (message: string) => void;
}

/** Sintetiza y reproduce UN texto. Cancela cualquier audio neural previo
 * (y su fetch de red, si todavía estaba en vuelo) antes de empezar. No
 * reescribe el texto: es exactamente el que ya pasó por el pipeline de
 * grounding (lesson narration / tutor answer chunk / checkpoint feedback /
 * certification question, sección 23). */
export async function speakTextNeural(text: string, options: NeuralSpeakOptions = {}): Promise<void> {
  if (!text) return;
  cleanup();
  const myToken = playbackToken;
  const controller = new AbortController();
  currentAbortController = controller;
  try {
    const blob = await api.synthesizeSpeech(text, options.speed ?? 1.0, controller.signal);
    if (myToken !== playbackToken) return; // obsoleta: alguien más ya canceló/arrancó otra
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
    if (myToken !== playbackToken) {
      // Se volvió obsoleta durante el propio play() async (ventana chica
      // pero real): nunca debe quedar sonando.
      cleanup();
    }
  } catch {
    if (myToken !== playbackToken) return; // cancelación esperada (AbortController), no es un error real
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

/** Cancela y limpia cualquier audio neural en curso (y su fetch en vuelo,
 * si lo hay) — SIEMPRE segura de llamar aunque no haya nada
 * reproduciéndose (no-op). */
export function cancelNeuralSpeech(): void {
  cleanup();
}

export function isNeuralSpeechPlaying(): boolean {
  return !!currentAudio && !currentAudio.paused;
}
