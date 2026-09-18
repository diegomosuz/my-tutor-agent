import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ApiError } from "../api/client";
import { Breadcrumb } from "../components/Breadcrumb";
import { GroundingPanel } from "../components/GroundingPanel";
import type { AiStatusResponse, CourseDetail, LessonPlan, LessonScene, TopicResponse } from "../types/api";

const SUGGESTIONS = [
  "Resumime este tema en 3 puntos",
  "Explicalo con otras palabras",
  "Dame un ejemplo del contenido",
  "¿Qué relación tiene con el módulo anterior?",
];

/** Todas las source_refs citadas por una escena (título, key_points,
 * narration, visual e interacción), sin duplicados. Se usa para el panel
 * de grounding en modo desarrollo (ver components/GroundingPanel.tsx). */
function collectSceneRefs(scene: LessonScene): string[] {
  const refs = new Set<string>();
  scene.title.source_refs.forEach((r) => refs.add(r));
  scene.key_points.forEach((kp) => kp.source_refs.forEach((r) => refs.add(r)));
  scene.narration.forEach((n) => n.source_refs.forEach((r) => refs.add(r)));
  scene.visual.source_refs.forEach((r) => refs.add(r));
  if (scene.interaction) {
    scene.interaction.question.source_refs.forEach((r) => refs.add(r));
    scene.interaction.expected_answer?.source_refs.forEach((r) => refs.add(r));
  }
  return Array.from(refs);
}

export function ClassroomPage() {
  const { courseId, moduleId, topicId } = useParams<{
    courseId: string;
    moduleId: string;
    topicId: string;
  }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [topic, setTopic] = useState<TopicResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // Fase 3: estado del agente IA y de la LessonPlan generada.
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getAiStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch(() => {
        // El estado de IA es informativo: si falla, simplemente no se
        // muestra nada — nunca debe romper el resto del aula.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    api
      .getCourse(courseId)
      .then((data) => {
        if (!cancelled) setCourse(data);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar la información del curso.");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    if (!courseId || !moduleId || !topicId) return;
    let cancelled = false;
    setTopic(null);
    setError(null);
    // Nunca arrastramos la LessonPlan de un tópico anterior: cada tópico
    // tiene la suya (o ninguna todavía). No se genera automáticamente acá
    // para no consumir IA solo por entrar al tópico.
    setLesson(null);
    setLessonError(null);
    setSceneIndex(0);
    api
      .getTopic(courseId, moduleId, topicId)
      .then((data) => {
        if (!cancelled) setTopic(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? "Este tópico no existe o no está disponible en el material del curso."
              : "No se pudo conectar con el servidor."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, moduleId, topicId]);

  // Lista plana de tópicos del curso, en orden, para poder calcular
  // "previo" / "siguiente" entre módulos.
  const flatTopics = useMemo(() => {
    if (!course) return [];
    return course.modules.flatMap((module) =>
      module.topics.map((t) => ({ moduleId: module.id, topicId: t.id, title: t.title }))
    );
  }, [course]);

  const currentIndex = flatTopics.findIndex(
    (t) => t.moduleId === moduleId && t.topicId === topicId
  );
  const prevTopic = currentIndex > 0 ? flatTopics[currentIndex - 1] : null;
  const nextTopic =
    currentIndex >= 0 && currentIndex < flatTopics.length - 1
      ? flatTopics[currentIndex + 1]
      : null;

  function goTo(target: { moduleId: string; topicId: string } | null) {
    if (!target || !courseId) return;
    navigate(`/aula/${courseId}/${target.moduleId}/${target.topicId}`);
  }

  const currentScene = lesson ? lesson.scenes[sceneIndex] ?? null : null;

  // Con una LessonPlan activa, Previo/Siguiente navegan escenas de la
  // clase generada; sin ella, siguen navegando entre tópicos del curso
  // (comportamiento de Fase 1).
  function goPrev() {
    if (lesson) {
      setSceneIndex((i) => Math.max(0, i - 1));
      return;
    }
    goTo(prevTopic);
  }

  function goNext() {
    if (lesson) {
      setSceneIndex((i) => Math.min(lesson.scenes.length - 1, i + 1));
      return;
    }
    goTo(nextTopic);
  }

  async function handleGenerateLesson(forceRegenerate: boolean) {
    if (!courseId || !moduleId || !topicId) return;
    setLessonLoading(true);
    setLessonError(null);
    try {
      const plan = await api.generateLesson(courseId, moduleId, topicId, forceRegenerate);
      setLesson(plan);
      setSceneIndex(0);
    } catch (err) {
      setLessonError(
        err instanceof ApiError
          ? err.message
          : "No se pudo conectar con el servidor para generar la clase."
      );
    } finally {
      setLessonLoading(false);
    }
  }

  function handleModuleChange(newModuleId: string) {
    if (!course || !courseId) return;
    const module = course.modules.find((m) => m.id === newModuleId);
    const firstTopic = module?.topics[0];
    if (firstTopic) {
      navigate(`/aula/${courseId}/${module.id}/${firstTopic.id}`);
    }
  }

  function handleAskSubmit(e: FormEvent) {
    e.preventDefault();
    // Placeholder: el motor LLM todavía no está implementado (Fase 1).
    // El asistente solo podrá responder basándose en el Markdown del tópico
    // cuando se integre el proveedor LLM en una fase futura.
  }

  if (error) {
    return (
      <div className="page">
        <div className="state-box state-box--error">
          <h3>No pudimos cargar el aula</h3>
          <p>{error}</p>
          <p style={{ marginTop: 12 }}>
            <Link to="/">Volver al catálogo</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="course-subheader">
        <div className="course-subheader__title">
          {course ? course.title : "Cargando curso…"}
        </div>
        {course && course.modules.length > 0 && (
          <div className="course-subheader__select">
            <label htmlFor="module-select" style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Módulo
            </label>
            <select
              id="module-select"
              value={moduleId}
              onChange={(e) => handleModuleChange(e.target.value)}
            >
              {course.modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Breadcrumb
        items={[
          { label: "Catálogo", to: "/" },
          { label: course?.title ?? "Curso", to: courseId ? `/cursos/${courseId}` : undefined },
          {
            label: course?.modules.find((m) => m.id === moduleId)?.title ?? "Módulo",
          },
          { label: topic?.topic.title ?? "Tópico" },
        ]}
      />

      <div className="page" style={{ paddingTop: 16 }}>
        <div className="classroom-grid">
          <div>
            <div className="slide-panel">
              {import.meta.env.DEV && lesson && (
                <span className="slide-panel__dev-cache">
                  lesson cache: {lesson.cached ? "HIT" : "MISS"}
                </span>
              )}

              {!lesson && (
                <div className="slide-panel__content">
                  <span className="slide-panel__badge">Clase en vivo</span>
                  <h2>{topic ? topic.topic.title : "Cargando…"}</h2>
                  {!lessonLoading && !lessonError && (
                    <>
                      <p>
                        Generá una clase estructurada con IA a partir exclusivamente del
                        contenido Markdown de este tópico.
                      </p>
                      <button
                        type="button"
                        className="slide-panel__cta"
                        disabled={!topic}
                        onClick={() => handleGenerateLesson(false)}
                      >
                        ✨ Preparar clase con IA
                      </button>
                    </>
                  )}
                  {lessonLoading && <p>Generando clase con IA…</p>}
                  {lessonError && (
                    <div className="slide-panel__error">
                      <p>{lessonError}</p>
                      <button type="button" onClick={() => handleGenerateLesson(false)}>
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {lesson && currentScene && (
                <div className="slide-panel__content slide-panel__content--lesson">
                  <span className="slide-panel__badge">{currentScene.scene_type}</span>
                  <div className="slide-panel__lesson-title">{lesson.lesson_title.text}</div>
                  <h2>{currentScene.title.text}</h2>
                  {currentScene.key_points.length > 0 && (
                    <ul className="slide-panel__key-points">
                      {currentScene.key_points.map((kp, i) => (
                        <li key={i}>{kp.text}</li>
                      ))}
                    </ul>
                  )}
                  <div className="slide-panel__scene-indicator">
                    Escena {sceneIndex + 1} de {lesson.scenes.length}
                    {" · "}
                    <button
                      type="button"
                      className="slide-panel__regenerate"
                      onClick={() => handleGenerateLesson(true)}
                      disabled={lessonLoading}
                    >
                      {lessonLoading ? "Regenerando…" : "↻ Regenerar clase con IA"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {lesson && currentScene && (
              <div className="narration-panel">
                <h4>Narración</h4>
                {currentScene.narration.map((n, i) => (
                  <p key={i}>{n.text}</p>
                ))}
              </div>
            )}

            {course && course.modules.length > 0 && (
              <div className="module-topic-nav">
                {flatTopics.map((t) => (
                  <Link
                    key={`${t.moduleId}-${t.topicId}`}
                    to={`/aula/${courseId}/${t.moduleId}/${t.topicId}`}
                    className={
                      t.moduleId === moduleId && t.topicId === topicId ? "active" : undefined
                    }
                  >
                    {t.title}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="content-panel">
            <div className="content-panel__header">
              <h2>Contenido del tema</h2>
              {topic && <span className="content-panel__badge">Fuente: Markdown</span>}
            </div>
            <div className="content-panel__body">
              {!topic && !error && <p>Cargando contenido del tema…</p>}
              {topic && (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {topic.content_markdown}
                </ReactMarkdown>
              )}
            </div>
          </div>
        </div>

        {topic && (
          <GroundingPanel
            canonical={topic.canonical}
            activeSceneId={currentScene?.scene_id}
            activeSceneRefs={currentScene ? collectSceneRefs(currentScene) : undefined}
          />
        )}

        <div className="assistant-panel">
          <div className="assistant-panel__header">
            <span className="assistant-panel__icon" aria-hidden="true" />
            <h3>Pregunta al asistente IA</h3>
            {aiStatus && (
              <span
                className={
                  "assistant-panel__ai-status " +
                  (aiStatus.configured
                    ? "assistant-panel__ai-status--on"
                    : "assistant-panel__ai-status--off")
                }
              >
                {aiStatus.configured ? "● Agente IA activo" : "○ IA no configurada"}
              </span>
            )}
          </div>
          <form className="assistant-panel__form" onSubmit={handleAskSubmit}>
            <input
              type="text"
              placeholder="Escribí tu pregunta sobre este tema…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button type="submit">Enviar</button>
          </form>
          <div className="assistant-panel__suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="assistant-panel__chip"
                onClick={() => setQuestion(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="assistant-panel__hint">
            El asistente responderá únicamente en base al contenido de este
            tópico. Esta funcionalidad todavía no está activa (disponible en
            una fase futura).
          </p>
        </div>

        <div className="controls-bar">
          <button
            type="button"
            onClick={goPrev}
            disabled={lesson ? sceneIndex === 0 : !prevTopic}
          >
            ← Previo
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={lesson ? sceneIndex === lesson.scenes.length - 1 : !nextTopic}
          >
            Siguiente →
          </button>
          <span className="controls-bar__divider" aria-hidden="true" />
          <button type="button" onClick={() => setIsPaused((p) => !p)}>
            {isPaused ? "▶ Reanudar" : "⏸ Pausar"}
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            ↻ Repetir
          </button>
          <button
            type="button"
            className={voiceEnabled ? "primary" : undefined}
            onClick={() => setVoiceEnabled((v) => !v)}
          >
            {voiceEnabled ? "🔊 Voz activada" : "🔈 Activar voz"}
          </button>
          <span className="controls-bar__divider" aria-hidden="true" />
          <button type="button" className="danger" onClick={() => navigate(`/cursos/${courseId}`)}>
            Salir de la clase
          </button>
        </div>
      </div>
    </>
  );
}
