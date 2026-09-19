// Extracción SEGURA de un resumen de intento de certificación a partir de
// la sesión + resultado ya evaluado (PARTE 3), y agregaciones puras y
// determinísticas sobre el historial guardado (PARTE 8-10). Sin LLM, sin
// random.
import type { CertificationPracticeResult, CompetencyBreakdown } from "../types/api";
import type { StoredExamSession } from "../certification/certificationStorage";
import type { CertificationAttemptSummary } from "./types";

/** Construye el resumen seguro a partir de una sesión + resultado ya
 * evaluado. Deliberadamente NO recibe ni copia `question_results` (el
 * único campo de `CertificationPracticeResult` que trae answer key /
 * explicaciones por pregunta) — solo agregados ya públicos post-examen. */
export function buildAttemptSummary(
  session: StoredExamSession,
  result: CertificationPracticeResult
): CertificationAttemptSummary {
  const moduleIds = Array.from(new Set(session.questions.map((q) => q.module_id))).sort();
  const topicIds = Array.from(new Set(session.questions.map((q) => q.topic_id))).sort();

  return {
    attemptId: session.practiceId,
    courseId: session.courseId,
    mode: session.mode,
    moduleIds,
    topicIds,
    questionCount: result.total_questions,
    answeredCount: result.total_questions - result.unanswered,
    correctCount: result.correct,
    partialCount: result.partially_correct,
    incorrectCount: result.incorrect,
    unansweredCount: result.unanswered,
    scorePercentage: result.practice_score_percent,
    completedAt: new Date().toISOString(),
    performanceByTopic: result.by_topic,
    competenciesToReinforce: result.by_competency,
  };
}

export interface CertificationModeOverview {
  attemptCount: number;
  lastScore: number | null;
  lastAttemptAt: string | null;
  bestScore: number | null;
}

const EMPTY_MODE_OVERVIEW: CertificationModeOverview = {
  attemptCount: 0,
  lastScore: null,
  lastAttemptAt: null,
  bestScore: null,
};

function overviewFor(attempts: CertificationAttemptSummary[]): CertificationModeOverview {
  if (attempts.length === 0) return EMPTY_MODE_OVERVIEW;
  // Los intentos ya vienen ordenados más-reciente-primero desde el store
  // (recordCertificationAttempt los ordena por completedAt al guardar).
  const sorted = [...attempts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const best = attempts.reduce((max, a) => Math.max(max, a.scorePercentage), 0);
  return {
    attemptCount: attempts.length,
    lastScore: sorted[0].scorePercentage,
    lastAttemptAt: sorted[0].completedAt,
    bestScore: best,
  };
}

export interface CertificationOverview {
  practice: CertificationModeOverview;
  simulation: CertificationModeOverview;
  /** Últimos intentos (cualquier modo), más reciente primero — para la
   * evolución de resultados (PARTE 9). */
  recentAttempts: CertificationAttemptSummary[];
}

export function buildCertificationOverview(
  attempts: CertificationAttemptSummary[]
): CertificationOverview {
  const practice = attempts.filter((a) => a.mode === "practice");
  const simulation = attempts.filter((a) => a.mode === "simulation");
  const recentAttempts = [...attempts].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
  );
  return {
    practice: overviewFor(practice),
    simulation: overviewFor(simulation),
    recentAttempts,
  };
}

export interface ReinforceArea {
  competency: string;
  recentScorePercent: number;
  /** true si solo un intento aportó datos para esta competencia — la UI
   * debe mostrarlo como "resultado observado", nunca como tendencia
   * (PARTE 10). */
  basedOnSingleAttempt: boolean;
}

/** Agregación determinística de competencias a reforzar: para cada
 * competencia mencionada en el historial, toma el desempeño del intento
 * MÁS RECIENTE que la incluyó (nunca un promedio que podría ocultar una
 * mejora/empeoramiento reciente), y ordena de peor a mejor desempeño —
 * nunca inventa una competencia que no haya sido producida por una
 * práctica real. */
export function getAreasToReinforce(
  attempts: CertificationAttemptSummary[],
  limit = 5
): ReinforceArea[] {
  const byCompetency = new Map<string, { breakdown: CompetencyBreakdown; completedAt: string; count: number }>();

  const sortedOldestFirst = [...attempts].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
  );

  for (const attempt of sortedOldestFirst) {
    for (const competency of attempt.competenciesToReinforce) {
      if (competency.attempted <= 0) continue;
      const existing = byCompetency.get(competency.competency);
      byCompetency.set(competency.competency, {
        breakdown: competency,
        completedAt: attempt.completedAt,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return Array.from(byCompetency.values())
    .map(({ breakdown, count }) => ({
      competency: breakdown.competency,
      recentScorePercent: breakdown.practice_score_percent,
      basedOnSingleAttempt: count <= 1,
    }))
    .sort((a, b) => a.recentScorePercent - b.recentScorePercent)
    .slice(0, limit);
}
