// v1.5.0 ("Guided Markdown Read Aloud"): mecanismo MÍNIMO de prioridad de
// audio entre la narración/voz de IA existente (AI_AUDIO: narración de
// clase, voz del tutor) y el nuevo Markdown Reader (MARKDOWN_READER).
//
// AI_AUDIO > MARKDOWN_READER, siempre (PARTE 4 de la especificación). En
// vez de un framework genérico de "audio ownership", esto es un pub/sub
// de una sola señal: los puntos reales donde arranca audio de IA
// (`handleGenerateLesson`, el efecto de narración en
// `useClassroomVoice.ts`, la voz del tutor en `TutorPanel.tsx`) llaman a
// `claimAiAudioPriority()` ANTES de empezar a sintetizar/reproducir nada
// -- el Markdown Reader se suscribe y se detiene inmediatamente, sin
// esperar a que el audio de IA realmente empiece a sonar (PARTE 6: la
// prioridad arranca en el EVENTO de generación/narración, no en el
// primer byte de audio).
//
// PARTE 45 ("AI voice paused pero sigue siendo owner"): mientras la
// narración de la clase esté habilitada (`voiceEnabled && !isCompleted &&
// !!currentScene`, sin importar si está en pausa), el botón del Reader
// queda deshabilitado por `aiAudioSessionActive` (prop calculada en
// `ClassroomPage.tsx`, pasada directo a `useReadAloud`) -- esa señal
// cubre toda la SESIÓN de narración, no un chunk puntual.
//
// `setAiAudioActive`/`isAiAudioActive`/`onAiAudioActiveChange` (bug real
// de hardening v1.5.0): la voz del tutor/checkpoint/certificación no
// tiene un equivalente de `aiAudioSessionActive` -- solo dispara
// `claimAiAudioPriority()` UNA vez, al arrancar la secuencia. Sin esta
// señal complementaria, el Reader volvía a quedar "enabled" apenas
// terminaba ese primer instante, así que un alumno podía reiniciarlo a
// mitad de una respuesta hablada de varios chunks del tutor y producir
// dos audios sonando a la vez (confirmado con instrumentación real de
// `HTMLAudioElement`, ver docs/GUIDED_READ_ALOUD_V1_5.md). Esta señal
// SÍ representa "está sonando ahora mismo" (a diferencia del claim, que
// es un evento puntual): la marca `voicePlayback.ts` (el único choque
// compartido por todos los consumidores de voz de IA), nunca un
// consumidor individual.
type Listener = () => void;
type ActiveListener = (active: boolean) => void;

const listeners = new Set<Listener>();
const activeListeners = new Set<ActiveListener>();
let aiAudioActive = false;

/** El Markdown Reader llama a esto una vez, al montar sus controles, y
 * limpia la suscripción al desmontar. */
export function onAiAudioPriority(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Llamado desde los puntos reales donde arranca audio de IA (nunca desde
 * el propio Markdown Reader -- si lo llamara, "robaría prioridad" a sí
 * mismo sin sentido). Notifica a todos los suscriptores para que se
 * detengan de inmediato. */
export function claimAiAudioPriority(): void {
  listeners.forEach((listener) => listener());
}

/** Llamado únicamente desde `voicePlayback.ts` (nunca desde el Reader ni
 * desde un consumidor individual como el tutor): `true` mientras
 * `speakSequenceUnified` tiene una secuencia en curso, `false` en cuanto
 * termina (natural o cancelada). No-op si el valor no cambió. */
export function setAiAudioActive(active: boolean): void {
  if (aiAudioActive === active) return;
  aiAudioActive = active;
  activeListeners.forEach((listener) => listener(active));
}

export function isAiAudioActive(): boolean {
  return aiAudioActive;
}

export function onAiAudioActiveChange(listener: ActiveListener): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}
