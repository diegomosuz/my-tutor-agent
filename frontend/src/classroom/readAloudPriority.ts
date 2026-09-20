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
// `setAiAudioActive`/`isAiAudioActive` es la señal complementaria para
// PARTE 45 ("AI voice paused pero sigue siendo owner"): mientras la
// narración de la clase esté habilitada (`voiceEnabled && !isCompleted`,
// sin importar si está en pausa) o la voz del tutor esté efectivamente
// hablando, el botón del Reader queda deshabilitado -- nunca "roba" el
// audio a una sesión de IA que el alumno no cerró explícitamente.
type Listener = () => void;

const listeners = new Set<Listener>();
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

export function setAiAudioActive(active: boolean): void {
  aiAudioActive = active;
}

export function isAiAudioActive(): boolean {
  return aiAudioActive;
}
