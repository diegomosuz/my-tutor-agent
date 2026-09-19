import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Breadcrumb } from "../components/Breadcrumb";
import type { CourseDetail } from "../types/api";

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setCourse(null);
    setError(null);
    api
      .getCourse(courseId)
      .then((data) => {
        if (!cancelled) setCourse(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? "Este curso no existe o no está disponible."
              : "No se pudo conectar con el servidor."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (error) {
    return (
      <div className="page">
        <div className="state-box state-box--error">
          <h3>No pudimos cargar el curso</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="page">
        <div className="state-box">
          <h3>Cargando curso…</h3>
        </div>
      </div>
    );
  }

  const firstModule = course.modules[0];
  const firstTopic = firstModule?.topics[0];

  return (
    <div className="page">
      <Breadcrumb
        items={[{ label: "Catálogo", to: "/" }, { label: course.title }]}
      />

      <div className="page-header" style={{ marginTop: 16 }}>
        <div className="page-header__eyebrow">Curso</div>
        <h1>{course.title}</h1>
        <p>
          {course.description ||
            "Recorré los módulos y tópicos de este curso en el orden sugerido."}
        </p>
        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {firstModule && firstTopic && (
            <Link
              to={`/aula/${course.id}/${firstModule.id}/${firstTopic.id}`}
              className="course-card__cta"
              style={{ display: "inline-flex" }}
            >
              Entrar al aula virtual →
            </Link>
          )}
          <Link
            to={`/certificacion/${course.id}`}
            className="course-card__cta course-card__cta--secondary"
            style={{ display: "inline-flex" }}
          >
            Preparación de certificación →
          </Link>
        </div>
      </div>

      <div className="module-list">
        {course.modules.map((module, index) => (
          <div className="module-block" key={module.id}>
            <div className="module-block__header">
              <span className="module-block__index">{index + 1}</span>
              <h3>{module.title}</h3>
            </div>
            {module.topics.map((topic, topicIndex) => (
              // topic.id no es necesariamente único dentro de un módulo
              // (ver "duplicate_slug" en course_diagnostics.py, mismo caso
              // real ya corregido en ClassroomPage.tsx/
              // LearningProgressPage.tsx/CertificationSetupPage.tsx); se
              // agrega el índice como desempate para la key de React.
              <Link
                key={`${topic.id}-${topicIndex}`}
                to={`/aula/${course.id}/${module.id}/${topic.id}`}
                className="topic-row"
              >
                <span className="topic-row__title">
                  <span className="topic-row__dot" aria-hidden="true" />
                  {topic.title}
                </span>
                <span className="topic-row__cta">Ver tópico →</span>
              </Link>
            ))}
            {module.topics.length === 0 && (
              <div className="topic-row">
                <span className="topic-row__title">Sin tópicos todavía</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
