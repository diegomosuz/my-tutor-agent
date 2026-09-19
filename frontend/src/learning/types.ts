// Tipos del modelo de Learning Progress (v1.1.0). Ver
// docs/LEARNING_PROGRESS.md para el contrato completo de qué se persiste,
// dónde, y qué NUNCA se persiste.
//
// Regla dura: este módulo nunca representa datos que no puedan derivarse
// de forma confiable del progreso real registrado por el aula/certificación
// (ver PARTE 1 de la especificación: "No inventar datos"). Campos como
// "horas estudiadas" deliberadamente no existen acá porque la aplicación
// no tiene una fuente confiable para calcularlos.

import type { CompetencyBreakdown, TopicBreakdown } from "../types/api";

export type TopicStatus = "not_started" | "in_progress" | "completed";
export type CertificationAttemptMode = "practice" | "simulation";

/** Progreso consolidado de UN tópico. `status` es un ratchet monótono:
 * not_started -> in_progress -> completed, nunca retrocede
 * automáticamente por navegar el aula (ver `markTopicStarted`). */
export interface TopicLearningProgress {
  moduleId: string;
  topicId: string;
  status: TopicStatus;
  startedAt: string | null;
  lastAccessedAt: string;
  completedAt: string | null;
  currentScene: number | null;
  totalScenes: number | null;
  /** content_sha256 del tópico en el momento en que se completó (o se
   * accedió por última vez), usado únicamente para detectar de forma NO
   * bloqueante que el contenido pudo haber cambiado desde entonces (ver
   * PARTE 13) — nunca se usa para desmarcar "completed" automáticamente. */
  contentSha256: string | null;
}

/** Resumen SEGURO de un intento de certificación ya terminado. NUNCA
 * incluye answer key (correct_option_ids), explicaciones privadas,
 * derivation_refs, prompts ni el Grounding Packet — solo agregados ya
 * públicos una vez evaluado el intento (ver PARTE 3). */
export interface CertificationAttemptSummary {
  attemptId: string;
  courseId: string;
  mode: CertificationAttemptMode;
  moduleIds: string[];
  topicIds: string[];
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  partialCount: number;
  incorrectCount: number;
  unansweredCount: number;
  scorePercentage: number;
  completedAt: string;
  performanceByTopic: TopicBreakdown[];
  competenciesToReinforce: CompetencyBreakdown[];
}

/** Progreso consolidado de UN curso: mapa de tópicos (clave
 * `${moduleId}:${topicId}`) + historial de intentos de certificación
 * (acotado, ver PARTE 4 — máximo `MAX_CERTIFICATION_ATTEMPTS_PER_COURSE`). */
export interface CourseLearningProgress {
  courseId: string;
  topics: Record<string, TopicLearningProgress>;
  certificationAttempts: CertificationAttemptSummary[];
}

export const LEARNING_PROGRESS_SCHEMA_VERSION = 1 as const;

/** Documento raíz único en localStorage (una sola key, ver PARTE 15 —
 * evita dispersar decenas de keys sueltas y simplifica reset/migración). */
export interface LearningProgressDocumentV1 {
  schemaVersion: typeof LEARNING_PROGRESS_SCHEMA_VERSION;
  /** ISO timestamp de cuándo corrió la migración desde las keys legacy de
   * classroomStorage (progreso pre-v1.1.0) — presente y no-null significa
   * "ya migramos, no reintentar" (idempotencia, ver PARTE 5). */
  migratedLegacyAt: string | null;
  courses: Record<string, CourseLearningProgress>;
}
