import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { QuestionPlayer } from "../certification/QuestionPlayer";
import { useCertificationExam } from "../certification/useCertificationExam";
import type { CourseDetail } from "../types/api";

/** Simulation Page (Fase 6, sección 48): navegación libre entre
 * preguntas, SIN feedback ni answer key hasta entregar. Sin timer oficial
 * (nunca se inventa una duración). */
export function CertificationSimulationPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const exam = useCertificationExam(courseId);
  const [course, setCourse] = useState<CourseDetail | null>(null);

  useEffect(() => {
    if (!courseId) return;
    api
      .getCourse(courseId)
      .then(setCourse)
      .catch(() => {});
  }, [courseId]);

  if (!courseId) return null;

  if (!exam.session || exam.session.mode !== "simulation") {
    return (
      <div className="page">
        <div className="state-box">
          <h3>No hay un simulacro en curso</h3>
          <p>Preparación un simulacro nuevo para empezar.</p>
          <Link to={`/certificacion/${courseId}`} className="course-card__cta">
            Ir a preparación de certificación
          </Link>
        </div>
      </div>
    );
  }

  const { session } = exam;
  if (session.questions.length === 0) {
    // Defensa adicional (Fase 8, sección 28): ver misma nota en
    // CertificationPracticePage.tsx.
    return (
      <div className="page">
        <div className="state-box state-box--error">
          <h3>No hay preguntas en este simulacro</h3>
          <p>Preparación un simulacro nuevo con otro alcance.</p>
          <Link to={`/certificacion/${courseId}`} className="course-card__cta">
            Ir a preparación de certificación
          </Link>
        </div>
      </div>
    );
  }
  const question = session.questions[session.currentIndex];
  const total = session.questions.length;
  const selected = session.selections[question.question_id] ?? [];
  const isLast = session.currentIndex === total - 1;
  const answeredCount = session.questions.filter(
    (q) => (session.selections[q.question_id] ?? []).length > 0
  ).length;
  const unansweredCount = total - answeredCount;

  async function handleSubmit() {
    if (unansweredCount > 0) {
      const confirmed = window.confirm(
        `Tenés ${unansweredCount} pregunta${unansweredCount === 1 ? "" : "s"} sin responder. ¿Querés entregar igualmente?`
      );
      if (!confirmed) return;
    }
    const result = await exam.submitExam();
    if (result) navigate(`/certificacion/${courseId}/resultados`);
  }

  return (
    <div className="page">
      <div className="cert-header">
        <div>
          <span className="cert-header__course">{course?.title ?? courseId}</span>
          <span className="cert-header__mode">Simulacro</span>
        </div>
        <div className="cert-header__progress">
          {answeredCount} respondidas · {unansweredCount} pendientes
          <span className="cert-header__no-timer"> · Sin límite de tiempo configurado</span>
        </div>
      </div>

      <QuestionPlayer
        question={question}
        index={session.currentIndex}
        total={total}
        selectedOptionIds={selected}
        onChange={(ids) => exam.selectAnswer(question.question_id, ids)}
      />

      {exam.error && (
        <div className="state-box state-box--error">
          <h3>{exam.error.title}</h3>
          <p>{exam.error.detail}</p>
        </div>
      )}

      <div className="cert-nav">
        <button
          type="button"
          onClick={() => exam.goToIndex(session.currentIndex - 1)}
          disabled={session.currentIndex === 0}
        >
          ← Anterior
        </button>
        {!isLast ? (
          <button type="button" onClick={() => exam.goToIndex(session.currentIndex + 1)}>
            Siguiente →
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={exam.loading}>
            {exam.loading ? "Entregando…" : "Entregar simulacro"}
          </button>
        )}
      </div>

      <div className="cert-question-dots">
        {session.questions.map((q, i) => (
          <button
            key={q.question_id}
            type="button"
            className={
              "cert-question-dots__dot" +
              (i === session.currentIndex ? " cert-question-dots__dot--active" : "") +
              ((session.selections[q.question_id] ?? []).length > 0 ? " cert-question-dots__dot--answered" : "")
            }
            onClick={() => exam.goToIndex(i)}
            aria-label={`Ir a la pregunta ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
