// Hook de lectura de historial de Certification server-side (v1.7.0,
// Bloque 3). Ver docs/SERVER_SIDE_PROFILE_V1_7.md seccion "Bloque 3".
//
// Mismas reglas de diseno que useServerTopicProgress.ts (Bloque 2):
// - `attempts === null` SIEMPRE significa "todavia cargando" (nunca "sin
//   intentos").
// - Un error de red nunca sobrescribe el historial ya mostrado con un
//   estado vacio.
// - El import legacy -> servidor corre UNA sola vez por curso por
//   navegador (marcador cliente SEPARADO del de topic progress, ver
//   learningProgressStore.ts).
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import {
  getLegacyCertificationAttemptsSnapshot,
  hasImportedCertificationHistory,
  markCertificationHistoryImported,
} from "./learningProgressStore";
import type { CertificationAttemptSummary } from "./types";
import type { CertificationAttemptEntry, CertificationHistoryResponse } from "../types/api";

export interface ServerCertificationHistoryState {
  /** null mientras carga; una vez cargado, la lista (posiblemente vacia)
   * de intentos, mas-reciente-primero (igual orden que ya devolvia
   * `recordCertificationAttempt`/`buildCertificationOverview`). */
  attempts: CertificationAttemptSummary[] | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

export function toAttemptSummary(entry: CertificationAttemptEntry): CertificationAttemptSummary {
  return {
    attemptId: entry.attempt_id,
    courseId: entry.course_id,
    mode: entry.mode,
    moduleIds: entry.module_ids,
    topicIds: entry.topic_ids,
    questionCount: entry.question_count,
    answeredCount: entry.answered_count,
    correctCount: entry.correct_count,
    partialCount: entry.partial_count,
    incorrectCount: entry.incorrect_count,
    unansweredCount: entry.unanswered_count,
    scorePercentage: entry.score_percentage,
    completedAt: entry.completed_at,
    performanceByTopic: entry.performance_by_topic,
    competenciesToReinforce: entry.competencies_to_reinforce,
  };
}

/** Filtro defensivo ANTES de enviar el snapshot legacy al backend: el
 * backend valida el batch completo de forma atomica (Pydantic), asi que
 * UNA entrada legacy corrupta (score fuera de rango, agregados
 * inconsistentes -- posible en un documento viejo nunca antes validado
 * contra este contrato) podria rechazar el import COMPLETO. Se descarta
 * en el cliente cualquier entrada que no vaya a pasar la misma validacion
 * que ya aplica `LegacyCertificationAttemptEntry` en el backend, en vez de
 * arriesgar perder intentos legítimos junto con el corrupto. */
function isSaneForImport(attempt: CertificationAttemptSummary): boolean {
  if (!Number.isFinite(attempt.scorePercentage) || attempt.scorePercentage < 0 || attempt.scorePercentage > 100) {
    return false;
  }
  if (attempt.answeredCount > attempt.questionCount) return false;
  if (attempt.correctCount + attempt.partialCount + attempt.incorrectCount > attempt.answeredCount) return false;
  if (attempt.unansweredCount !== attempt.questionCount - attempt.answeredCount) return false;
  return true;
}

function toLegacyEntry(attempt: CertificationAttemptSummary) {
  return {
    practice_id: attempt.attemptId,
    mode: attempt.mode,
    question_count: attempt.questionCount,
    answered_count: attempt.answeredCount,
    correct_count: attempt.correctCount,
    partial_count: attempt.partialCount,
    incorrect_count: attempt.incorrectCount,
    unanswered_count: attempt.unansweredCount,
    score_percentage: attempt.scorePercentage,
    completed_at: attempt.completedAt,
    performance_by_topic: attempt.performanceByTopic,
    competencies_to_reinforce: attempt.competenciesToReinforce,
  };
}

function toDomainList(response: CertificationHistoryResponse): CertificationAttemptSummary[] {
  return response.attempts.map(toAttemptSummary);
}

/** Get-or-import: misma lógica que usa el hook, extraída para que
 * cualquier llamador puntual (ej.
 * `LearningProgressPage.tsx::handleStartVerification`, que resuelve
 * historial de un curso que puede no ser `selectedCourseId` y por lo
 * tanto nunca pasó por el hook) también dispare el bootstrap legacy --
 * bug real encontrado en QA (mismo bug que `fetchCourseTopicProgress`,
 * ver useServerTopicProgress.ts): sin esto, `latestAttemptIdAtStart` podía
 * quedar `null` aunque existiera un intento legacy real, si el hook de
 * "Mi aprendizaje" nunca había cargado ESE courseId todavía. Idempotente
 * por el mismo marcador cliente que ya usa el hook. */
export async function fetchCourseCertificationHistory(
  courseId: string,
  signal?: AbortSignal
): Promise<CertificationAttemptSummary[]> {
  let response = await api.getCertificationHistory(courseId, signal);

  if (!hasImportedCertificationHistory(courseId)) {
    const legacy = getLegacyCertificationAttemptsSnapshot(courseId).filter(isSaneForImport);
    if (legacy.length > 0) {
      response = await api.importLegacyCertificationHistory(
        courseId,
        { attempts: legacy.map(toLegacyEntry) },
        signal
      );
    }
    markCertificationHistoryImported(courseId);
  }

  return toDomainList(response);
}

export function useServerCertificationHistory(courseId: string | null): ServerCertificationHistoryState {
  const [attempts, setAttempts] = useState<CertificationAttemptSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!courseId) {
      setAttempts(null);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    async function load(id: string) {
      try {
        const list = await fetchCourseCertificationHistory(id, controller.signal);
        if (!cancelled) {
          setAttempts(list);
          setLoading(false);
        }
      } catch {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      }
    }

    void load(courseId);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [courseId, reloadToken]);

  return { attempts, loading, error, refetch };
}
