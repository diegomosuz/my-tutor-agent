import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  buildCertificationOverview,
  getAreasToReinforce,
  type CertificationModeOverview,
} from "../learning/certificationSummary";
import { buildCourseLearningSummary, type CourseLearningSummary, type ModuleSummaryView } from "../learning/courseSummary";
import {
  certificationSetupRoute,
  findTopicTitle,
  getLearningRecommendations,
  type LearningRecommendation,
  type RecommendationType,
} from "../learning/learningRecommendationEngine";
import {
  deriveCourseLearningStates,
  getReviewCandidates,
  summarizeLearningStates,
  type LearningState,
  type LearningStateSummary,
} from "../learning/learningState";
import {
  describeLearningStateEvidence,
  LEARNING_STATE_REASON_COPY,
  LEARNING_STATE_STATUS_LABEL,
} from "../learning/learningStateCopy";
import { buildGuidedReviewPlan } from "../learning/guidedReviewPlan";
import { startGuidedReviewSession } from "../learning/guidedReviewSession";
import { getCourseLearningProgress } from "../learning/learningProgressStore";
import type { CertificationAttemptSummary } from "../learning/types";
import type { CourseDetail, CourseSummary } from "../types/api";

const DISCLAIMER =
  "Estos resultados reflejan únicamente las prácticas realizadas en esta aplicación.";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ModeOverviewCard({
  title,
  overview,
  emptyMessage,
}: {
  title: string;
  overview: CertificationModeOverview;
  emptyMessage: string;
}) {
  return (
    <div className="learning-cert-mode">
      <h4>{title}</h4>
      {overview.attemptCount === 0 ? (
        <p className="learning-empty-note">{emptyMessage}</p>
      ) : (
        <dl className="learning-cert-mode__stats">
          <div>
            <dt>Intentos</dt>
            <dd>{overview.attemptCount}</dd>
          </div>
          <div>
            <dt>Último resultado</dt>
            <dd>{overview.lastScore}%</dd>
          </div>
          <div>
            <dt>Mejor resultado</dt>
            <dd>{overview.bestScore}%</dd>
          </div>
          <div>
            <dt>Última fecha</dt>
            <dd>{overview.lastAttemptAt ? formatDate(overview.lastAttemptAt) : "—"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function ResultsEvolution({ attempts }: { attempts: CertificationAttemptSummary[] }) {
  if (attempts.length < 2) return null;
  const recent = attempts.slice(-10); // los últimos 10, más reciente al final
  return (
    <section className="learning-section">
      <h2>Evolución de resultados</h2>
      <ul className="learning-evolution">
        {recent.map((attempt, index) => (
          <li key={attempt.attemptId}>
            <span className="learning-evolution__label">Intento {index + 1}</span>
            <div className="learning-evolution__bar-track">
              <div
                className="learning-evolution__bar-fill"
                style={{ width: `${Math.max(attempt.scorePercentage, 2)}%` }}
              />
            </div>
            <span className="learning-evolution__value">{attempt.scorePercentage}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReinforceAreas({ attempts }: { attempts: CertificationAttemptSummary[] }) {
  const areas = useMemo(() => getAreasToReinforce(attempts), [attempts]);
  if (areas.length === 0) return null;
  return (
    <section className="learning-section">
      <h2>Áreas a reforzar</h2>
      <ol className="learning-reinforce-list">
        {areas.map((area) => (
          <li key={area.competency}>
            <span className="learning-reinforce-list__label">{area.competency}</span>
            <span className="learning-reinforce-list__score">
              {area.basedOnSingleAttempt ? "resultado observado" : "rendimiento reciente"}:{" "}
              {area.recentScorePercent}%
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// v1.1.0 (adaptación pedagógica): "Recomendado para vos". Cada tarjeta
// viene de learningRecommendationEngine.ts (100% determinístico, sin LLM,
// sin backend) — nunca inventa nada acá, solo renderiza lo que el motor ya
// calculó. Textos sobrios a propósito (PARTE 29): sin estrellas, niveles,
// streaks, puntos ni ranking — esto es formación profesional.
const RECOMMENDATION_TITLE: Record<RecommendationType, string> = {
  continue_topic: "Continuar",
  start_next_topic: "Continuar",
  review_topic: "Reforzar",
  practice_topics: "Practicar",
  retry_simulation: "Simulacro",
  course_completed: "Curso completado",
};

const RECOMMENDATION_BUTTON_LABEL: Record<RecommendationType, string> = {
  continue_topic: "Continuar",
  start_next_topic: "Continuar",
  review_topic: "Revisar tema",
  practice_topics: "Iniciar práctica",
  retry_simulation: "Preparar simulacro",
  course_completed: "",
};

function RecommendationCard({
  recommendation,
  featured,
}: {
  recommendation: LearningRecommendation;
  featured: boolean;
}) {
  const navigate = useNavigate();
  const [showWhy, setShowWhy] = useState(false);
  const buttonLabel = RECOMMENDATION_BUTTON_LABEL[recommendation.type];
  const data = recommendation.observedData;

  return (
    <div className={featured ? "learning-recommendation learning-recommendation--featured" : "learning-recommendation"}>
      <h3>{RECOMMENDATION_TITLE[recommendation.type]}</h3>
      <p className="learning-recommendation__reason">{recommendation.reasonText}</p>

      {data && (
        <>
          <button
            type="button"
            className="learning-recommendation__why-toggle"
            onClick={() => setShowWhy((v) => !v)}
            aria-expanded={showWhy}
          >
            {showWhy ? "Ocultar datos" : "¿Por qué?"}
          </button>
          {showWhy && (
            <dl className="learning-recommendation__why-data">
              {data.score !== undefined && (
                <div>
                  <dt>Último resultado</dt>
                  <dd>{data.score}%</dd>
                </div>
              )}
              {data.recentAverage !== undefined && (
                <div>
                  <dt>Promedio reciente</dt>
                  <dd>{data.recentAverage}%</dd>
                </div>
              )}
              {data.observations !== undefined && (
                <div>
                  <dt>Observaciones consideradas</dt>
                  <dd>{data.observations}</dd>
                </div>
              )}
              {data.lastAccessedAt && (
                <div>
                  <dt>Última actividad</dt>
                  <dd>{formatDate(data.lastAccessedAt)}</dd>
                </div>
              )}
            </dl>
          )}
        </>
      )}

      {buttonLabel && (
        <button
          type="button"
          className="course-card__cta"
          onClick={() => navigate(recommendation.action.to)}
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

function RecommendedForYou({ recommendations }: { recommendations: LearningRecommendation[] }) {
  // "course_completed" nunca se muestra como card propia acá: ya lo dice
  // CourseProgressSection ("Curso completado") — mostrarlo de nuevo acá
  // sería redundante. Esta sección solo muestra recomendaciones
  // ACCIONABLES (con un botón real).
  const actionable = recommendations.filter((r) => r.type !== "course_completed");
  if (actionable.length === 0) return null;
  const [primary, ...rest] = actionable;
  // Máximo 2 tarjetas secundarias de tipos distintos al primario, para no
  // saturar la sección (PARTE 8 muestra como mucho 2-3 tarjetas juntas).
  const secondary = rest.filter((r) => r.type !== primary.type).slice(0, 2);

  return (
    <section className="learning-section learning-recommendations">
      <h2>Recomendado para vos</h2>
      <div className="learning-recommendations__grid">
        <RecommendationCard recommendation={primary} featured />
        {secondary.map((rec) => (
          <RecommendationCard key={`${rec.type}-${rec.topicId ?? rec.topicIds?.join(",") ?? ""}`} recommendation={rec} featured={false} />
        ))}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// v1.6.0 (Bloque 2, "Learning Insights UI"): hace visible y accionable
// LearningState[] (Bloque 1) sin duplicar ninguna regla de clasificación
// -- la UI solo renderiza lo que `deriveCourseLearningStates`/
// `summarizeLearningStates`/`getReviewCandidates` ya calcularon. Ver
// docs/LEARNING_INTELLIGENCE_V1_6.md sección "Learning Insights UI".
// -------------------------------------------------------------------

const MAX_FEATURED_REVIEW_CANDIDATES = 5;

function LearningInsightsSummary({ summary }: { summary: LearningStateSummary }) {
  return (
    <section className="learning-section">
      <h2>Estado de aprendizaje</h2>
      <div className="learning-insights-summary">
        <div className="learning-insights-summary__item learning-insights-summary__item--mastered">
          <span className="learning-insights-summary__count">{summary.mastered}</span>
          <span className="learning-insights-summary__label">Dominados</span>
        </div>
        <div className="learning-insights-summary__item learning-insights-summary__item--needs_review">
          <span className="learning-insights-summary__count">{summary.needsReview}</span>
          <span className="learning-insights-summary__label">Necesitan repaso</span>
        </div>
        <div className="learning-insights-summary__item learning-insights-summary__item--progressing">
          <span className="learning-insights-summary__count">{summary.progressing}</span>
          <span className="learning-insights-summary__label">En progreso</span>
        </div>
        <div className="learning-insights-summary__item learning-insights-summary__item--not_started">
          <span className="learning-insights-summary__count">{summary.notStarted}</span>
          <span className="learning-insights-summary__label">No iniciados</span>
        </div>
      </div>
    </section>
  );
}

/** Tarjeta reutilizada para `needs_review` y `progressing` -- nunca
 * `mastered` (ese caso usa `MasteredSection`, una lista compacta, PARTE
 * 18) ni `not_started` (nunca se muestra como card, PARTE 19: ya está
 * representado en el resumen y en "Progreso por módulo"). El texto de
 * motivo y la evidencia vienen SIEMPRE de `learningStateCopy.ts` -- este
 * componente nunca decide/calcula nada pedagógico. */
function LearningStateCard({
  state,
  title,
  courseId,
  review,
  ctaLabel,
}: {
  state: LearningState;
  title: string;
  courseId: string;
  review: boolean;
  ctaLabel: string;
}) {
  const navigate = useNavigate();
  const evidenceText = describeLearningStateEvidence(state);
  const to = `/aula/${courseId}/${state.moduleId}/${state.topicId}${review ? "?review=true" : ""}`;

  return (
    <div className={`learning-state-card learning-state-card--${state.status}`}>
      <span className="learning-state-card__badge">{LEARNING_STATE_STATUS_LABEL[state.status]}</span>
      <h3>{title}</h3>
      <p className="learning-state-card__reason">{LEARNING_STATE_REASON_COPY[state.reasonCode]}</p>
      {evidenceText && <p className="learning-state-card__evidence">{evidenceText}</p>}
      <button type="button" className="course-card__cta" onClick={() => navigate(to)}>
        {ctaLabel}
      </button>
    </div>
  );
}

/** "Continuar tema" para uno empezado y no completado; "Ver tema" para
 * uno ya completado/con evidencia parcial (PARTE 21: la semántica real de
 * cada reason code decide, nunca un texto genérico único). Nunca el
 * mismo texto EXACTO que el botón "Continuar" de "Recomendado para vos"
 * (`RECOMMENDATION_BUTTON_LABEL`, más arriba): son dos acciones
 * distintas que pueden coexistir en pantalla para el mismo tópico, con
 * label ambiguo rompería accesibilidad de teclado/lector de pantalla
 * (PARTE 40). */
function progressingCtaLabel(state: LearningState): string {
  return state.reasonCode === "STARTED_NOT_COMPLETED" ? "Continuar tema" : "Ver tema";
}

function ReviewPrioritySection({
  needsReview,
  hasAnyActivity,
  onStartReview,
  modules,
  courseId,
}: {
  needsReview: LearningState[];
  hasAnyActivity: boolean;
  onStartReview: () => void;
  modules: ModuleSummaryView[];
  courseId: string;
}) {
  const featured = needsReview.slice(0, MAX_FEATURED_REVIEW_CANDIDATES);
  const remaining = needsReview.length - featured.length;

  return (
    <section className="learning-section">
      <div className="learning-insights__section-header">
        <h2>Prioridad de repaso</h2>
        {/* v1.6.0 Bloque 3: crea una GuidedReviewSession real (ver
            handleStartReview en LearningProgressPage) y navega al primer
            tópico del plan -- antes solo navegaba, sin sesión. */}
        {needsReview.length > 0 && (
          <button type="button" className="course-card__cta" onClick={onStartReview}>
            Comenzar repaso
          </button>
        )}
      </div>

      {needsReview.length === 0 && hasAnyActivity && (
        <p className="learning-empty-note">No hay temas que requieran repaso prioritario.</p>
      )}
      {needsReview.length === 0 && !hasAnyActivity && (
        <p className="learning-empty-note">
          Todavía no hay suficiente actividad para generar recomendaciones de repaso.
        </p>
      )}

      {featured.length > 0 && (
        <>
          <div className="learning-recommendations__grid">
            {featured.map((state) => (
              <LearningStateCard
                key={`${state.moduleId}:${state.topicId}`}
                state={state}
                title={findTopicTitle(modules, state.moduleId, state.topicId)}
                courseId={courseId}
                review
                ctaLabel="Repasar tema"
              />
            ))}
          </div>
          {remaining > 0 && (
            <p className="learning-empty-note">
              +{remaining} {remaining === 1 ? "tema más necesita" : "temas más necesitan"} repaso.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ProgressingSection({
  courseId,
  modules,
  progressing,
}: {
  courseId: string;
  modules: ModuleSummaryView[];
  progressing: LearningState[];
}) {
  if (progressing.length === 0) return null;
  return (
    <section className="learning-section">
      <h2>En progreso</h2>
      <div className="learning-recommendations__grid">
        {progressing.map((state) => (
          <LearningStateCard
            key={`${state.moduleId}:${state.topicId}`}
            state={state}
            title={findTopicTitle(modules, state.moduleId, state.topicId)}
            courseId={courseId}
            review={false}
            ctaLabel={progressingCtaLabel(state)}
          />
        ))}
      </div>
    </section>
  );
}

/** Compacta a propósito (PARTE 18): lista simple con checkmark, reutiliza
 * exactamente el mismo componente visual `.learning-topic` que ya usa
 * "Progreso por módulo" -- nunca una card grande por tema dominado. */
/** v1.6.0 Bloque 3: confirmación compacta al volver de un Guided Review
 * ya terminado (PARTE 32/33/34). Texto preciso a propósito (PARTE 33):
 * "recorriste una ruta", NUNCA "dominás esto"/"mejoraste tu nivel" --
 * review != mastery, la evidencia de dominio sigue viniendo
 * exclusivamente de Certification. "Evaluar progreso" reutiliza el
 * flujo EXISTENTE de Certification (PARTE 38, nunca una evaluación
 * nueva), acotado a los tópicos recién repasados. */
function ReviewCompletionCard({
  courseId,
  topicCount,
  topicIds,
  onDismiss,
}: {
  courseId: string;
  topicCount: number;
  topicIds: string[];
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  return (
    <section className="learning-section learning-review-completion" role="status">
      <h2>Repaso completado</h2>
      <p>
        Completaste esta ruta de repaso ({topicCount} {topicCount === 1 ? "tema" : "temas"}). Tu
        estado de aprendizaje se actualizará cuando haya nueva evidencia evaluativa.
      </p>
      <div className="learning-review-completion__actions">
        <button
          type="button"
          className="course-card__cta"
          onClick={() => navigate(certificationSetupRoute(courseId, "practice", topicIds))}
        >
          Evaluar progreso
        </button>
        <button type="button" className="learning-review-completion__dismiss" onClick={onDismiss}>
          Entendido
        </button>
      </div>
    </section>
  );
}

function MasteredSection({
  courseId,
  modules,
  mastered,
}: {
  courseId: string;
  modules: ModuleSummaryView[];
  mastered: LearningState[];
}) {
  if (mastered.length === 0) return null;
  return (
    <section className="learning-section">
      <h2>Dominados</h2>
      <ul className="learning-module__topics">
        {mastered.map((state) => (
          <li key={`${state.moduleId}:${state.topicId}`}>
            <Link
              to={`/aula/${courseId}/${state.moduleId}/${state.topicId}`}
              className="learning-topic learning-topic--mastered"
            >
              <span className="learning-topic__icon" aria-hidden="true">
                ✓
              </span>
              {findTopicTitle(modules, state.moduleId, state.topicId)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function statusIcon(status: "not_started" | "in_progress" | "completed"): string {
  if (status === "completed") return "✓";
  if (status === "in_progress") return "▶";
  return "○";
}

function CourseProgressSection({
  summary,
  courseId,
}: {
  summary: CourseLearningSummary;
  courseId: string;
}) {
  const neverStarted = summary.lastActivity === null;

  return (
    <>
      <section className="learning-section learning-hero">
        {neverStarted ? (
          <p className="learning-empty-note">
            Tu progreso aparecerá acá cuando empieces a estudiar.
          </p>
        ) : (
          <>
            <h2>Progreso general</h2>
            <div className="learning-progress-bar">
              <div
                className="learning-progress-bar__fill"
                style={{ width: `${summary.progressPercentage}%` }}
              />
            </div>
            <p className="learning-progress-caption">
              {summary.progressPercentage}% — {summary.completedTopics} de {summary.totalTopics}{" "}
              tópicos completados
            </p>
          </>
        )}

        {summary.isCompleted && (
          <div className="learning-continue">
            <p className="learning-continue__done">Curso completado</p>
          </div>
        )}
      </section>

      <section className="learning-section">
        <h2>Progreso por módulo</h2>
        <div className="learning-modules">
          {summary.modules.map((module) => (
            <details key={module.moduleId} className="learning-module" open>
              <summary>
                <span>{module.title}</span>
                <span className="learning-module__meta">
                  {module.completedTopics} / {module.totalTopics} · {module.progressPercentage}%
                </span>
              </summary>
              <ul className="learning-module__topics">
                {module.topics.map((topic, index) => (
                  // topicId no es necesariamente único dentro de un módulo
                  // (ver "duplicate_slug" en course_diagnostics.py); se
                  // agrega el índice como desempate para la key de React.
                  <li key={`${topic.topicId}-${index}`}>
                    <Link
                      to={`/aula/${courseId}/${topic.moduleId}/${topic.topicId}`}
                      className={`learning-topic learning-topic--${topic.status}`}
                    >
                      <span className="learning-topic__icon" aria-hidden="true">
                        {statusIcon(topic.status)}
                      </span>
                      {topic.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

interface ReviewCompletionState {
  courseId: string;
  topicCount: number;
  topicIds: string[];
}

function isReviewCompletionState(value: unknown): value is ReviewCompletionState & { reviewCompleted: true } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.reviewCompleted === true &&
    typeof v.courseId === "string" &&
    typeof v.topicCount === "number" &&
    Array.isArray(v.topicIds)
  );
}

export function LearningProgressPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseDetail, setCourseDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // v1.6.0 (Bloque 3): confirmación de "Repaso completado" -- viaja como
  // `navigate(..., { state })` desde ClassroomPage (PARTE 34, la opción
  // más simple: ni sessionStorage ni una página nueva). Capturado UNA
  // sola vez con un ref (nunca `location.state` directo en el render, que
  // sobreviviría un refresh y volvería a mostrar la card).
  const reviewCompletionRef = useRef<ReviewCompletionState | null>(
    isReviewCompletionState(location.state) ? location.state : null
  );
  const [reviewCompletion, setReviewCompletion] = useState<ReviewCompletionState | null>(
    reviewCompletionRef.current
  );

  useEffect(() => {
    if (!reviewCompletionRef.current) return;
    // Limpia el state del router: un refresh posterior nunca vuelve a
    // mostrar la confirmación (PARTE 34: "de una sola vez").
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getCourses()
      .then((data) => {
        if (cancelled) return;
        setCourses(data);
        // Si venimos de un Guided Review recién completado, priorizar ESE
        // curso (nunca el default `data[0]`, que podría ser otro) -- solo
        // si sigue siendo un curso real y publicado.
        const preferredCourseId = reviewCompletionRef.current?.courseId;
        if (preferredCourseId && data.some((c) => c.id === preferredCourseId)) {
          setSelectedCourseId(preferredCourseId);
        } else if (data.length > 0) {
          setSelectedCourseId(data[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCourseId) return;
    let cancelled = false;
    setCourseDetail(null);
    api
      .getCourse(selectedCourseId)
      .then((data) => {
        if (!cancelled) setCourseDetail(data);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar la información del curso.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCourseId]);

  const progress = selectedCourseId ? getCourseLearningProgress(selectedCourseId) : null;
  const summary = useMemo(
    () => (courseDetail ? buildCourseLearningSummary(courseDetail, progress) : null),
    [courseDetail, progress]
  );
  const certificationOverview = useMemo(
    () => buildCertificationOverview(progress?.certificationAttempts ?? []),
    [progress]
  );
  // v1.1.0: recalculada SIEMPRE a partir del estado actual (nunca se
  // persiste una recomendación) — ver docs/ADAPTIVE_LEARNING.md.
  const recommendations = useMemo(
    () => (courseDetail && summary ? getLearningRecommendations(courseDetail, summary, progress) : []),
    [courseDetail, summary, progress]
  );

  // v1.6.0 (Bloque 2): LearningState[] SIEMPRE derivado on-demand (nunca
  // persistido, PARTE 5) a partir de la misma `progress`/`summary.modules`
  // ya cargados arriba — cualquier nueva certificación/reset se refleja
  // apenas cambia `progress` (PARTE 31, sin lifecycle especial).
  const learningStates = useMemo(
    () => (summary && selectedCourseId ? deriveCourseLearningStates(selectedCourseId, summary.modules, progress) : []),
    [summary, progress, selectedCourseId]
  );
  const learningSummary = useMemo(
    () => (selectedCourseId ? summarizeLearningStates(selectedCourseId, learningStates) : null),
    [selectedCourseId, learningStates]
  );
  const reviewCandidates = useMemo(() => getReviewCandidates(learningStates), [learningStates]);
  const needsReviewCandidates = useMemo(
    () => reviewCandidates.filter((s) => s.status === "needs_review"),
    [reviewCandidates]
  );
  const progressingCandidates = useMemo(
    () => reviewCandidates.filter((s) => s.status === "progressing"),
    [reviewCandidates]
  );
  const masteredStates = useMemo(() => learningStates.filter((s) => s.status === "mastered"), [learningStates]);
  // PARTE 25: "curso sin actividad" (0 tópicos tocados) es un empty state
  // distinto de "hay actividad pero ninguna necesita repaso" (PARTE 24).
  const hasAnyActivity = learningSummary ? learningSummary.totalTopics - learningSummary.notStarted > 0 : false;

  // v1.6.0 Bloque 3: construye el plan EXCLUSIVAMENTE desde
  // `learningStates` reales de este curso (PARTE 5 -- nunca recalcula
  // score, nunca usa `learningRecommendationEngine.ts` para decidir esta
  // ruta), crea la sesión, y navega al primer tópico ya como sesión
  // activa (antes solo navegaba, sin sesión real).
  function handleStartReview() {
    if (!selectedCourseId) return;
    const plan = buildGuidedReviewPlan(selectedCourseId, learningStates);
    if (!plan) return; // sin needs_review: el botón ni debería estar visible.
    startGuidedReviewSession(plan);
    const first = plan.topics[0];
    navigate(`/aula/${selectedCourseId}/${first.moduleId}/${first.topicId}?review=true`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__eyebrow">Mi aprendizaje</div>
        <h1>Mi aprendizaje</h1>
        <p>Progreso consolidado de tus cursos, guardado localmente en este navegador.</p>
      </div>

      {reviewCompletion && (
        <ReviewCompletionCard
          courseId={reviewCompletion.courseId}
          topicCount={reviewCompletion.topicCount}
          topicIds={reviewCompletion.topicIds}
          onDismiss={() => setReviewCompletion(null)}
        />
      )}

      {error && (
        <div className="state-box state-box--error">
          <h3>No pudimos cargar tu progreso</h3>
          <p>{error}</p>
        </div>
      )}

      {!error && courses === null && (
        <div className="state-box">
          <h3>Cargando…</h3>
        </div>
      )}

      {!error && courses !== null && courses.length === 0 && (
        <div className="state-box">
          <h3>Todavía no hay cursos publicados</h3>
        </div>
      )}

      {!error && courses !== null && courses.length > 1 && (
        <div className="learning-course-selector">
          <label htmlFor="learning-course-select">Curso</label>
          <select
            id="learning-course-select"
            value={selectedCourseId ?? ""}
            onChange={(e) => setSelectedCourseId(e.target.value)}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {!error && courses !== null && courses.length > 0 && summary && selectedCourseId && (
        <>
          <CourseProgressSection summary={summary} courseId={selectedCourseId} />

          {learningSummary && (
            <>
              <LearningInsightsSummary summary={learningSummary} />
              <ReviewPrioritySection
                courseId={selectedCourseId}
                modules={summary.modules}
                needsReview={needsReviewCandidates}
                hasAnyActivity={hasAnyActivity}
                onStartReview={handleStartReview}
              />
              <ProgressingSection courseId={selectedCourseId} modules={summary.modules} progressing={progressingCandidates} />
              <MasteredSection courseId={selectedCourseId} modules={summary.modules} mastered={masteredStates} />
            </>
          )}

          <RecommendedForYou recommendations={recommendations} />

          <section className="learning-section">
            <h2>Preparación de certificación</h2>
            <p className="learning-disclaimer">{DISCLAIMER}</p>
            <div className="learning-cert-modes">
              <ModeOverviewCard
                title="Prácticas guiadas"
                overview={certificationOverview.practice}
                emptyMessage="Aún no realizaste prácticas."
              />
              <ModeOverviewCard
                title="Simulacros"
                overview={certificationOverview.simulation}
                emptyMessage="Aún no realizaste simulacros."
              />
            </div>
          </section>

          <ResultsEvolution attempts={certificationOverview.recentAttempts} />
          <ReinforceAreas attempts={progress?.certificationAttempts ?? []} />
        </>
      )}
    </div>
  );
}
