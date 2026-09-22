// Guided Review Verification (v1.6.0, Bloque 4: "Verification &
// Learning-State Refresh") — contexto MÍNIMO y transitorio que recuerda
// que una Certification fue iniciada como verificación posterior a un
// Guided Review, más la derivación PURA del resultado de esa
// verificación.
//
// Regla dura (idéntica en espíritu a `guidedReviewSession.ts`): este
// contexto es DISTINTO de `GuidedReviewSession` (esa ya se limpia sola al
// terminar el repaso, PARTE 6 de la especificación) y nunca la reemplaza
// ni la reutiliza. Tampoco es evidencia: `learningState.ts` NUNCA lee
// este módulo, y nada acá participa de `deriveTopicLearningState` (PARTE
// 8) — solo sirve para (a) saber que "estos tópicos están siendo
// verificados" y (b) detectar que una Certification NUEVA y REAL se
// completó después, comparando identidad real de intentos
// (`attemptId`/`practiceId`, ver `certificationSummary.ts`), nunca
// `Date.now()` (PARTE 36).
//
// Persistencia: `sessionStorage`, mismo patrón de
// "documento versionado, saneado por-entidad, nunca lanza" que
// `guidedReviewSession.ts`/`certificationStorage.ts`. Contenido MÍNIMO
// (PARTE 5/55): identidad de curso + tópicos + snapshot de estado ANTES
// (solo status/reasonCode, nunca evidencia cruda duplicada) + la
// identidad del último intento conocido al momento de iniciar la
// verificación. NUNCA scores, respuestas, question_results, Markdown,
// conversación del Tutor.
import type { LearningState, LearningStateReasonCode, LearningStateStatus } from "./learningState";

export const GUIDED_REVIEW_VERIFICATION_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY = "pwc-tutor:guided-review-verification:v1";

export interface VerificationTopicRef {
  moduleId: string;
  topicId: string;
}

/** Snapshot de PRESENTACIÓN únicamente (PARTE 8 de la especificación):
 * nunca participa en ninguna regla de clasificación, solo permite que la
 * UI muestre "Antes: ... / Ahora: ..." de forma factual. */
export interface VerificationPreState {
  moduleId: string;
  topicId: string;
  status: LearningStateStatus;
  reasonCode: LearningStateReasonCode;
}

export interface GuidedReviewVerificationContext {
  schemaVersion: typeof GUIDED_REVIEW_VERIFICATION_SCHEMA_VERSION;
  courseId: string;
  topics: VerificationTopicRef[];
  /** `attemptId` (== `practiceId`, ver `certificationSummary.ts`) del
   * intento de certificación más reciente de este curso al momento de
   * iniciar la verificación, o `null` si el curso todavía no tenía
   * ningún intento. Único mecanismo de detección de "hay un intento
   * NUEVO real" (PARTE 36/37) — nunca timestamps. */
  latestAttemptIdAtStart: string | null;
  preVerificationStates: VerificationPreState[];
}

function hasSessionStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
}

function isValidTopicRef(value: unknown): value is VerificationTopicRef {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.moduleId === "string" && typeof r.topicId === "string";
}

function isValidPreState(value: unknown): value is VerificationPreState {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.moduleId === "string" &&
    typeof p.topicId === "string" &&
    typeof p.status === "string" &&
    typeof p.reasonCode === "string"
  );
}

function isValidContext(value: unknown): value is GuidedReviewVerificationContext {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  if (d.schemaVersion !== GUIDED_REVIEW_VERIFICATION_SCHEMA_VERSION) return false;
  if (typeof d.courseId !== "string") return false;
  if (!Array.isArray(d.topics) || d.topics.length === 0) return false;
  if (!d.topics.every(isValidTopicRef)) return false;
  if (d.latestAttemptIdAtStart !== null && typeof d.latestAttemptIdAtStart !== "string") return false;
  if (!Array.isArray(d.preVerificationStates) || !d.preVerificationStates.every(isValidPreState)) return false;
  return true;
}

function readContext(): GuidedReviewVerificationContext | null {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidContext(parsed) ? parsed : null;
  } catch {
    return null; // JSON corrupto / schema viejo: safe fallback, Certification histórica sigue funcionando.
  }
}

function writeContext(context: GuidedReviewVerificationContext): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Cuota excedida u otro error: el contexto es una conveniencia de UI,
    // nunca debe romper Certification.
  }
}

/** Crea el contexto al pulsar "Evaluar progreso" desde la tarjeta de
 * repaso completado (PARTE 10). `topics`/`preVerificationStates` deben
 * venir de `LearningState[]` real ya calculado por el llamador (nunca
 * recalculado acá). */
export function startGuidedReviewVerification(
  courseId: string,
  topics: VerificationTopicRef[],
  latestAttemptIdAtStart: string | null,
  preVerificationStates: VerificationPreState[]
): void {
  writeContext({
    schemaVersion: GUIDED_REVIEW_VERIFICATION_SCHEMA_VERSION,
    courseId,
    topics,
    latestAttemptIdAtStart,
    preVerificationStates,
  });
}

/** `null` si no hay contexto, si está corrupto, o si pertenece a OTRO
 * curso (PARTE 12: aislamiento de curso). */
export function loadGuidedReviewVerificationContext(courseId: string): GuidedReviewVerificationContext | null {
  const context = readContext();
  if (!context || context.courseId !== courseId) return null;
  return context;
}

/** Limpieza explícita (PARTE 31): al volver a "Mi aprendizaje", al
 * abandonar explícitamente el resultado ("Nueva práctica"), o ante
 * mismatch de curso/contexto inválido. Nunca se limpia automáticamente
 * al hacer submit — Results todavía lo necesita para mostrar el panel. */
export function clearGuidedReviewVerificationContext(): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op: nada que limpiar si sessionStorage no está disponible.
  }
}

// ---------------------------------------------------------------------
// Derivación PURA (PARTE 48): nunca toca storage, nunca navega, nunca usa
// React. Mismos `context`/`currentLearningStates`/`evaluatedTopics` de
// entrada siempre producen el mismo resultado.
// ---------------------------------------------------------------------

export interface VerificationTopicResult {
  moduleId: string;
  topicId: string;
  current: LearningState;
  /** `null` si no había snapshot previo para este tópico (nunca debería
   * pasar en el flujo normal, pero una función pura no debe asumirlo). */
  before: VerificationPreState | null;
}

function topicKey(moduleId: string, topicId: string): string {
  return `${moduleId}:${topicId}`;
}

/** `true` únicamente cuando el intento MÁS RECIENTE del curso (según el
 * progreso actual, ya ordenado más-reciente-primero por
 * `recordCertificationAttempt`) tiene una identidad distinta a la que
 * había al iniciar la verificación (PARTE 36/38: nunca un "falso
 * resultado de verificación" si el alumno todavía no entregó nada nuevo,
 * o si abandonó Certification antes de submit). */
export function hasNewVerificationAttempt(
  context: GuidedReviewVerificationContext,
  latestAttemptIdNow: string | null
): boolean {
  return latestAttemptIdNow !== null && latestAttemptIdNow !== context.latestAttemptIdAtStart;
}

/** Resultado de la verificación: SOLO los tópicos del contexto que (a)
 * siguen existiendo en el curriculum real actual (PARTE 49: stale-topic
 * skip, nunca crash) Y (b) fueron efectivamente evaluados por el intento
 * nuevo (PARTE 13: aislamiento de tópico — si el alumno cambió el alcance
 * manualmente en Setup antes de preparar, un tópico del contexto que NO
 * fue evaluado nunca aparece acá). Orden: el orden original de
 * `context.topics`. `[]` si no hay intersección (el llamador debe tratarlo
 * como "sin panel de verificación", PARTE 50 — nunca un panel vacío raro). */
export function deriveVerificationResults(
  context: GuidedReviewVerificationContext,
  currentLearningStates: LearningState[],
  evaluatedTopics: VerificationTopicRef[]
): VerificationTopicResult[] {
  const evaluatedKeys = new Set(evaluatedTopics.map((t) => topicKey(t.moduleId, t.topicId)));
  const currentByKey = new Map(currentLearningStates.map((s) => [topicKey(s.moduleId, s.topicId), s]));
  const preByKey = new Map(context.preVerificationStates.map((p) => [topicKey(p.moduleId, p.topicId), p]));

  const results: VerificationTopicResult[] = [];
  for (const topic of context.topics) {
    const key = topicKey(topic.moduleId, topic.topicId);
    if (!evaluatedKeys.has(key)) continue; // no evaluado por este intento: fuera de alcance.
    const current = currentByKey.get(key);
    if (!current) continue; // stale: el tópico ya no existe en el curriculum real.
    results.push({ moduleId: topic.moduleId, topicId: topic.topicId, current, before: preByKey.get(key) ?? null });
  }
  return results;
}
