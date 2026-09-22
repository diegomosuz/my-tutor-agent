import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useCertificationExam } from "../certification/useCertificationExam";
import { examAnswerKey, loadCertificationResult } from "../certification/certificationStorage";
import { buildCourseLearningSummary } from "../learning/courseSummary";
import { findTopicTitle } from "../learning/learningRecommendationEngine";
import { deriveCourseLearningStates } from "../learning/learningState";
import {
  describeLearningStateEvidence,
  LEARNING_STATE_REASON_COPY,
  LEARNING_STATE_STATUS_LABEL,
} from "../learning/learningStateCopy";
import {
  clearGuidedReviewVerificationContext,
  deriveVerificationResults,
  hasNewVerificationAttempt,
  loadGuidedReviewVerificationContext,
  type VerificationTopicResult,
} from "../learning/guidedReviewVerification";
import { getCourseLearningProgress } from "../learning/learningProgressStore";
import type { CertificationPracticeResult, CourseDetail, ExamQuestionView } from "../types/api";

const VERDICT_LABELS: Record<string, string> = {
  correct: "Correcta",
  partially_correct: "Parcialmente correcta",
  incorrect: "Incorrecta",
};

/** Panel "Estado después de la verificación" (v1.6.0 Bloque 4, PARTE
 * 18-22): SOLO aparece cuando esta Certification fue iniciada como
 * verificación posterior a un Guided Review Y ya existe un intento nuevo
 * REAL persistido (`hasNewVerificationAttempt`, identidad de intento —
 * nunca un timer). Reutiliza `deriveCourseLearningStates` (Bloque 1, sin
 * cambios) y `learningStateCopy.ts` (Bloque 2, sin segundo mapping) — el
 * estado mostrado acá es EXACTAMENTE el mismo que mostrará "Mi
 * aprendizaje" para estos tópicos (PARTE 30, invariante de consistencia).
 * Nunca afirma causalidad ("el repaso hizo que..."): describe evidencia
 * posterior, no un efecto del repaso (PARTE 22). */
function VerificationResultPanel({
  results,
  modules,
  onReturnToLearningProgress,
}: {
  results: VerificationTopicResult[];
  modules: ReturnType<typeof buildCourseLearningSummary>["modules"];
  onReturnToLearningProgress: () => void;
}) {
  if (results.length === 0) return null;
  return (
    <section className="cert-results-section cert-verification-panel" aria-labelledby="verification-heading">
      <h3 id="verification-heading">Estado después de la verificación</h3>
      <p>
        Con la nueva evidencia de esta certificación, este es el estado actual de los temas
        repasados.
      </p>
      <ul className="cert-verification-list">
        {results.map(({ moduleId, topicId, current, before }) => (
          <li key={`${moduleId}:${topicId}`} className="cert-verification-item">
            <span className="cert-verification-item__title">{findTopicTitle(modules, moduleId, topicId)}</span>
            {before && before.status !== current.status && (
              <span className="cert-verification-item__before">
                Antes: {LEARNING_STATE_STATUS_LABEL[before.status]}
              </span>
            )}
            <span className={`cert-verification-item__status cert-verification-item__status--${current.status}`}>
              Ahora: {LEARNING_STATE_STATUS_LABEL[current.status]}
            </span>
            <span className="cert-verification-item__reason">{LEARNING_STATE_REASON_COPY[current.reasonCode]}</span>
            {describeLearningStateEvidence(current) && (
              <span className="cert-verification-item__evidence">{describeLearningStateEvidence(current)}</span>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="course-card__cta" onClick={onReturnToLearningProgress}>
        Volver a Mi aprendizaje
      </button>
    </section>
  );
}

/** Results Page (Fase 6, sección 49): SIEMPRE "Resultado de práctica",
 * nunca lenguaje de aprobación oficial de certificación. */
export function CertificationResultsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const exam = useCertificationExam(courseId);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [showReview, setShowReview] = useState(false);
  const result: CertificationPracticeResult | null = courseId ? loadCertificationResult(courseId) : null;

  useEffect(() => {
    if (!courseId) return;
    api
      .getCourse(courseId)
      .then(setCourse)
      .catch(() => {});
  }, [courseId]);

  // v1.6.0 Bloque 4 (PARTE 15/16/30): SIEMPRE recalculado desde cero a
  // partir del progreso REAL actual (nunca un patch manual sobre un
  // estado anterior) -- exactamente la misma derivación que usa "Mi
  // aprendizaje", así que ambos SIEMPRE muestran el mismo resultado para
  // el mismo progreso (invariante de consistencia, PARTE 30). Estos hooks
  // deben llamarse ANTES de cualquier `return` temprano (reglas de React)
  // -- por eso van acá, no después de los early returns de abajo.
  const progress = courseId ? getCourseLearningProgress(courseId) : null;
  const summary = useMemo(() => (course && courseId ? buildCourseLearningSummary(course, progress) : null), [course, courseId, progress]);
  const learningStates = useMemo(
    () => (summary && courseId ? deriveCourseLearningStates(courseId, summary.modules, progress) : []),
    [summary, progress, courseId]
  );

  if (!courseId) return null;

  if (!result) {
    return (
      <div className="page">
        <div className="state-box">
          <h3>No hay resultados todavía</h3>
          <p>Iniciá una práctica nueva para ver un resultado acá.</p>
          <Link to={`/certificacion/${courseId}`} className="course-card__cta">
            Ir a preparación de certificación
          </Link>
        </div>
      </div>
    );
  }

  // question_id por sí solo puede repetirse entre preguntas de tópicos
  // distintos dentro del mismo examen ensamblado (cada QuestionBank
  // numera su propio Q-001, Q-002, ...): la clave del lookup y de las
  // filas de repaso siempre debe incluir bank_id (ver examAnswerKey).
  const questionsById = new Map<string, ExamQuestionView>(
    (exam.session?.questions ?? []).map((q) => [examAnswerKey(q.bank_id, q.question_id), q])
  );

  // Panel de verificación: SOLO si esta Certification fue iniciada desde
  // "Evaluar progreso" (contexto real en sessionStorage, PARTE 5) Y ya
  // hay un intento NUEVO real persistido para este curso (PARTE 36/38 --
  // nunca un resultado de verificación falso si el alumno abandonó antes
  // de entregar). `latestAttempt` es el más reciente porque
  // `recordCertificationAttempt` ya ordena por `completedAt` desc al
  // guardar.
  const verificationContext = loadGuidedReviewVerificationContext(courseId);
  const latestAttempt = progress?.certificationAttempts[0] ?? null;
  const verificationResults =
    verificationContext && latestAttempt && hasNewVerificationAttempt(verificationContext, latestAttempt.attemptId)
      ? deriveVerificationResults(
          verificationContext,
          learningStates,
          latestAttempt.performanceByTopic.map((t) => ({ moduleId: t.module_id, topicId: t.topic_id }))
        )
      : [];

  function handleReturnToLearningProgress() {
    clearGuidedReviewVerificationContext();
    navigate("/mi-aprendizaje");
  }

  function handleNewPractice() {
    exam.clearSession();
    // Abandona explícitamente este resultado (PARTE 31): un contexto de
    // verificación viejo nunca debe sobrevivir a una práctica nueva sin
    // relación con el repaso que lo originó.
    clearGuidedReviewVerificationContext();
    navigate(`/certificacion/${courseId}`);
  }

  return (
    <div className="page">
      <div className="cert-header">
        <div>
          <span className="cert-header__course">{course?.title ?? courseId}</span>
          <span className="cert-header__mode">Resultado de práctica</span>
        </div>
      </div>

      <div className="cert-results-summary">
        <div className="cert-results-summary__score">{result.practice_score_percent}%</div>
        <div className="cert-results-summary__breakdown">
          <span>{result.correct} correctas</span>
          <span>{result.partially_correct} parcialmente correctas</span>
          <span>{result.incorrect} incorrectas</span>
          <span>{result.unanswered} sin responder</span>
          <span>{result.total_questions} en total</span>
        </div>
        <p className="cert-disclaimer">
          Este resultado refleja únicamente tu desempeño en esta práctica puntual, basada en el
          material del curso. No es una predicción de aprobación de ninguna certificación oficial.
        </p>
      </div>

      {summary && (
        <VerificationResultPanel
          results={verificationResults}
          modules={summary.modules}
          onReturnToLearningProgress={handleReturnToLearningProgress}
        />
      )}

      <section className="cert-results-section">
        <h3>Desempeño por tópico</h3>
        <div className="cert-table-scroll">
          <table className="cert-results-table">
            <thead>
              <tr>
                <th>Tópico</th>
                <th>Respondidas</th>
                <th>Correctas</th>
                <th>Parciales</th>
                <th>Incorrectas</th>
                <th>Puntaje</th>
              </tr>
            </thead>
            <tbody>
              {result.by_topic.map((topic) => (
                <tr key={`${topic.module_id}/${topic.topic_id}`}>
                  <td>{topic.topic_id}</td>
                  <td>{topic.attempted}</td>
                  <td>{topic.correct}</td>
                  <td>{topic.partially_correct}</td>
                  <td>{topic.incorrect}</td>
                  <td>{topic.practice_score_percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cert-results-section">
        <h3>Competencias</h3>
        <div className="cert-table-scroll">
          <table className="cert-results-table">
            <thead>
              <tr>
                <th>Competencia</th>
                <th>Respondidas</th>
                <th>Correctas</th>
                <th>Puntaje</th>
              </tr>
            </thead>
            <tbody>
              {result.by_competency.map((c) => (
                <tr key={c.competency}>
                  <td>{c.competency}</td>
                  <td>{c.attempted}</td>
                  <td>{c.correct}</td>
                  <td>{c.practice_score_percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {result.topics_to_reinforce.length > 0 && (
        <section className="cert-results-section">
          <h3>Tópicos a reforzar</h3>
          {result.topics_to_reinforce.map((topic) => (
            <div key={`${topic.module_id}/${topic.topic_id}`} className="cert-reinforce-row">
              <div>
                <strong>{topic.topic_id}</strong>
                <p>Conviene reforzar este tópico según el resultado de esta práctica.</p>
              </div>
              <Link
                to={`/aula/${courseId}/${topic.module_id}/${topic.topic_id}`}
                className="course-card__cta"
              >
                Revisar tópico →
              </Link>
            </div>
          ))}
        </section>
      )}

      <section className="cert-results-section">
        <button type="button" onClick={() => setShowReview((v) => !v)}>
          {showReview ? "Ocultar repaso de respuestas" : "Revisar respuestas"}
        </button>
        {showReview && (
          <div className="cert-review-list">
            {result.question_results.map((qr) => {
              const question = questionsById.get(examAnswerKey(qr.bank_id, qr.question_id));
              return (
                <div
                  key={examAnswerKey(qr.bank_id, qr.question_id)}
                  className={`cert-review-item cert-review-item--${qr.verdict}`}
                >
                  <span className="cert-feedback__verdict">{VERDICT_LABELS[qr.verdict]}</span>
                  {question && <p className="cert-question__stem">{question.stem}</p>}
                  <p>
                    <strong>Tu respuesta: </strong>
                    {qr.selected_option_ids.length > 0 ? qr.selected_option_ids.join(", ") : "(sin responder)"}
                  </p>
                  <p>
                    <strong>Respuesta correcta: </strong>
                    {qr.correct_option_ids.join(", ")}
                  </p>
                  {qr.explanation.map((chunk, i) => (
                    <p key={i}>{chunk.text}</p>
                  ))}
                  <p className="cert-review-item__competency">{qr.competency.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="cert-nav">
        <button type="button" onClick={handleNewPractice}>
          Nueva práctica
        </button>
        <Link to={`/cursos/${courseId}`} className="course-card__cta">
          Volver al curso
        </Link>
      </div>
    </div>
  );
}
