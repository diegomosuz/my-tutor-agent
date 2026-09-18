import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { QuestionPlayer } from "../certification/QuestionPlayer";
import { useCertificationExam } from "../certification/useCertificationExam";
import type { CourseDetail } from "../types/api";

const VERDICT_LABELS: Record<string, string> = {
  correct: "Correcta",
  partially_correct: "Parcialmente correcta",
  incorrect: "Incorrecta",
};

/** Practice Page (Fase 6, sección 47): una pregunta a la vez, feedback
 * inmediato tras "Comprobar". Una vez corregida, la pregunta queda
 * bloqueada (no se puede cambiar la respuesta) — ver sección 47. */
export function CertificationPracticePage() {
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

  if (!exam.session || exam.session.mode !== "practice") {
    return (
      <div className="page">
        <div className="state-box">
          <h3>No hay una práctica en curso</h3>
          <p>Preparación una práctica nueva para empezar.</p>
          <Link to={`/certificacion/${courseId}`} className="course-card__cta">
            Ir a preparación de certificación
          </Link>
        </div>
      </div>
    );
  }

  const { session } = exam;
  const question = session.questions[session.currentIndex];
  const total = session.questions.length;
  const selected = session.selections[question.question_id] ?? [];
  const evaluation = session.evaluations[question.question_id] ?? null;
  const isLast = session.currentIndex === total - 1;

  async function handleCheck() {
    await exam.evaluateCurrentQuestion();
  }

  async function handleNext() {
    if (isLast) {
      const result = await exam.submitExam();
      if (result) navigate(`/certificacion/${courseId}/resultados`);
      return;
    }
    exam.goToIndex(session.currentIndex + 1);
  }

  return (
    <div className="page">
      <div className="cert-header">
        <div>
          <span className="cert-header__course">{course?.title ?? courseId}</span>
          <span className="cert-header__mode">Práctica guiada</span>
        </div>
      </div>

      <QuestionPlayer
        question={question}
        index={session.currentIndex}
        total={total}
        selectedOptionIds={selected}
        onChange={(ids) => exam.selectAnswer(question.question_id, ids)}
        disabled={!!evaluation}
      />

      {exam.error && (
        <div className="state-box state-box--error">
          <h3>{exam.error.title}</h3>
          <p>{exam.error.detail}</p>
        </div>
      )}

      {evaluation && (
        <div className={`cert-feedback cert-feedback--${evaluation.verdict}`}>
          <span className="cert-feedback__verdict">{VERDICT_LABELS[evaluation.verdict]}</span>
          {evaluation.explanation.map((chunk, i) => (
            <p key={i}>{chunk.text}</p>
          ))}
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
        {!evaluation ? (
          <button type="button" onClick={handleCheck} disabled={selected.length === 0 || exam.loading}>
            {exam.loading ? "Comprobando…" : "Comprobar"}
          </button>
        ) : (
          <button type="button" onClick={handleNext} disabled={exam.loading}>
            {isLast ? (exam.loading ? "Enviando…" : "Ver resultados") : "Siguiente pregunta →"}
          </button>
        )}
      </div>
    </div>
  );
}
