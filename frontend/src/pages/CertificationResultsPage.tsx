import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useCertificationExam } from "../certification/useCertificationExam";
import { loadCertificationResult } from "../certification/certificationStorage";
import type { CertificationPracticeResult, CourseDetail, ExamQuestionView } from "../types/api";

const VERDICT_LABELS: Record<string, string> = {
  correct: "Correcta",
  partially_correct: "Parcialmente correcta",
  incorrect: "Incorrecta",
};

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

  const questionsById = new Map<string, ExamQuestionView>(
    (exam.session?.questions ?? []).map((q) => [q.question_id, q])
  );

  function handleNewPractice() {
    exam.clearSession();
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
              const question = questionsById.get(qr.question_id);
              return (
                <div key={qr.question_id} className={`cert-review-item cert-review-item--${qr.verdict}`}>
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
