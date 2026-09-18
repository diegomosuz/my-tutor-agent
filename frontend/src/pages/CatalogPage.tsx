import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { CourseSummary } from "../types/api";

export function CatalogPage() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getCourses()
      .then((data) => {
        if (!cancelled) setCourses(data);
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

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__eyebrow">Catálogo</div>
        <h1>Cursos disponibles</h1>
        <p>
          Explorá los cursos técnicos disponibles. Cada curso está organizado en
          módulos y tópicos, construidos a partir de material curado y
          verificado.
        </p>
      </div>

      {error && (
        <div className="state-box state-box--error">
          <h3>No pudimos cargar el catálogo</h3>
          <p>{error}</p>
        </div>
      )}

      {!error && courses === null && (
        <div className="state-box">
          <h3>Cargando cursos…</h3>
        </div>
      )}

      {!error && courses !== null && courses.length === 0 && (
        <div className="state-box">
          <h3>Todavía no hay cursos publicados</h3>
          <p>Agregá contenido dentro del directorio de cursos montado en el backend.</p>
        </div>
      )}

      {!error && courses !== null && courses.length > 0 && (
        <div className="card-grid">
          {courses.map((course) => (
            <Link key={course.id} to={`/cursos/${course.id}`} className="course-card">
              <span className="course-card__stripe" aria-hidden="true" />
              <h3>{course.title}</h3>
              <p>{course.description || "Curso técnico del catálogo PwC AI Tutor."}</p>
              <div className="course-card__meta">
                <span>{course.module_count} módulos</span>
                <span>{course.topic_count} tópicos</span>
              </div>
              <span className="course-card__cta">Ver curso →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
