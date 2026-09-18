// Persistencia local de la sesión de práctica de certificación (Fase 6).
//
// Reglas de diseño (sección 50-51 de la especificación de Fase 6):
// - sessionStorage, NUNCA localStorage: una práctica es de la sesión
//   actual del navegador, no un historial permanente.
// - Clave atada a course_id + practice_id: un practice_id nuevo (una
//   preparación nueva) nunca se confunde con una sesión vieja.
// - NUNCA se guarda el answer key (correct_option_ids/explanation) antes
//   de que el alumno responda: `selections` solo guarda
//   question_id -> selected_option_ids elegidos por el alumno.
//   `evaluations` (Practice) solo se completa DESPUÉS de llamar a
//   evaluate-question, nunca antes.
// - Toda lectura/escritura está envuelta en try/catch: sessionStorage
//   puede no estar disponible (modo privado, cuota excedida, entornos de
//   test) y eso nunca debe romper la práctica.
import type {
  CertificationMode,
  CertificationPracticeResult,
  ExamQuestionView,
  QuestionEvaluation,
} from "../types/api";

const EXAM_PREFIX = "pwc-tutor:certification-exam:";
const RESULT_PREFIX = "pwc-tutor:certification-result:";

export interface StoredExamSession {
  practiceId: string;
  courseId: string;
  mode: CertificationMode;
  requestedCount: number;
  actualCount: number;
  questions: ExamQuestionView[];
  currentIndex: number;
  /** question_id -> selected_option_ids elegidos por el alumno (borrador,
   * nunca incluye el answer key). */
  selections: Record<string, string[]>;
  /** Solo Practice: question_id -> QuestionEvaluation, completado
   * únicamente DESPUÉS de llamar a evaluate-question para esa pregunta. */
  evaluations: Record<string, QuestionEvaluation>;
}

function hasSessionStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
}

function examKey(courseId: string): string {
  return `${EXAM_PREFIX}${courseId}`;
}

function resultKey(courseId: string): string {
  return `${RESULT_PREFIX}${courseId}`;
}

function isValidExamSession(value: unknown): value is StoredExamSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.practiceId === "string" &&
    typeof s.courseId === "string" &&
    typeof s.mode === "string" &&
    Array.isArray(s.questions) &&
    typeof s.currentIndex === "number" &&
    typeof s.selections === "object" &&
    typeof s.evaluations === "object"
  );
}

export function loadExamSession(courseId: string): StoredExamSession | null {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(examKey(courseId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidExamSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveExamSession(session: StoredExamSession): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(examKey(session.courseId), JSON.stringify(session));
  } catch {
    // Cuota excedida u otro error: la restauración es una conveniencia,
    // nunca debe romper la práctica en curso.
  }
}

export function clearExamSession(courseId: string): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(examKey(courseId));
  } catch {
    // ignorar
  }
}

export function loadCertificationResult(courseId: string): CertificationPracticeResult | null {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(resultKey(courseId));
    return raw ? (JSON.parse(raw) as CertificationPracticeResult) : null;
  } catch {
    return null;
  }
}

export function saveCertificationResult(
  courseId: string,
  result: CertificationPracticeResult
): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(resultKey(courseId), JSON.stringify(result));
  } catch {
    // ignorar
  }
}

export function clearCertificationResult(courseId: string): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(resultKey(courseId));
  } catch {
    // ignorar
  }
}
