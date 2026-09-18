// Envoltorio delgado sobre la Web Speech API del navegador
// (window.speechSynthesis). Primera implementación funcional del botón
// "Activar Voz" (Fase 4) — NO es integración con un TTS avanzado (eso
// queda para una fase posterior, ver docs/ROADMAP.md).
//
// Reglas de diseño:
// - Feature detection explícita: si el navegador no soporta síntesis de
//   voz, todas las funciones son no-op seguras.
// - Nunca se asumen nombres específicos de voces instaladas en el SO/
//   navegador: se elige por `lang` (es-AR > cualquier es-* > default).
// - El texto que se lee es SIEMPRE narration.text tal cual (grounded, sin
//   modificar tecnicismos como "API Gateway" o "fine-tuning").

export function isSpeechSupported(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof window.SpeechSynthesisUtterance !== "undefined"
    );
  } catch {
    return false;
  }
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/**
 * Selecciona una voz en español entre las disponibles.
 * Prioridad: es-AR exacto > cualquier es-* > undefined (voz default del
 * navegador). Nunca depende de un nombre de voz específico.
 */
export function pickSpanishVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  const exactArgentina = voices.find((v) => v.lang?.toLowerCase() === "es-ar");
  if (exactArgentina) return exactArgentina;
  return voices.find((v) => v.lang?.toLowerCase().startsWith("es"));
}

export interface SpeakOptions {
  rate?: number;
  voice?: SpeechSynthesisVoice;
  onEnd?: () => void;
  onError?: () => void;
}

/** Encola un único texto para lectura. No modifica el texto recibido. */
export function speakText(text: string, options: SpeakOptions = {}): void {
  if (!isSpeechSupported() || !text) return;
  try {
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = options.voice?.lang ?? "es-ES";
    if (options.voice) utterance.voice = options.voice;
    utterance.rate = options.rate ?? 1.0;
    if (options.onEnd) utterance.onend = options.onEnd;
    if (options.onError) utterance.onerror = options.onError;
    window.speechSynthesis.speak(utterance);
  } catch {
    options.onError?.();
  }
}

export function pauseSpeech(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.pause();
  } catch {
    // ignorar
  }
}

export function resumeSpeech(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.resume();
  } catch {
    // ignorar
  }
}

/** Cancela cualquier utterance en curso o en cola. Se llama antes de
 * cambiar de escena, al pausar->cerrar, al salir del aula y al desmontar
 * el componente, para evitar voces superpuestas. */
export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignorar
  }
}
