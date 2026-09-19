import { useState } from "react";
import { api } from "../api/client";
import type {
  CertificationPracticeResult,
  CertificationPrepareRequest,
  QuestionEvaluation,
} from "../types/api";
import { describeCertificationError } from "./certificationErrors";
import {
  clearCertificationResult,
  clearExamSession,
  examAnswerKey,
  loadExamSession,
  saveCertificationResult,
  saveExamSession,
  type StoredExamSession,
} from "./certificationStorage";
import { buildAttemptSummary } from "../learning/certificationSummary";
import { recordCertificationAttempt } from "../learning/learningProgressStore";

// Nota de diseño: submitExam() NUNCA borra la sesión de examen (preguntas
// + selections) al terminar — la deja en sessionStorage junto con el
// resultado, porque ResultsPage la necesita para el modo repaso (sección
// 36: mostrar la pregunta y las opciones reales, no solo el veredicto).
// Recién `clearSession()` (botón "Nueva práctica") borra ambas cosas.

export interface UseCertificationExamResult {
  session: StoredExamSession | null;
  loading: boolean;
  error: { title: string; detail: string } | null;
  /** Llama a /prepare (única vez que se invoca al LLM en todo este flujo:
   * ensamblar el examen y evaluarlo son 100% determinísticos, sin LLM). */
  prepare: (request: CertificationPrepareRequest) => Promise<boolean>;
  selectAnswer: (bankId: string, questionId: string, optionIds: string[]) => void;
  goToIndex: (index: number) => void;
  /** Solo Practice: evalúa la pregunta actual y guarda el resultado (con
   * answer key) en la sesión — recién ACÁ es correcto tener
   * correct_option_ids en el estado del cliente. */
  evaluateCurrentQuestion: () => Promise<QuestionEvaluation | null>;
  /** Practice (al terminar) o Simulation (al entregar): evalúa TODAS las
   * respuestas juntas contra el backend (determinístico, sin LLM) y
   * limpia la sesión de examen en curso. */
  submitExam: () => Promise<CertificationPracticeResult | null>;
  clearSession: () => void;
}

export function useCertificationExam(courseId: string | undefined): UseCertificationExamResult {
  const [session, setSession] = useState<StoredExamSession | null>(() =>
    courseId ? loadExamSession(courseId) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  function persist(next: StoredExamSession) {
    setSession(next);
    saveExamSession(next);
  }

  async function prepare(request: CertificationPrepareRequest): Promise<boolean> {
    if (!courseId) return false;
    // v1.1.0 (UX de doble submit): guard explícito, no confiar solo en que
    // el botón que llama a prepare() esté disabled mientras loading=true.
    if (loading) return false;
    setLoading(true);
    setError(null);
    try {
      const response = await api.prepareCertification(courseId, request);
      if (response.actual_count === 0) {
        // Bug real encontrado en auditoría Fase 8 (sección 28): el
        // backend puede devolver actual_count=0 (el alcance elegido no
        // tenía material suficiente para generar ninguna pregunta) sin
        // que eso sea un error HTTP — antes de este fix, la sesión se
        // persistía igual y CertificationPracticePage/SimulationPage
        // rompían al acceder a session.questions[0] (undefined). Ahora
        // se trata como un resultado no utilizable: se muestra un error
        // claro y nunca se navega a la pantalla de práctica/simulacro.
        setError({
          title: "No se pudieron generar preguntas",
          detail:
            "El alcance elegido no tiene material suficiente para generar preguntas de práctica. Probá con otro módulo o tópico.",
        });
        return false;
      }
      const next: StoredExamSession = {
        practiceId: response.practice_id,
        courseId,
        mode: response.mode,
        requestedCount: response.requested_count,
        actualCount: response.actual_count,
        questions: response.questions,
        currentIndex: 0,
        selections: {},
        evaluations: {},
      };
      clearCertificationResult(courseId);
      persist(next);
      return true;
    } catch (err) {
      setError(describeCertificationError(err));
      return false;
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(bankId: string, questionId: string, optionIds: string[]) {
    if (!session) return;
    persist({
      ...session,
      selections: { ...session.selections, [examAnswerKey(bankId, questionId)]: optionIds },
    });
  }

  function goToIndex(index: number) {
    if (!session) return;
    if (index < 0 || index >= session.questions.length) return;
    persist({ ...session, currentIndex: index });
  }

  async function evaluateCurrentQuestion(): Promise<QuestionEvaluation | null> {
    if (!session || !courseId) return null;
    const question = session.questions[session.currentIndex];
    if (!question) return null;
    const key = examAnswerKey(question.bank_id, question.question_id);
    if (session.evaluations[key]) {
      // Ya evaluada: nunca se vuelve a llamar al backend para la misma
      // pregunta (evita doble envío / re-evaluación accidental).
      return session.evaluations[key];
    }
    // v1.1.0: guard contra doble click mientras la evaluación anterior
    // (de esta u otra pregunta) todavía está en curso.
    if (loading) return null;
    const selected = session.selections[key] ?? [];
    setLoading(true);
    setError(null);
    try {
      const result = await api.evaluateCertificationQuestion(courseId, {
        bank_id: question.bank_id,
        question_id: question.question_id,
        selected_option_ids: selected,
      });
      persist({
        ...session,
        evaluations: { ...session.evaluations, [key]: result },
      });
      return result;
    } catch (err) {
      setError(describeCertificationError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function submitExam(): Promise<CertificationPracticeResult | null> {
    if (!session || !courseId) return null;
    // v1.1.0: mismo guard que prepare() — nunca dos entregas concurrentes
    // de la misma práctica/simulacro (evitaría registrar el intento dos
    // veces en "Mi aprendizaje", ver recordCertificationAttempt() abajo).
    if (loading) return null;
    setLoading(true);
    setError(null);
    try {
      const answers = session.questions.map((q) => ({
        bank_id: q.bank_id,
        question_id: q.question_id,
        selected_option_ids: session.selections[examAnswerKey(q.bank_id, q.question_id)] ?? [],
      }));
      const result = await api.evaluateCertificationSimulation(courseId, { answers });
      saveCertificationResult(courseId, session.practiceId, result);
      // v1.1.0: registra un resumen SEGURO (nunca answer key) en el
      // historial local de "Mi aprendizaje" — ver
      // learning/certificationSummary.ts. Nunca debe poder romper la
      // entrega del examen: el resultado ya se devuelve igual si esto
      // fallara (recordCertificationAttempt nunca lanza).
      recordCertificationAttempt(courseId, buildAttemptSummary(session, result));
      return result;
    } catch (err) {
      setError(describeCertificationError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  function clearSession() {
    if (!courseId) return;
    clearExamSession(courseId);
    clearCertificationResult(courseId);
    setSession(null);
    setError(null);
  }

  return {
    session,
    loading,
    error,
    prepare,
    selectAnswer,
    goToIndex,
    evaluateCurrentQuestion,
    submitExam,
    clearSession,
  };
}
