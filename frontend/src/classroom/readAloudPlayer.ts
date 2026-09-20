// v1.5.0 ("Guided Markdown Read Aloud"): primitiva de reproducción del
// Reader. Reutiliza el MISMO endpoint/cliente de voz neural
// (`api.synthesizeSpeech`, Fase 7) y el MISMO wrapper de voz del
// navegador (`speech.ts`, Fase 4) que ya usa el resto de la app -- nunca
// un segundo backend/cliente TTS (PARTE 3).
//
// Por qué este módulo NO reutiliza `neuralSpeech.ts`/`voicePlayback.ts`
// tal cual (documentado también en docs/GUIDED_READ_ALOUD_V1_5.md):
// `speakTextNeural` hace fetch+play en un solo paso, con un único slot de
// estado -- perfecto para narración estrictamente secuencial, pero
// incompatible con "adelantar la síntesis del segmento siguiente
// mientras el actual todavía suena" (PARTE 22-24): llamarlo para
// prefetch cancelaría inmediatamente el audio en curso. Este módulo
// resuelve eso permitiendo hasta `MAX_PENDING_PREFETCH` fetches en vuelo
// a la vez, cada uno con su propio AbortController, más UN único
// <audio> activo a la vez (igual invariante de "nunca dos sonando" que
// el resto de la app, solo que acá se necesita más de un fetch
// concurrente para lograrlo sin gaps).
//
// Singleton a nivel de módulo (mismo patrón que `neuralSpeech.ts`): solo
// existe una sesión de Reader activa a la vez en toda la app.
import { api } from "../api/client";
import { pauseSpeech, resumeSpeech, cancelSpeech, speakText, isSpeechSupported } from "./speech";

export const MAX_PENDING_PREFETCH = 2;

export interface ReadAloudPlayerConfig {
  useNeural: boolean;
  voice?: SpeechSynthesisVoice;
}

export interface PlaySegmentCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

let epoch = 0;
let config: ReadAloudPlayerConfig = { useNeural: false };
let rate = 1.0;

// --- Neural: prefetch de blobs (fetch únicamente, nunca reproduce) -----
const neuralFetches = new Map<number, { promise: Promise<Blob>; controller: AbortController }>();
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

function releaseActiveAudio(): void {
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio.src = "";
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
  }
  activeAudio = null;
  activeObjectUrl = null;
}

function abortAllPrefetch(): void {
  neuralFetches.forEach(({ controller }) => controller.abort());
  neuralFetches.clear();
}

/** Configura el backend (neural vs. navegador) y la voz del navegador a
 * usar para esta sesión de lectura -- llamado una vez al iniciar el
 * Reader (nunca cambia backend a mitad de una lectura en curso). */
export function configureReadAloudPlayer(next: ReadAloudPlayerConfig): void {
  config = next;
}

export function setReadAloudRate(next: number): void {
  rate = next;
  // PARTE 29: el audio neural YA reproduciéndose adopta el nuevo rate de
  // inmediato vía playbackRate, sin resintetizar.
  if (activeAudio) activeAudio.playbackRate = next;
}

/** Adelanta la síntesis de un segmento (solo backend neural; la voz del
 * navegador no tiene concepto de red/prefetch, PARTE 24). Nunca reemplaza
 * un fetch ya en vuelo para el mismo id. Siempre a `speed=1.0`: el rate
 * elegido por el alumno se aplica en reproducción vía `playbackRate`
 * (PARTE 29), nunca reenviando una síntesis distinta por cambio de
 * velocidad. */
export function prefetchSegment(id: number, text: string): void {
  if (!config.useNeural) return;
  if (neuralFetches.has(id)) return;
  const controller = new AbortController();
  const promise = api.synthesizeSpeech(text, 1.0, controller.signal);
  // Nunca debe generar un "unhandled rejection" solo por quedar
  // descartado (stop/abort/cambio de tópico) antes de que alguien lea el
  // resultado.
  promise.catch(() => {});
  neuralFetches.set(id, { promise, controller });
}

export function isSegmentPrefetched(id: number): boolean {
  return neuralFetches.has(id);
}

/** Reproduce un segmento. Si ya fue prefetcheado (o su fetch está en
 * vuelo), reutiliza ese resultado -- nunca dispara una segunda síntesis
 * para el mismo id. Cancela cualquier audio activo antes de empezar
 * (invariante de un único audio a la vez). */
export async function playSegment(
  id: number,
  text: string,
  callbacks: PlaySegmentCallbacks = {}
): Promise<void> {
  const myEpoch = ++epoch;
  releaseActiveAudio();

  if (!config.useNeural) {
    if (!isSpeechSupported()) {
      callbacks.onError?.("La lectura por voz no está disponible en este navegador.");
      return;
    }
    speakText(text, {
      rate,
      voice: config.voice,
      onStart: () => {
        if (myEpoch !== epoch) return;
        callbacks.onStart?.();
      },
      onEnd: () => {
        if (myEpoch !== epoch) return;
        callbacks.onEnd?.();
      },
      onError: () => {
        if (myEpoch !== epoch) return;
        callbacks.onError?.("No se pudo leer este fragmento.");
      },
    });
    return;
  }

  try {
    let entry = neuralFetches.get(id);
    if (!entry) {
      prefetchSegment(id, text);
      entry = neuralFetches.get(id);
    }
    const blob = await entry!.promise;
    neuralFetches.delete(id);
    if (myEpoch !== epoch) return; // obsoleto: se detuvo/avanzó mientras esperábamos

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = rate;
    activeAudio = audio;
    activeObjectUrl = url;
    audio.onended = () => {
      if (myEpoch !== epoch) return;
      releaseActiveAudio();
      callbacks.onEnd?.();
    };
    audio.onerror = () => {
      if (myEpoch !== epoch) return;
      releaseActiveAudio();
      callbacks.onError?.("No se pudo reproducir el audio generado.");
    };
    await audio.play();
    if (myEpoch !== epoch) {
      releaseActiveAudio();
      return;
    }
    callbacks.onStart?.();
  } catch {
    neuralFetches.delete(id);
    if (myEpoch !== epoch) return; // cancelación esperada (AbortController), no es un error real
    callbacks.onError?.("No se pudo generar voz para este fragmento.");
  }
}

export function pauseActiveSegment(): void {
  if (config.useNeural) {
    activeAudio?.pause();
  } else {
    pauseSpeech();
  }
}

export function resumeActiveSegment(): void {
  if (config.useNeural) {
    activeAudio?.play().catch(() => {
      // Igual criterio que neuralSpeech.ts: reanudar puede requerir una
      // interacción explícita del usuario en algunos navegadores; nunca
      // rompe nada, el alumno puede volver a pulsar Reanudar.
    });
  } else {
    resumeSpeech();
  }
}

/** Detiene todo (audio activo + fetches prefetcheados en vuelo) e
 * invalida cualquier callback async pendiente -- se llama en Stop,
 * prioridad de IA, cambio de tópico y unmount. Siempre segura de llamar
 * aunque no haya nada en curso. */
export function stopReadAloudPlayer(): void {
  epoch += 1;
  abortAllPrefetch();
  releaseActiveAudio();
  cancelSpeech();
}
