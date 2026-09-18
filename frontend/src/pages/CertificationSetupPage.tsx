import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Breadcrumb } from "../components/Breadcrumb";
import { useCertificationExam } from "../certification/useCertificationExam";
import type { CertificationMode, CourseDetail } from "../types/api";

type ScopeKind = "course" | "modules" | "topics";

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30];

/** Pantalla dedicada "Preparación de certificación" (Fase 6, sección 44).
 * Nunca llama al LLM hasta que el alumno pulsa "Preparar práctica"
 * (sección 61: no se genera nada al simplemente abrir esta pantalla). */
export function CertificationSetupPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scopeKind, setScopeKind] = useState<ScopeKind>("course");
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [mode, setMode] = useState<CertificationMode>("practice");
  const [questionCount, setQuestionCount] = useState(10);

  const exam = useCertificationExam(courseId);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    api
      .getCourse(courseId)
      .then((data) => {
        if (!cancelled) setCourse(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
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

  function toggleModule(moduleId: string) {
    setSelectedModuleIds((prev) =>
      prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]
    );
  }

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  }

  async function handlePrepare() {
    if (!courseId) return;
    const scope =
      scopeKind === "topics"
        ? { module_ids: [], topic_ids: selectedTopicIds }
        : scopeKind === "modules"
          ? { module_ids: selectedModuleIds, topic_ids: [] }
          : { module_ids: [], topic_ids: [] };

    const ok = await exam.prepare({ mode, scope, question_count: questionCount, shuffle: true });
    if (ok) {
      navigate(`/certificacion/${courseId}/${mode === "practice" ? "practica" : "simulacro"}`);
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <div className="state-box state-box--error">
          <h3>No pudimos cargar el curso</h3>
          <p>{loadError}</p>
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

  const scopeInvalid =
    (scopeKind === "modules" && selectedModuleIds.length === 0) ||
    (scopeKind === "topics" && selectedTopicIds.length === 0);

  return (
    <div className="page">
      <Breadcrumb
        items={[
          { label: "Catálogo", to: "/" },
          { label: course.title, to: `/cursos/${course.id}` },
          { label: "Preparación de certificación" },
        ]}
      />

      <div className="page-header" style={{ marginTop: 16 }}>
        <div className="page-header__eyebrow">Preparación de certificación</div>
        <h1>{course.title}</h1>
        <p className="cert-disclaimer">
          Las preguntas se generan exclusivamente a partir del material cargado en este curso. No
          representan preguntas oficiales de una certificación.
        </p>
      </div>

      <div className="cert-setup">
        <section className="cert-setup__section">
          <h3>Alcance</h3>
          <div className="cert-setup__options">
            <label className="cert-setup__radio">
              <input
                type="radio"
                name="scope-kind"
                checked={scopeKind === "course"}
                onChange={() => setScopeKind("course")}
              />
              Curso completo
            </label>
            <label className="cert-setup__radio">
              <input
                type="radio"
                name="scope-kind"
                checked={scopeKind === "modules"}
                onChange={() => setScopeKind("modules")}
              />
              Módulos específicos
            </label>
            <label className="cert-setup__radio">
              <input
                type="radio"
                name="scope-kind"
                checked={scopeKind === "topics"}
                onChange={() => setScopeKind("topics")}
              />
              Tópicos específicos
            </label>
          </div>

          {scopeKind === "modules" && (
            <div className="cert-setup__checklist">
              {course.modules.map((module) => (
                <label key={module.id} className="cert-setup__checkbox">
                  <input
                    type="checkbox"
                    checked={selectedModuleIds.includes(module.id)}
                    onChange={() => toggleModule(module.id)}
                  />
                  {module.title}
                </label>
              ))}
            </div>
          )}

          {scopeKind === "topics" && (
            <div className="cert-setup__checklist">
              {course.modules.map((module) => (
                <div key={module.id} className="cert-setup__topic-group">
                  <span className="cert-setup__topic-group-title">{module.title}</span>
                  {module.topics.map((topic) => (
                    <label key={topic.id} className="cert-setup__checkbox">
                      <input
                        type="checkbox"
                        checked={selectedTopicIds.includes(topic.id)}
                        onChange={() => toggleTopic(topic.id)}
                      />
                      {topic.title}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="cert-setup__section">
          <h3>Modo</h3>
          <div className="cert-setup__options">
            <label className="cert-setup__radio">
              <input
                type="radio"
                name="mode"
                checked={mode === "practice"}
                onChange={() => setMode("practice")}
              />
              Práctica guiada (feedback inmediato por pregunta)
            </label>
            <label className="cert-setup__radio">
              <input
                type="radio"
                name="mode"
                checked={mode === "simulation"}
                onChange={() => setMode("simulation")}
              />
              Simulacro (sin feedback hasta el final)
            </label>
          </div>
        </section>

        <section className="cert-setup__section">
          <h3>Cantidad de preguntas</h3>
          <div className="cert-setup__options">
            {QUESTION_COUNT_OPTIONS.map((count) => (
              <label key={count} className="cert-setup__radio">
                <input
                  type="radio"
                  name="question-count"
                  checked={questionCount === count}
                  onChange={() => setQuestionCount(count)}
                />
                {count}
              </label>
            ))}
          </div>
        </section>

        {exam.error && (
          <div className="state-box state-box--error">
            <h3>{exam.error.title}</h3>
            <p>{exam.error.detail}</p>
          </div>
        )}

        <button
          type="button"
          className="course-card__cta"
          onClick={handlePrepare}
          disabled={exam.loading || scopeInvalid}
        >
          {exam.loading ? "Preparando preguntas…" : "Preparar práctica"}
        </button>
      </div>
    </div>
  );
}
