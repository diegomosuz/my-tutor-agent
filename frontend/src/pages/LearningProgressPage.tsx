import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  buildCertificationOverview,
  getAreasToReinforce,
  type CertificationModeOverview,
} from "../learning/certificationSummary";
import { buildCourseLearningSummary, type CourseLearningSummary } from "../learning/courseSummary";
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
  const navigate = useNavigate();
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

        <div className="learning-continue">
          {summary.isCompleted ? (
            <p className="learning-continue__done">Curso completado</p>
          ) : summary.continueTarget ? (
            <>
              <h3>Continuar aprendiendo</h3>
              <p>{summary.continueTarget.title}</p>
              <button
                type="button"
                className="course-card__cta"
                onClick={() =>
                  navigate(
                    `/aula/${courseId}/${summary.continueTarget!.moduleId}/${summary.continueTarget!.topicId}`
                  )
                }
              >
                Continuar
              </button>
            </>
          ) : null}
        </div>
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

export function LearningProgressPage() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseDetail, setCourseDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getCourses()
      .then((data) => {
        if (cancelled) return;
        setCourses(data);
        if (data.length > 0) setSelectedCourseId(data[0].id);
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

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__eyebrow">Mi aprendizaje</div>
        <h1>Mi aprendizaje</h1>
        <p>Progreso consolidado de tus cursos, guardado localmente en este navegador.</p>
      </div>

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
