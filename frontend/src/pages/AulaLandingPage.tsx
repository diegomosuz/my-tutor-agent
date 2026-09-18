import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CourseSummary } from "../types/api";

export function AulaLandingPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);

  useEffect(() => {
    api.getCourses().then(setCourses).catch(() => setCourses([]));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__eyebrow">Aula Virtual</div>
        <h1>Elegí un curso para entrar a clase</h1>
        <p>Seleccioná uno de tus cursos para continuar donde lo dejaste.</p>
      </div>
      <div className="card-grid">
        {courses.map((course) => (
          <Link key={course.id} to={`/cursos/${course.id}`} className="course-card">
            <span className="course-card__stripe" aria-hidden="true" />
            <h3>{course.title}</h3>
            <p>{course.description || "Curso técnico del catálogo PwC AI Tutor."}</p>
            <span className="course-card__cta">Entrar →</span>
          </Link>
        ))}
        {courses.length === 0 && (
          <div className="state-box">
            <h3>No hay cursos disponibles todavía</h3>
          </div>
        )}
      </div>
    </div>
  );
}
