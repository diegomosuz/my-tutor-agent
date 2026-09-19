// Persistencia local de la sesión de práctica de certificación (Fase 6,
// corregido en Fase 7 sección 4).
//
// Reglas de diseño:
// - sessionStorage, NUNCA localStorage: una práctica es de la sesión
//   actual del navegador, no un historial permanente.
// - Clave atada a course_id + practice_id (no solo course_id — bug real
//   de Fase 6 corregido en Fase 7: dos practice_id del mismo curso
//   compartían la misma entrada de sessionStorage y podían pisarse entre
//   sí). Como las páginas (Practice/Simulation/Results) solo conocen
//   courseId por la URL, se mantiene además un puntero liviano
//   "cuál es el practice_id activo de este curso" para poder encontrar la
//   sesión activa sin tener que pasar practice_id por la URL.
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

const ACTIVE_PREFIX = "pwc-tutor:certification-active:";
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
  /** answerKey(bank_id, question_id) -> selected_option_ids elegidos por
   * el alumno (borrador, nunca incluye el answer key). */
  selections: Record<string, string[]>;
  /** Solo Practice: answerKey(bank_id, question_id) -> QuestionEvaluation,
   * completado únicamente DESPUÉS de llamar a evaluate-question para esa
   * pregunta. */
  evaluations: Record<string, QuestionEvaluation>;
}

/** `question_id` (p.ej. "Q-002") solo es único DENTRO de un QuestionBank:
 * cada tópico numera su propio banco desde Q-001, así que un examen
 * ensamblado con preguntas de varios tópicos (round-robin, ver
 * `certification_service.py::_round_robin_select`) puede legítimamente
 * repetir el mismo `question_id` para preguntas de bancos distintos. Toda
 * estructura del frontend que identifique una pregunta DENTRO de un examen
 * ya ensamblado (selections, evaluations, keys de listas, lookups) debe
 * usar esta clave compuesta — nunca `question_id` solo — para no mezclar
 * la respuesta/evaluación de dos preguntas distintas. El backend ya usa
 * `bank_id + question_id` como clave compuesta en todos los endpoints de
 * evaluación, así que esto no requiere ningún cambio de contrato/backend. */
export function examAnswerKey(bankId: string, questionId: string): string {
  return `${bankId}::${questionId}`;
}

function hasSessionStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
}

function activeKey(courseId: string): string {
  return `${ACTIVE_PREFIX}${courseId}`;
}

function examKey(courseId: string, practiceId: string): string {
  return `${EXAM_PREFIX}${courseId}:${practiceId}`;
}

function resultKey(courseId: string, practiceId: string): string {
  return `${RESULT_PREFIX}${courseId}:${practiceId}`;
}

function readActivePracticeId(courseId: string): string | null {
  try {
    return window.sessionStorage.getItem(activeKey(courseId));
  } catch {
    return null;
  }
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
    const practiceId = readActivePracticeId(courseId);
    if (!practiceId) return null;
    const raw = window.sessionStorage.getItem(examKey(courseId, practiceId));
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
    window.sessionStorage.setItem(
      examKey(session.courseId, session.practiceId),
      JSON.stringify(session)
    );
    // Marca este practice_id como el activo para el curso — así
    // loadExamSession(courseId) lo encuentra sin necesitar el practice_id
    // en la URL. Preparar una práctica NUEVA (prepare()) sobrescribe este
    // puntero de forma intencional: reemplaza la práctica anterior del
    // mismo curso, nunca mezcla datos de dos practice_id distintos.
    window.sessionStorage.setItem(activeKey(session.courseId), session.practiceId);
  } catch {
    // Cuota excedida u otro error: la restauración es una conveniencia,
    // nunca debe romper la práctica en curso.
  }
}

export function clearExamSession(courseId: string): void {
  if (!hasSessionStorage()) return;
  try {
    const practiceId = readActivePracticeId(courseId);
    if (practiceId) {
      window.sessionStorage.removeItem(examKey(courseId, practiceId));
    }
    window.sessionStorage.removeItem(activeKey(courseId));
  } catch {
    // ignorar
  }
}

export function loadCertificationResult(courseId: string): CertificationPracticeResult | null {
  if (!hasSessionStorage()) return null;
  try {
    const practiceId = readActivePracticeId(courseId);
    if (!practiceId) return null;
    const raw = window.sessionStorage.getItem(resultKey(courseId, practiceId));
    return raw ? (JSON.parse(raw) as CertificationPracticeResult) : null;
  } catch {
    return null;
  }
}

export function saveCertificationResult(
  courseId: string,
  practiceId: string,
  result: CertificationPracticeResult
): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(resultKey(courseId, practiceId), JSON.stringify(result));
  } catch {
    // ignorar
  }
}

export function clearCertificationResult(courseId: string): void {
  if (!hasSessionStorage()) return;
  try {
    const practiceId = readActivePracticeId(courseId);
    if (practiceId) {
      window.sessionStorage.removeItem(resultKey(courseId, practiceId));
    }
  } catch {
    // ignorar
  }
}
