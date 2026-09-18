// Persistencia local mínima del aula virtual (Fase 4).
//
// Reglas de diseño (ver docs/ARCHITECTURE.md):
// - Por tópico se guarda solo un puntero de progreso liviano, NUNCA la
//   LessonPlan completa (esa ya tiene su propia cache en el backend,
//   filesystem, ver Fase 3).
// - Si `contentSha256` no coincide con el de la LessonPlan actual, el
//   progreso guardado se considera obsoleto y NO se aplica automáticamente
//   (el contenido cambió: el motor arranca desde la escena 0).
// - Toda lectura/escritura está envuelta en try/catch: localStorage puede
//   no estar disponible (modo privado, cuota excedida, entornos de test) y
//   eso nunca debe romper el aula.

const PROGRESS_PREFIX = "pwc-tutor:progress:";
const VOICE_ENABLED_KEY = "pwc-tutor:voice-enabled";
const VOICE_SPEED_KEY = "pwc-tutor:voice-speed";

export interface TopicProgress {
  courseId: string;
  moduleId: string;
  topicId: string;
  contentSha256: string;
  currentSceneIndex: number;
  completed: boolean;
  updatedAt: string;
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function progressKey(courseId: string, moduleId: string, topicId: string): string {
  return `${PROGRESS_PREFIX}${courseId}:${moduleId}:${topicId}`;
}

function isValidProgress(value: unknown): value is TopicProgress {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.courseId === "string" &&
    typeof p.moduleId === "string" &&
    typeof p.topicId === "string" &&
    typeof p.contentSha256 === "string" &&
    typeof p.currentSceneIndex === "number" &&
    typeof p.completed === "boolean"
  );
}

export function loadTopicProgress(
  courseId: string,
  moduleId: string,
  topicId: string
): TopicProgress | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(progressKey(courseId, moduleId, topicId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidProgress(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTopicProgress(progress: TopicProgress): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(
      progressKey(progress.courseId, progress.moduleId, progress.topicId),
      JSON.stringify(progress)
    );
  } catch {
    // Cuota excedida u otro error de storage: el progreso es una
    // conveniencia, nunca debe romper el aula.
  }
}

export function clearTopicProgress(courseId: string, moduleId: string, topicId: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(progressKey(courseId, moduleId, topicId));
  } catch {
    // ignorar
  }
}

// --- Preferencias de voz (solo booleano/número, nunca objetos de voz) ---

export function loadVoiceEnabled(): boolean {
  if (!hasLocalStorage()) return false;
  try {
    return window.localStorage.getItem(VOICE_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveVoiceEnabled(enabled: boolean): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(VOICE_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignorar
  }
}

export const VOICE_SPEED_OPTIONS = [0.85, 1.0, 1.15, 1.3] as const;
export type VoiceSpeed = (typeof VOICE_SPEED_OPTIONS)[number];
export const DEFAULT_VOICE_SPEED: VoiceSpeed = 1.0;

export function loadVoiceSpeed(): VoiceSpeed {
  if (!hasLocalStorage()) return DEFAULT_VOICE_SPEED;
  try {
    const raw = window.localStorage.getItem(VOICE_SPEED_KEY);
    const parsed = raw ? Number.parseFloat(raw) : NaN;
    const match = VOICE_SPEED_OPTIONS.find((option) => option === parsed);
    return match ?? DEFAULT_VOICE_SPEED;
  } catch {
    return DEFAULT_VOICE_SPEED;
  }
}

export function saveVoiceSpeed(speed: VoiceSpeed): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(VOICE_SPEED_KEY, String(speed));
  } catch {
    // ignorar
  }
}
