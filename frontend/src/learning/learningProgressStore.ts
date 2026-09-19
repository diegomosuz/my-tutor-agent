// Learning Progress store (v1.1.0): capa única y testeable sobre
// localStorage para "Mi aprendizaje". Ver docs/LEARNING_PROGRESS.md.
//
// Reglas de diseño (PARTE 15 de la especificación):
// - Una sola key raíz en localStorage (documento JSON versionado) en vez
//   de dispersar decenas de keys sueltas — simplifica reset/migración.
// - Todo acceso está envuelto en try/catch: localStorage puede no estar
//   disponible (modo privado, cuota excedida, entornos de test) o
//   contener JSON corrupto, y eso NUNCA debe romper la aplicación — en
//   el peor caso se pierde el progreso local, nunca se lanza una excepción
//   hacia el componente que llama.
// - `status` de un tópico es un RATCHET monótono: not_started ->
//   in_progress -> completed, nunca retrocede automáticamente. Esto es
//   deliberado: `useClassroomEngine.previousScene()`/`goToScene()`
//   resetean su propio `isCompleted` interno al navegar hacia atrás (ese
//   flag representa el estado de la ESCENA actual, no si el tópico fue
//   completado alguna vez) — Learning Progress nunca lee ese flag de
//   forma continua, solo reacciona al EVENTO de que se volvió `true` una
//   vez (ver ClassroomPage.tsx), así que "volver atrás" o "repetir tema"
//   (que resetea classroomStorage por completo) nunca puede borrar un
//   `completed` ya registrado acá.
// - NUNCA se persiste acá: answer key, correct_option_ids, explicaciones
//   privadas, derivation_refs, prompts, Grounding Packet, API keys.
import type {
  CertificationAttemptSummary,
  CourseLearningProgress,
  LearningProgressDocumentV1,
  TopicLearningProgress,
  TopicStatus,
} from "./types";
import { LEARNING_PROGRESS_SCHEMA_VERSION } from "./types";

const STORAGE_KEY = "pwc-tutor:learning-progress:v1";
const LEGACY_PROGRESS_PREFIX = "pwc-tutor:progress:";

/** PARTE 4: no dejar crecer localStorage indefinidamente. Política simple
 * y explícita, sin infraestructura de retención compleja. */
export const MAX_CERTIFICATION_ATTEMPTS_PER_COURSE = 50;

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function emptyDocument(): LearningProgressDocumentV1 {
  return { schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, migratedLegacyAt: null, courses: {} };
}

function topicKey(moduleId: string, topicId: string): string {
  return `${moduleId}:${topicId}`;
}

function isValidTopicStatus(value: unknown): value is TopicStatus {
  return value === "not_started" || value === "in_progress" || value === "completed";
}

function isValidTopicProgress(value: unknown): value is TopicLearningProgress {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.moduleId === "string" &&
    typeof p.topicId === "string" &&
    isValidTopicStatus(p.status) &&
    typeof p.lastAccessedAt === "string"
  );
}

function isValidAttempt(value: unknown): value is CertificationAttemptSummary {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.attemptId === "string" &&
    typeof a.courseId === "string" &&
    (a.mode === "practice" || a.mode === "simulation") &&
    typeof a.questionCount === "number" &&
    typeof a.scorePercentage === "number" &&
    typeof a.completedAt === "string" &&
    Array.isArray(a.performanceByTopic)
  );
}

function isValidCourseProgress(value: unknown): value is CourseLearningProgress {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.courseId !== "string") return false;
  if (typeof c.topics !== "object" || c.topics === null) return false;
  if (!Array.isArray(c.certificationAttempts)) return false;
  return true;
}

/** Sanea un documento parseado desde localStorage: cada curso/tópico/
 * intento inválido se descarta individualmente en vez de invalidar todo
 * el documento (PARTE 5: "si una key antigua está corrupta, ignorar solo
 * esa entrada; no romper toda la aplicación"). */
function sanitizeDocument(raw: unknown): LearningProgressDocumentV1 {
  if (typeof raw !== "object" || raw === null) return emptyDocument();
  const doc = raw as Record<string, unknown>;
  if (doc.schemaVersion !== LEARNING_PROGRESS_SCHEMA_VERSION) return emptyDocument();

  const migratedLegacyAt = typeof doc.migratedLegacyAt === "string" ? doc.migratedLegacyAt : null;
  const coursesRaw = typeof doc.courses === "object" && doc.courses !== null ? doc.courses : {};

  const courses: Record<string, CourseLearningProgress> = {};
  for (const [courseId, courseValueRaw] of Object.entries(coursesRaw as Record<string, unknown>)) {
    if (!isValidCourseProgress(courseValueRaw)) continue;
    const courseValue = courseValueRaw;

    const topics: Record<string, TopicLearningProgress> = {};
    for (const [key, topicValue] of Object.entries(courseValue.topics)) {
      if (isValidTopicProgress(topicValue)) {
        topics[key] = {
          moduleId: topicValue.moduleId,
          topicId: topicValue.topicId,
          status: topicValue.status,
          startedAt: typeof topicValue.startedAt === "string" ? topicValue.startedAt : null,
          lastAccessedAt: topicValue.lastAccessedAt,
          completedAt: typeof topicValue.completedAt === "string" ? topicValue.completedAt : null,
          currentScene: typeof topicValue.currentScene === "number" ? topicValue.currentScene : null,
          totalScenes: typeof topicValue.totalScenes === "number" ? topicValue.totalScenes : null,
          contentSha256: typeof topicValue.contentSha256 === "string" ? topicValue.contentSha256 : null,
        };
      }
    }

    const certificationAttempts = courseValue.certificationAttempts.filter(isValidAttempt);

    courses[courseId] = { courseId, topics, certificationAttempts };
  }

  return { schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, migratedLegacyAt, courses };
}

function readRawDocument(): LearningProgressDocumentV1 {
  if (!hasLocalStorage()) return emptyDocument();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDocument();
    return sanitizeDocument(JSON.parse(raw));
  } catch {
    return emptyDocument();
  }
}

function writeDocument(doc: LearningProgressDocumentV1): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Cuota excedida u otro error: Learning Progress es una conveniencia,
    // nunca debe romper el aula ni la certificación.
  }
}

// --------------------------------------------------------------------------
// Migración desde classroomStorage (progreso pre-v1.1.0) — PARTE 5.
// Determinística e idempotente: corre una sola vez (marcada por
// `migratedLegacyAt`), nunca sobrescribe un tópico que ya exista en el
// documento nuevo, y una entrada legacy corrupta se ignora sin romper el
// resto.
// --------------------------------------------------------------------------

interface LegacyTopicProgress {
  courseId: string;
  moduleId: string;
  topicId: string;
  contentSha256: string;
  currentSceneIndex: number;
  completed: boolean;
  updatedAt: string;
}

function isValidLegacyProgress(value: unknown): value is LegacyTopicProgress {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.courseId === "string" &&
    typeof p.moduleId === "string" &&
    typeof p.topicId === "string" &&
    typeof p.completed === "boolean"
  );
}

function readLegacyCompletedTopics(): LegacyTopicProgress[] {
  if (!hasLocalStorage()) return [];
  const results: LegacyTopicProgress[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_PROGRESS_PREFIX)) continue;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed: unknown = JSON.parse(raw);
        if (isValidLegacyProgress(parsed) && parsed.completed) {
          results.push(parsed);
        }
      } catch {
        // Entrada legacy puntual corrupta: se ignora, no rompe la migración.
      }
    }
  } catch {
    // localStorage.length/key pueden fallar en entornos raros: sin migración.
  }
  return results;
}

function migrateLegacyIfNeeded(doc: LearningProgressDocumentV1): LearningProgressDocumentV1 {
  if (doc.migratedLegacyAt) return doc; // ya migrado: idempotente, no reprocesar.

  const legacyCompleted = readLegacyCompletedTopics();
  const courses: Record<string, CourseLearningProgress> = { ...doc.courses };

  for (const legacy of legacyCompleted) {
    const course = courses[legacy.courseId] ?? {
      courseId: legacy.courseId,
      topics: {},
      certificationAttempts: [],
    };
    const key = topicKey(legacy.moduleId, legacy.topicId);
    // Nunca pisar un tópico que el documento nuevo ya conozca (evita que
    // una migración tardía sobrescriba progreso ya registrado por v1.1.0).
    if (course.topics[key]) continue;
    course.topics = {
      ...course.topics,
      [key]: {
        moduleId: legacy.moduleId,
        topicId: legacy.topicId,
        status: "completed",
        startedAt: null, // desconocido: el formato legacy nunca lo guardó.
        lastAccessedAt: legacy.updatedAt || new Date().toISOString(),
        completedAt: legacy.updatedAt || new Date().toISOString(),
        currentScene: typeof legacy.currentSceneIndex === "number" ? legacy.currentSceneIndex : null,
        totalScenes: null,
        contentSha256: legacy.contentSha256 || null,
      },
    };
    courses[legacy.courseId] = course;
  }

  return { ...doc, migratedLegacyAt: new Date().toISOString(), courses };
}

/** Carga el documento actual, migrando datos legacy una sola vez si
 * corresponde. Siempre devuelve un documento válido (nunca null/throws). */
export function load(): LearningProgressDocumentV1 {
  const doc = readRawDocument();
  const migrated = migrateLegacyIfNeeded(doc);
  if (migrated !== doc) writeDocument(migrated);
  return migrated;
}

function getOrCreateCourse(
  doc: LearningProgressDocumentV1,
  courseId: string
): CourseLearningProgress {
  return doc.courses[courseId] ?? { courseId, topics: {}, certificationAttempts: [] };
}

/** Tópico abierto / clase iniciada / escena cambiada (PARTE 2). Nunca
 * degrada un status ya alcanzado (`in_progress`/`completed` permanecen).
 * `totalScenes`/`currentScene` son puramente informativos. */
export function markTopicStarted(
  courseId: string,
  moduleId: string,
  topicId: string,
  options?: { currentScene?: number; totalScenes?: number; contentSha256?: string }
): void {
  const doc = load();
  const course = getOrCreateCourse(doc, courseId);
  const key = topicKey(moduleId, topicId);
  const existing = course.topics[key];
  const now = new Date().toISOString();

  const next: TopicLearningProgress = existing
    ? {
        ...existing,
        status: existing.status === "not_started" ? "in_progress" : existing.status,
        startedAt: existing.startedAt ?? now,
        lastAccessedAt: now,
        currentScene: options?.currentScene ?? existing.currentScene,
        totalScenes: options?.totalScenes ?? existing.totalScenes,
        contentSha256: options?.contentSha256 ?? existing.contentSha256,
      }
    : {
        moduleId,
        topicId,
        status: "in_progress",
        startedAt: now,
        lastAccessedAt: now,
        completedAt: null,
        currentScene: options?.currentScene ?? null,
        totalScenes: options?.totalScenes ?? null,
        contentSha256: options?.contentSha256 ?? null,
      };

  course.topics = { ...course.topics, [key]: next };
  doc.courses = { ...doc.courses, [courseId]: course };
  writeDocument(doc);
}

/** Tópico completado (PARTE 2). Ratchet de una sola dirección: una vez
 * `completed`, `completedAt` original se preserva (no se pisa por volver
 * a completar el mismo tópico de nuevo). */
export function markTopicCompleted(
  courseId: string,
  moduleId: string,
  topicId: string,
  contentSha256?: string
): void {
  const doc = load();
  const course = getOrCreateCourse(doc, courseId);
  const key = topicKey(moduleId, topicId);
  const existing = course.topics[key];
  const now = new Date().toISOString();

  const next: TopicLearningProgress = {
    moduleId,
    topicId,
    status: "completed",
    startedAt: existing?.startedAt ?? now,
    lastAccessedAt: now,
    completedAt: existing?.completedAt ?? now,
    currentScene: existing?.currentScene ?? null,
    totalScenes: existing?.totalScenes ?? null,
    contentSha256: contentSha256 ?? existing?.contentSha256 ?? null,
  };

  course.topics = { ...course.topics, [key]: next };
  doc.courses = { ...doc.courses, [courseId]: course };
  writeDocument(doc);
}

/** Registra un intento de certificación YA terminado y evaluado (PARTE 3).
 * Aplica la política de retención (PARTE 4: máximo
 * `MAX_CERTIFICATION_ATTEMPTS_PER_COURSE`, se conservan los más
 * recientes). El objeto `attempt` debe venir ya saneado por el llamador
 * (nunca debe contener answer key — ver `certification/attemptSummary.ts`). */
export function recordCertificationAttempt(
  courseId: string,
  attempt: CertificationAttemptSummary
): void {
  const doc = load();
  const course = getOrCreateCourse(doc, courseId);
  const withNew = [...course.certificationAttempts, attempt].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  course.certificationAttempts = withNew.slice(0, MAX_CERTIFICATION_ATTEMPTS_PER_COURSE);
  doc.courses = { ...doc.courses, [courseId]: course };
  writeDocument(doc);
}

/** Progreso crudo de un curso (o null si nunca se tocó). El llamador
 * (LearningProgressPage) lo combina con la estructura real del curso
 * (`CourseDetail`, vía API) para completar títulos y tópicos nunca
 * iniciados — este store nunca guarda títulos, solo ids. */
export function getCourseLearningProgress(courseId: string): CourseLearningProgress | null {
  const doc = load();
  return doc.courses[courseId] ?? null;
}

/** Todos los course_id con algún progreso registrado (para el selector de
 * curso cuando hay más de uno, PARTE 12). */
export function getCourseIdsWithProgress(): string[] {
  const doc = load();
  return Object.keys(doc.courses);
}

/** Borra el progreso de aprendizaje/certificación de UN curso (PARTE 14).
 * Nunca toca otros cursos, configuración del sistema, caches del backend
 * ni credenciales — esto es exclusivamente el documento de Learning
 * Progress de este curso. */
export function resetCourseProgress(courseId: string): void {
  const doc = load();
  if (!(courseId in doc.courses)) return;
  const { [courseId]: _removed, ...rest } = doc.courses;
  doc.courses = rest;
  writeDocument(doc);
}
