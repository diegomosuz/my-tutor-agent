import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Breadcrumb } from "../components/Breadcrumb";
import { GroundingPanel } from "../components/GroundingPanel";
import { SafeMarkdown } from "../components/SafeMarkdown";
import { CheckpointPanel } from "../classroom/CheckpointPanel";
import { CompletionScreen } from "../classroom/CompletionScreen";
import { LoadingSteps } from "../classroom/LoadingSteps";
import { SceneRenderer } from "../classroom/SceneRenderer";
import { TutorPanel } from "../classroom/TutorPanel";
import { buildSourceBlockLookup } from "../classroom/sourceBlockLookup";
import {
  loadVoiceEnabled,
  loadVoiceSpeed,
  saveVoiceEnabled,
  saveVoiceSpeed,
  VOICE_SPEED_OPTIONS,
  type VoiceSpeed,
} from "../classroom/classroomStorage";
import { describeLessonError } from "../classroom/lessonErrors";
import { extractMarkdownLinks } from "../classroom/markdownLinks";
import { isSpeechSupported } from "../classroom/speech";
import { cancelAllSpeech } from "../classroom/voicePlayback";
import { useClassroomEngine } from "../classroom/useClassroomEngine";
import { useClassroomVoice } from "../classroom/useClassroomVoice";
import { useVoicePreference } from "../classroom/useVoicePreference";
import type {
  AiStatusResponse,
  CourseDetail,
  LessonPlan,
  LessonScene,
  TopicResponse,
} from "../types/api";

type ContentTab = "explicacion" | "puntos-clave" | "recursos";

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
  const [contentTab, setContentTab] = useState<ContentTab>("explicacion");

  // Fase 5: interrupción de la clase para conversar con el tutor, y
  // referencia SRC-XXX inspeccionada desde una respuesta del tutor (solo
  // desarrollo — reutiliza el mismo lookup que SceneRenderer/GroundingPanel,
  // sin un segundo sistema de debugging).
  const [tutorInterrupting, setTutorInterrupting] = useState(false);
  const [inspectedTutorRef, setInspectedTutorRef] = useState<string | null>(null);
  const lookupSourceBlock = useMemo(
    () => buildSourceBlockLookup(topic?.canonical),
    [topic?.canonical]
  );

  // Fase 3: estado del agente IA y de la LessonPlan generada.
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<{ title: string; detail: string } | null>(null);

  // Fase 4: preferencias de voz, persistidas como valores simples
  // (nunca objetos SpeechSynthesisVoice) en localStorage.
  const [voiceEnabled, setVoiceEnabled] = useState(() => loadVoiceEnabled());
  const [voiceSpeed, setVoiceSpeed] = useState<VoiceSpeed>(() => loadVoiceSpeed());
  const speechSupported = useMemo(() => isSpeechSupported(), []);
  // Fase 7: voz neural opcional (OpenAI TTS). `useNeural` decide, sin
  // exponer nunca una API key al navegador, si esta narración debería
  // intentar el backend neural en vez de Web Speech API.
  const { useNeural: neuralPreferred, voiceStatus } = useVoicePreference();
  const [neuralVoiceError, setNeuralVoiceError] = useState<string | null>(null);
  // Si la voz neural falla y el alumno elige "Usar voz del navegador"
  // (sección 33), esta sesión deja de intentar neural — nunca rompe la
  // clase, y evita reintentar algo que ya se sabe que está fallando.
  const [neuralDismissed, setNeuralDismissed] = useState(false);
  const useNeural = neuralPreferred && !neuralDismissed;

  // Fase 4: Classroom Engine — navegación determinística de escenas,
  // progreso local y estado de reproducción.
  const engine = useClassroomEngine({ lesson, courseId, moduleId, topicId });

  useClassroomVoice({
    scene: engine.currentScene,
    narrationIndex: engine.currentNarrationIndex,
    renderKey: engine.renderKey,
    enabled: voiceEnabled && !engine.isCompleted,
    rate: voiceSpeed,
    isPaused: engine.isPaused,
    useNeural,
    onAdvanceChunk: engine.nextNarrationChunk,
    onNeuralError: (message) => setNeuralVoiceError(message),
  });

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
    setContentTab("explicacion");
    // Nunca arrastramos la LessonPlan de un tópico anterior: cada tópico
    // tiene la suya (o ninguna todavía). No se genera automáticamente acá
    // para no consumir IA solo por entrar al tópico (sección 45).
    setLesson(null);
    setLessonError(null);
    setTutorInterrupting(false);
    setInspectedTutorRef(null);
    cancelAllSpeech();
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
  // "previo" / "siguiente" entre módulos cuando todavía no hay LessonPlan.
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

  function goToTopic(target: { moduleId: string; topicId: string } | null) {
    if (!target || !courseId) return;
    navigate(`/aula/${courseId}/${target.moduleId}/${target.topicId}`);
  }

  // Con una LessonPlan activa, Previo/Siguiente navegan escenas de la
  // clase generada (Classroom Engine); sin ella, siguen navegando entre
  // tópicos del curso (comportamiento de Fase 1-3).
  function goPrev() {
    if (lesson) {
      engine.previousScene();
      return;
    }
    goToTopic(prevTopic);
  }

  function goNext() {
    if (lesson) {
      engine.nextScene();
      return;
    }
    goToTopic(nextTopic);
  }

  async function handleGenerateLesson(forceRegenerate: boolean) {
    if (!courseId || !moduleId || !topicId) return;
    setLessonLoading(true);
    setLessonError(null);
    try {
      const plan = await api.generateLesson(courseId, moduleId, topicId, forceRegenerate);
      setLesson(plan);
    } catch (err) {
      setLessonError(describeLessonError(err));
    } finally {
      setLessonLoading(false);
    }
  }

  function toggleVoice() {
    setVoiceEnabled((prev) => {
      const next = !prev;
      saveVoiceEnabled(next);
      if (!next) cancelAllSpeech();
      return next;
    });
  }

  function changeVoiceSpeed(speed: VoiceSpeed) {
    setVoiceSpeed(speed);
    saveVoiceSpeed(speed);
  }

  function handleExit() {
    cancelAllSpeech();
    navigate(courseId ? `/cursos/${courseId}` : "/");
  }

  // Fase 5: interrupción/reanudación de la clase al conversar con el
  // tutor (sección 27). Preserva currentSceneIndex/currentNarrationIndex
  // por construcción: nunca se llama nextScene/previousScene/repeatScene
  // acá, solo pause()/resume() ya existentes del Classroom Engine.
  function handleTutorInterrupt() {
    if (tutorInterrupting) return;
    cancelAllSpeech(); // corta la narración de la clase antes de que hable el tutor
    if (lesson) engine.pause();
    setTutorInterrupting(true);
  }

  function handleContinueClass() {
    setTutorInterrupting(false);
    if (lesson) engine.resume();
  }

  function handleModuleChange(newModuleId: string) {
    if (!course || !courseId) return;
    const module = course.modules.find((m) => m.id === newModuleId);
    const firstTopic = module?.topics[0];
    if (firstTopic) {
      navigate(`/aula/${courseId}/${module.id}/${firstTopic.id}`);
    }
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

  const resourceLinks = topic ? extractMarkdownLinks(topic.content_markdown) : [];

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
        {lesson && (
          <div className="classroom-progress" aria-hidden="true">
            <div className="classroom-progress__bar" style={{ width: `${engine.progressPercent}%` }} />
          </div>
        )}

        <div className="classroom-grid">
          <div className={engine.isPaused ? "classroom-stage classroom-paused" : "classroom-stage"}>
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
                  {lessonLoading && <LoadingSteps />}
                  {lessonError && (
                    <div className="slide-panel__error">
                      <p className="slide-panel__error-title">{lessonError.title}</p>
                      <p>{lessonError.detail}</p>
                      <button type="button" onClick={() => handleGenerateLesson(false)}>
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {lesson && engine.isCompleted && (
                <div className="slide-panel__content">
                  <CompletionScreen
                    lesson={lesson}
                    onRepeat={() => engine.resetLesson()}
                    onBackToCourse={handleExit}
                  />
                </div>
              )}

              {lesson && !engine.isCompleted && engine.currentScene && (
                <div className="slide-panel__content slide-panel__content--lesson">
                  <div className="slide-panel__lesson-title">{lesson.lesson_title.text}</div>
                  <SceneRenderer
                    scene={engine.currentScene}
                    canonical={topic?.canonical}
                    renderKey={engine.renderKey}
                  />
                  <div className="slide-panel__scene-indicator">
                    Escena {engine.currentSceneIndex + 1} de {engine.totalScenes}
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

            {lesson && !engine.isCompleted && engine.currentScene && (
              <div className="narration-panel">
                <h4>Narración</h4>
                {engine.currentScene.narration.map((n, i) => (
                  <p
                    key={i}
                    className={
                      voiceEnabled && i === engine.currentNarrationIndex
                        ? "narration-panel__chunk--active"
                        : undefined
                    }
                  >
                    {n.text}
                  </p>
                ))}
              </div>
            )}

            {lesson &&
              !engine.isCompleted &&
              engine.currentScene?.interaction?.interaction_type === "comprehension_check" &&
              courseId &&
              moduleId &&
              topicId && (
                <CheckpointPanel
                  courseId={courseId}
                  moduleId={moduleId}
                  topicId={topicId}
                  scene={engine.currentScene}
                  voiceEnabled={voiceEnabled}
                  voiceRate={voiceSpeed}
                  useNeuralVoice={useNeural}
                />
              )}

            {lesson &&
              !engine.isCompleted &&
              engine.currentScene?.interaction?.interaction_type === "reflection" && (
                <div className="checkpoint-panel checkpoint-panel--reflection">
                  <h4 className="checkpoint-panel__title">Reflexión</h4>
                  <p className="checkpoint-panel__question">
                    {engine.currentScene.interaction.question.text}
                  </p>
                  <p className="checkpoint-panel__hint">
                    Compartí tu reflexión con el tutor en el panel de abajo.
                  </p>
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
            <div className="content-panel__tabs" role="tablist" aria-label="Secciones del contenido">
              {(
                [
                  ["explicacion", "Explicación"],
                  ["puntos-clave", "Puntos clave"],
                  ["recursos", "Recursos"],
                ] as [ContentTab, string][]
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={contentTab === tab}
                  className={contentTab === tab ? "content-panel__tab active" : "content-panel__tab"}
                  onClick={() => setContentTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="content-panel__body">
              {!topic && !error && <p>Cargando contenido del tema…</p>}

              {topic && contentTab === "explicacion" && courseId && moduleId && topicId && (
                <SafeMarkdown
                  markdown={topic.content_markdown}
                  courseId={courseId}
                  moduleId={moduleId}
                  topicId={topicId}
                />
              )}

              {topic && contentTab === "puntos-clave" && (
                <div className="key-points-tab">
                  {lesson && engine.currentScene ? (
                    <>
                      <h4>Escena actual: {engine.currentScene.title.text}</h4>
                      <ul>
                        {engine.currentScene.key_points.map((kp, i) => (
                          <li key={i}>{kp.text}</li>
                        ))}
                      </ul>
                      {lesson.learning_objectives.length > 0 && (
                        <>
                          <h4>Objetivos de aprendizaje</h4>
                          <ul>
                            {lesson.learning_objectives.map((obj, i) => (
                              <li key={i}>{obj.text}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  ) : (
                    <p className="key-points-tab__empty">
                      Preparar la clase con IA para ver los puntos clave de cada escena.
                    </p>
                  )}
                </div>
              )}

              {topic && contentTab === "recursos" && (
                <div className="resources-tab">
                  {resourceLinks.length > 0 ? (
                    <ul>
                      {resourceLinks.map((link) => (
                        <li key={link.url}>
                          <a href={link.url} target="_blank" rel="noopener noreferrer">
                            {link.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="resources-tab__empty">
                      Este tema no incluye enlaces adicionales en su material.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {topic && (
          <GroundingPanel
            canonical={topic.canonical}
            activeSceneId={engine.currentScene?.scene_id}
            activeSceneRefs={engine.currentScene ? collectSceneRefs(engine.currentScene) : undefined}
          />
        )}

        {courseId && moduleId && topicId && (
          <TutorPanel
            key={`${courseId}-${moduleId}-${topicId}`}
            courseId={courseId}
            moduleId={moduleId}
            topicId={topicId}
            sceneId={engine.currentScene?.scene_id ?? null}
            aiStatus={aiStatus}
            voiceEnabled={voiceEnabled}
            voiceRate={voiceSpeed}
            useNeuralVoice={useNeural}
            isInterrupting={tutorInterrupting}
            onInterrupt={handleTutorInterrupt}
            onContinueClass={handleContinueClass}
            onInspectRef={import.meta.env.DEV ? setInspectedTutorRef : undefined}
          />
        )}

        {import.meta.env.DEV && inspectedTutorRef && (
          <div className="grounding-panel__block-preview grounding-panel__block-preview--floating">
            {(() => {
              const block = lookupSourceBlock(inspectedTutorRef);
              return block ? (
                <>
                  <strong>
                    {block.source_ref} · {block.block_type}
                  </strong>
                  <p>{block.plain_text}</p>
                </>
              ) : (
                <p className="grounding-panel__block-preview--missing">
                  {inspectedTutorRef} no existe en los SourceBlocks del tópico.
                </p>
              );
            })()}
            <button type="button" onClick={() => setInspectedTutorRef(null)}>
              Cerrar
            </button>
          </div>
        )}

        <div className="controls-bar">
          <button
            type="button"
            onClick={goPrev}
            disabled={lesson ? engine.isFirstScene : !prevTopic}
            aria-label="Escena o tópico anterior"
          >
            ← Previo
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={lesson ? engine.isCompleted : !nextTopic}
            aria-label={lesson && engine.isLastScene ? "Finalizar tema" : "Siguiente escena o tópico"}
          >
            {lesson && engine.isLastScene ? "Finalizar" : "Siguiente →"}
          </button>
          <span className="controls-bar__divider" aria-hidden="true" />
          <button
            type="button"
            onClick={() => (engine.isPaused ? engine.resume() : engine.pause())}
            disabled={!lesson || engine.isCompleted}
            aria-label={engine.isPaused ? "Reanudar clase" : "Pausar clase"}
          >
            {engine.isPaused ? "▶ Reanudar" : "⏸ Pausar"}
          </button>
          <button
            type="button"
            onClick={() => engine.repeatScene()}
            disabled={!lesson || engine.isCompleted}
            aria-label="Repetir escena actual"
          >
            ↻ Repetir
          </button>
          <span className="controls-bar__divider" aria-hidden="true" />
          <div className="controls-bar__voice">
            <button
              type="button"
              className={voiceEnabled ? "primary" : undefined}
              onClick={toggleVoice}
              disabled={!speechSupported && !useNeural}
              aria-pressed={voiceEnabled}
              aria-label={voiceEnabled ? "Desactivar voz" : "Activar voz"}
            >
              {!speechSupported && !useNeural
                ? "🔈 Voz no disponible"
                : voiceEnabled
                  ? "🔊 Voz activada"
                  : "🔈 Activar voz"}
            </button>
            {voiceEnabled && (speechSupported || useNeural) && (
              <select
                aria-label="Velocidad de voz"
                value={voiceSpeed}
                onChange={(e) => changeVoiceSpeed(Number(e.target.value) as VoiceSpeed)}
              >
                {VOICE_SPEED_OPTIONS.map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}x
                  </option>
                ))}
              </select>
            )}
            {voiceEnabled && useNeural && (
              <span className="voice-disclosure" title={`Modelo: ${voiceStatus?.tts_model ?? ""}`}>
                Voz generada por IA
              </span>
            )}
          </div>
          {neuralVoiceError && (
            <div className="voice-neural-error">
              <span>{neuralVoiceError}</span>
              <button
                type="button"
                onClick={() => {
                  setNeuralVoiceError(null);
                  setNeuralDismissed(true);
                }}
              >
                Usar voz del navegador
              </button>
            </div>
          )}
          <span className="controls-bar__divider" aria-hidden="true" />
          <button type="button" className="danger" onClick={handleExit}>
            Salir de la clase
          </button>
        </div>
      </div>
    </>
  );
}
