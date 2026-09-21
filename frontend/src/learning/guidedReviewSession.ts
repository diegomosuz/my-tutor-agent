// Guided Review Session (v1.6.0, Bloque 3) — SESIÓN activa (posición
// actual dentro de un `GuidedReviewPlan` ya creado).
//
// Persistencia: `sessionStorage`, NO `localStorage` (PARTE 12) -- es
// transitoria por diseño: sobrevive cambios de ruta/refresh (a diferencia
// de un React state en memoria, que se perdería al recargar), pero
// desaparece al cerrar la pestaña/sesión del navegador, y nunca contamina
// Learning Progress permanente (`learningProgressStore.ts`, que sigue
// usando `localStorage` sin cambios). Mismo patrón de "una sola key raíz,
// documento versionado, saneado por-entidad, nunca lanza" que
// `learningProgressStore.ts` (PARTE 13).
//
// Contenido MÍNIMO (PARTE 11/71): identity de curso/tópicos + índice
// actual. Nunca scores, reason copy, títulos, Markdown, historial de
// certificación, respuestas del Tutor -- todo eso se resuelve desde el
// curriculum/stores reales cuando hace falta mostrarlo, nunca se
// duplica acá.
import type { GuidedReviewPlan, GuidedReviewTopicRef } from "./guidedReviewPlan";

export const GUIDED_REVIEW_SESSION_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY = "pwc-tutor:guided-review-session:v1";

export interface GuidedReviewSessionDocumentV1 {
  schemaVersion: typeof GUIDED_REVIEW_SESSION_SCHEMA_VERSION;
  courseId: string;
  topics: GuidedReviewTopicRef[];
  /** Índice dentro de `topics` -- cambia ÚNICAMENTE por una acción
   * explícita de "Siguiente/Anterior de repaso" (nunca inferido
   * comparando la URL actual, PARTE 25): navegar manualmente a un tópico
   * del plan (nav curricular, tema relacionado, browser Back) nunca lo
   * mueve solo. */
  currentIndex: number;
  /** Informativo únicamente (PARTE 11) -- nunca se usa en ninguna regla
   * de negocio ni se muestra como "tiempo de repaso". */
  startedAt: string;
}

function hasSessionStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
}

function isValidTopicRef(value: unknown): value is GuidedReviewTopicRef {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.moduleId === "string" && typeof r.topicId === "string";
}

function isValidDocument(value: unknown): value is GuidedReviewSessionDocumentV1 {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  if (d.schemaVersion !== GUIDED_REVIEW_SESSION_SCHEMA_VERSION) return false;
  if (typeof d.courseId !== "string") return false;
  if (!Array.isArray(d.topics) || d.topics.length === 0) return false;
  if (!d.topics.every(isValidTopicRef)) return false;
  if (typeof d.currentIndex !== "number" || d.currentIndex < 0 || d.currentIndex >= d.topics.length) return false;
  if (typeof d.startedAt !== "string") return false;
  return true;
}

function readDocument(): GuidedReviewSessionDocumentV1 | null {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidDocument(parsed) ? parsed : null;
  } catch {
    return null; // JSON corrupto / schema viejo: degrada a "sin sesión", nunca lanza.
  }
}

function writeDocument(doc: GuidedReviewSessionDocumentV1): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Cuota excedida u otro error: la sesión de repaso es una conveniencia,
    // nunca debe romper el aula.
  }
}

/** Crea una sesión nueva a partir de un plan ya construido (PARTE 16:
 * "Comenzar repaso"). Siempre arranca en el tópico 0. */
export function startGuidedReviewSession(plan: GuidedReviewPlan): void {
  writeDocument({
    schemaVersion: GUIDED_REVIEW_SESSION_SCHEMA_VERSION,
    courseId: plan.courseId,
    topics: plan.topics,
    currentIndex: 0,
    startedAt: new Date().toISOString(),
  });
}

/** `null` si no hay sesión, si está corrupta, o si pertenece a OTRO curso
 * (PARTE 14: aislamiento de curso -- una sesión de A nunca aparece en B). */
export function loadGuidedReviewSession(courseId: string): GuidedReviewSessionDocumentV1 | null {
  const doc = readDocument();
  if (!doc || doc.courseId !== courseId) return null;
  return doc;
}

/** Actualiza ÚNICAMENTE `currentIndex` -- llamado exclusivamente desde
 * los handlers de "Siguiente/Anterior de repaso" (PARTE 25), nunca desde
 * un efecto que compare la URL actual. No-op si no hay sesión activa. */
export function updateGuidedReviewSessionIndex(courseId: string, nextIndex: number): void {
  const doc = readDocument();
  if (!doc || doc.courseId !== courseId) return;
  if (nextIndex < 0 || nextIndex >= doc.topics.length) return;
  writeDocument({ ...doc, currentIndex: nextIndex });
}

/** Fin de la sesión (Finalizar o Salir del repaso, PARTE 35/36): siempre
 * borra por completo -- nunca queda una sesión "a medias". */
export function clearGuidedReviewSession(): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op: nada que limpiar si sessionStorage no está disponible.
  }
}

// ---------------------------------------------------------------------
// Resolución de posición -- funciones PURAS (nunca tocan sessionStorage,
// nunca navegan): reciben `topics`/`currentIndex` ya cargados y un
// predicado de validez curricular real, y devuelven qué mostrar/a dónde
// ir. Aisladas del I/O para ser trivialmente testeables (PARTE 42-style).
// ---------------------------------------------------------------------

export interface ResolvedGuidedReviewStep {
  ref: GuidedReviewTopicRef;
  /** Posición 1-based ENTRE LOS TÓPICOS VÁLIDOS únicamente (PARTE 15: un
   * tópico eliminado del curriculum nunca cuenta para "Tema X de N"). */
  position: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  /** Índice real dentro de `topics` que corresponde a `ref` -- puede
   * diferir de `currentIndex` de entrada si ESE índice específico
   * resultó stale y hubo que saltarlo hacia adelante (PARTE 15). */
  resolvedIndex: number;
}

/** Resuelve qué tópico corresponde mostrar dado `currentIndex`, saltando
 * determinísticamente cualquier tópico que el curriculum real ya no
 * contenga (PARTE 15/62). `null` si NINGÚN tópico del plan sigue siendo
 * válido (PARTE 63: la sesión debe poder terminar limpiamente). Nunca
 * retrocede al saltar: si el índice actual es stale, avanza al próximo
 * válido; si no queda ninguno después, cae en el último válido anterior
 * (nunca dispara un "Finalizar" fantasma solo porque el tópico
 * puntualmente actual desapareció). */
export function resolveGuidedReviewStep(
  topics: GuidedReviewTopicRef[],
  currentIndex: number,
  isValidTopic: (ref: GuidedReviewTopicRef) => boolean
): ResolvedGuidedReviewStep | null {
  const validIndices: number[] = [];
  topics.forEach((t, i) => {
    if (isValidTopic(t)) validIndices.push(i);
  });
  if (validIndices.length === 0) return null;

  const resolvedIndex =
    validIndices.find((i) => i >= currentIndex) ?? validIndices[validIndices.length - 1];
  const position = validIndices.indexOf(resolvedIndex) + 1;

  return {
    ref: topics[resolvedIndex],
    position,
    total: validIndices.length,
    isFirst: position === 1,
    isLast: position === validIndices.length,
    resolvedIndex,
  };
}

/** Próximo índice válido después de `fromIndex`, o `null` si no queda
 * ninguno (el llamador debe ofrecer "Finalizar repaso" en ese caso,
 * nunca inventar un destino). */
export function nextGuidedReviewIndex(
  topics: GuidedReviewTopicRef[],
  fromIndex: number,
  isValidTopic: (ref: GuidedReviewTopicRef) => boolean
): number | null {
  for (let i = fromIndex + 1; i < topics.length; i += 1) {
    if (isValidTopic(topics[i])) return i;
  }
  return null;
}

/** Índice válido anterior a `fromIndex`, o `null` si no hay ninguno (el
 * llamador debe deshabilitar/omitir "Anterior de repaso"). */
export function prevGuidedReviewIndex(
  topics: GuidedReviewTopicRef[],
  fromIndex: number,
  isValidTopic: (ref: GuidedReviewTopicRef) => boolean
): number | null {
  for (let i = fromIndex - 1; i >= 0; i -= 1) {
    if (isValidTopic(topics[i])) return i;
  }
  return null;
}
