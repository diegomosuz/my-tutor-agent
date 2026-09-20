import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { AiOperationStatus } from "../components/AiOperationStatus";
import { Breadcrumb } from "../components/Breadcrumb";
import { GroundingPanel } from "../components/GroundingPanel";
import { SafeMarkdown } from "../components/SafeMarkdown";
import { CheckpointPanel } from "../classroom/CheckpointPanel";
import { CompletionScreen } from "../classroom/CompletionScreen";
import { ReadAloudControls } from "../classroom/ReadAloudControls";
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
import { getAvailableVoices, isSpeechSupported, pickSpanishVoice } from "../classroom/speech";
import { claimAiAudioPriority } from "../classroom/readAloudPriority";
import { useReadAloud } from "../classroom/useReadAloud";
import { cancelAllSpeech } from "../classroom/voicePlayback";
import { useClassroomEngine } from "../classroom/useClassroomEngine";
import { useClassroomVoice } from "../classroom/useClassroomVoice";
import { useVoicePreference } from "../classroom/useVoicePreference";
import {
  getCourseLearningProgress,
  markTopicCompleted,
  markTopicStarted,
} from "../learning/learningProgressStore";
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
  const [searchParams] = useSearchParams();
  // v1.1.0 (adaptación pedagógica, PARTE 15): "modo repaso", puramente
  // visual — llegar acá desde una recomendación de refuerzo de "Mi
  // aprendizaje" (?review=true) nunca genera una LessonPlan distinta, ni
  // crea un segundo sistema de playback, ni cambia qué se persiste en
  // Learning Progress (sigue siendo el mismo evento markTopicStarted/
  // markTopicCompleted de siempre). Solo muestra un badge "Repaso".
  const isReviewMode = searchParams.get("review") === "true";

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

  // v1.5.0 (Guided Markdown Read Aloud): misma selección de voz en
  // español que ya usa `useClassroomVoice.ts` para la narración de la
  // clase -- nunca una voz nueva ni un criterio de selección distinto.
  const [readAloudVoice, setReadAloudVoice] = useState<SpeechSynthesisVoice | undefined>(undefined);
  useEffect(() => {
    if (!speechSupported) return;
    function loadVoice() {
      setReadAloudVoice(pickSpanishVoice(getAvailableVoices()));
    }
    loadVoice();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoice);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoice);
  }, [speechSupported]);

  // Fase 4: Classroom Engine — navegación determinística de escenas,
  // progreso local y estado de reproducción.
  const engine = useClassroomEngine({ lesson, courseId, moduleId, topicId });

  // v1.1.0 — Learning Progress ("Mi aprendizaje"): capa ADITIVA e
  // independiente de classroomStorage.ts (que sigue intacta). Nunca lee
  // `engine.isCompleted` de forma continua (ese flag se resetea al
  // navegar hacia atrás o repetir — ver useClassroomEngine.ts): reacciona
  // solo al EVENTO de que pasó a `true`, y lo registra como un ratchet de
  // una sola dirección en learningProgressStore, así "Previo"/"Repetir
  // tema" nunca pueden borrar un `completed` ya alcanzado.
  useEffect(() => {
    if (!lesson || !courseId || !moduleId || !topicId) return;
    markTopicStarted(courseId, moduleId, topicId, {
      currentScene: engine.currentSceneIndex,
      totalScenes: engine.totalScenes,
      contentSha256: lesson.content_sha256,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, courseId, moduleId, topicId, engine.currentSceneIndex, engine.totalScenes]);

  useEffect(() => {
    if (!engine.isCompleted || !courseId || !moduleId || !topicId) return;
    markTopicCompleted(courseId, moduleId, topicId, lesson?.content_sha256);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.isCompleted, courseId, moduleId, topicId]);

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

  // v1.5.0 (Guided Markdown Read Aloud): el Reader opera exclusivamente
  // sobre el Markdown ya renderizado dentro de este contenedor (nunca
  // sobre el resto de .content-panel__body -- puntos clave/recursos no
  // son Markdown del tópico). `aiAudioSessionActive` debe reflejar
  // únicamente sesiones de IA que realmente PUEDEN producir audio:
  // - generación en curso (`lessonLoading`, PARTE 6/41: el claim ya
  //   detiene al Reader al hacer click en "Generar clase con IA", pero
  //   sin este término el Reader podía re-habilitarse a mitad de la
  //   generación si `voiceEnabled` era false o si todavía no había
  //   escena);
  // - narración de escena real activa (misma condición que
  //   `useClassroomVoice.ts` usa para efectivamente hablar: `enabled &&
  //   scene`, ver su guard `if (!enabled || !scene) return` -- nunca
  //   solo `voiceEnabled && !engine.isCompleted`, que sigue siendo
  //   `true` aunque no exista ninguna escena/lección generada, p. ej.
  //   por una preferencia de voz encendida en una sesión anterior sin
  //   que exista lección en esta).
  // Bug real corregido (v1.5.0): sin `!!engine.currentScene`, "Leer
  // tema" quedaba deshabilitado con Markdown visible y ninguna
  // narración de IA sonando, solo por tener la voz activada como
  // preferencia persistida.
  const readAloudContainerRef = useRef<HTMLDivElement>(null);
  const readAloud = useReadAloud({
    containerRef: readAloudContainerRef,
    active: contentTab === "explicacion" && !!topic,
    topicKey: `${courseId ?? ""}:${moduleId ?? ""}:${topicId ?? ""}`,
    useNeural,
    voice: readAloudVoice,
    aiAudioSessionActive:
      lessonLoading || (voiceEnabled && !!engine.currentScene && !engine.isCompleted),
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
    // v1.5.0 (PARTE 5/38/39/40): cambio de tópico/curso (navegación
    // normal, "Ver tema relacionado" o browser Back) -- el Reader se
    // reinicia igual vía su propio efecto keyed en `topicKey`, pero se
    // notifica acá también por explicitud (mismo patrón que
    // cancelAllSpeech de la línea de arriba).
    claimAiAudioPriority();
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

  // v1.3.0 (Classroom UX, BLOQUE C): SCENE navigation (dentro de una
  // LessonPlan) y TOPIC navigation (entre tópicos del curso, cruzando
  // módulos) son ahora dos affordances SIEMPRE distintas -- nunca el mismo
  // botón cambiando de semántica. "Siguiente diapositiva" en la última
  // escena queda deshabilitado (nunca se transforma silenciosamente en
  // "Finalizar"); avanzar de tema es una acción explícita separada
  // (ver handleCompleteTopic / topic-nav más abajo).

  // Al llegar a la última escena y pulsar "Completar tema y continuar" se
  // dispara esta secuencia en dos pasos (nunca en el mismo tick que la
  // navegación, para evitar una condición de carrera real: si
  // engine.nextScene() y navigate() corrieran en el mismo render, el
  // efecto que marca el tópico como completado en learningProgressStore
  // -- ver más abajo, "markTopicCompleted" -- podría leer accidentalmente
  // el courseId/moduleId/topicId del PRÓXIMO tópico en vez del que
  // realmente se acaba de terminar). `pendingTopicAdvance` deja que el
  // ratchet de finalización existente (engine.isCompleted -> el useEffect
  // de markTopicCompleted, sin duplicar esa lógica acá) se complete en su
  // propio render, y solo DESPUÉS de confirmarlo navega al próximo tópico.
  const [pendingTopicAdvance, setPendingTopicAdvance] = useState(false);

  useEffect(() => {
    if (!pendingTopicAdvance || !engine.isCompleted) return;
    setPendingTopicAdvance(false);
    if (nextTopic) {
      goToTopic(nextTopic);
    }
    // Si no hay nextTopic (último tópico del curso), "Completar último
    // tema" no inventa un destino: se queda en la CompletionScreen actual
    // (recap + "Volver al curso").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTopicAdvance, engine.isCompleted]);

  function handleCompleteTopic() {
    cancelAllSpeech();
    engine.nextScene(); // única fuente de verdad para el ratchet de completado (Fase 4)
    setPendingTopicAdvance(true);
  }

  async function handleGenerateLesson(forceRegenerate: boolean) {
    if (!courseId || !moduleId || !topicId) return;
    // v1.1.0 (UX de doble submit): guard explícito además de ocultar/
    // deshabilitar el botón mientras carga — nunca confiar solo en el
    // re-render de React para evitar una segunda request por doble click.
    if (lessonLoading) return;
    // v1.5.0 (PARTE 6/41): la prioridad de IA arranca en el EVENTO de
    // generación, no cuando el audio realmente empieza -- el Reader debe
    // detenerse ANTES de que termine la generación, nunca después.
    claimAiAudioPriority();
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
    claimAiAudioPriority(); // v1.5.0: sale del aula -> el Reader también se detiene
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

  // v1.1.0, PARTE 13: si el tópico fue completado y el Markdown cambió
  // desde entonces (content_sha256 distinto), se muestra un aviso NO
  // bloqueante — nunca se desmarca "completed" automáticamente, eso
  // requeriría asumir que el cambio invalida el logro del alumno, lo cual
  // no siempre es cierto (puede ser una corrección menor).
  const contentUpdatedSinceCompletion = useMemo(() => {
    if (!courseId || !moduleId || !topicId || !topic) return false;
    const stored = getCourseLearningProgress(courseId)?.topics[`${moduleId}:${topicId}`];
    if (!stored || stored.status !== "completed" || !stored.contentSha256) return false;
    return stored.contentSha256 !== topic.canonical.content_sha256;
  }, [courseId, moduleId, topicId, topic]);

  // v1.1.1 — bug real preexistente corregido: este early-return vivía
  // ANTES del useMemo de arriba, violando las reglas de hooks de React
  // (un componente no puede llamar un número distinto de hooks entre
  // renders). Navegar de un tópico válido a uno inexistente (`error`
  // pasa a truthy) SIN desmontar ClassroomPage — ej. editando la URL a
  // mano, o un enlace a un tópico borrado del curso — disparaba "Rendered
  // fewer hooks than expected" y tiraba abajo la página entera al
  // ErrorBoundary. Nunca relacionado con la reorganización de layout de
  // este bloque; se corrige acá porque se encontró durante el QA real de
  // esta misma sección (PARTE 22).
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
        <button type="button" className="course-subheader__exit" onClick={handleExit}>
          Salir de la clase
        </button>
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
        {contentUpdatedSinceCompletion && (
          <div className="learning-content-updated-note" role="status">
            Este contenido fue actualizado desde tu última visita.
          </div>
        )}
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
                  {lessonLoading && (
                    <AiOperationStatus
                      initialMessage="Preparando clase…"
                      delayedMessage="Estamos generando la clase a partir del material de este tópico."
                    />
                  )}
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
                  <div className="slide-panel__lesson-title">
                    {isReviewMode && <span className="slide-panel__review-badge">Repaso</span>}
                    {lesson.lesson_title.text}
                  </div>
                  <SceneRenderer
                    scene={engine.currentScene}
                    canonical={topic?.canonical}
                    renderKey={engine.renderKey}
                    courseId={courseId ?? ""}
                    moduleId={moduleId ?? ""}
                    topicId={topicId ?? ""}
                    isPaused={engine.isPaused}
                  />
                  <div className="slide-panel__scene-indicator">
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

            {/* Toolbar de la escena: INMEDIATAMENTE debajo de la slide (nunca
                después de narración/checkpoint) — pertenece visualmente a la
                slide, nunca a "toda la página". Vive DENTRO de
                .classroom-stage, compartiendo su mismo ancho (columna
                izquierda). "Salir de la clase" NO vive acá (ver
                .course-subheader, arriba).

                v1.3.0 (BLOQUE C): esta toolbar es EXCLUSIVAMENTE navegación
                de ESCENA -- solo existe cuando hay una LessonPlan activa
                (sin IA no hay escenas artificiales que navegar). La
                navegación entre TÓPICOS del curso vive siempre en su propia
                sección separada (v1.3.0 BLOQUE 6: junto al panel de
                Markdown, .content-panel__topic-nav), nunca acá. */}
            {lesson && (
              <div className="scene-controls" role="group" aria-label="Controles de la escena">
                <div className="scene-controls__side scene-controls__side--prev">
                  <button
                    type="button"
                    className="scene-controls__prev"
                    onClick={() => engine.previousScene()}
                    disabled={engine.isFirstScene}
                    aria-label="Diapositiva anterior"
                  >
                    ← Anterior diapositiva
                  </button>
                </div>

                <div className="scene-controls__center">
                  <button
                    type="button"
                    className="scene-controls__pause"
                    onClick={() => (engine.isPaused ? engine.resume() : engine.pause())}
                    disabled={engine.isCompleted}
                    aria-label={engine.isPaused ? "Reanudar clase" : "Pausar clase"}
                  >
                    {engine.isPaused ? "▶ Reanudar" : "⏸ Pausar"}
                  </button>
                  <button
                    type="button"
                    className="scene-controls__repeat"
                    onClick={() => engine.repeatScene()}
                    disabled={engine.isCompleted}
                    aria-label="Repetir escena actual"
                  >
                    ↻ Repetir
                  </button>
                  <div className="scene-controls__voice">
                    <button
                      type="button"
                      className={
                        voiceEnabled ? "scene-controls__voice-toggle primary" : "scene-controls__voice-toggle"
                      }
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
                  <span className="scene-controls__indicator">
                    Escena {engine.currentSceneIndex + 1} de {engine.totalScenes}
                  </span>
                </div>

                <div className="scene-controls__side scene-controls__side--next">
                  <button
                    type="button"
                    className="scene-controls__next"
                    onClick={() => engine.nextScene()}
                    disabled={engine.isLastScene || engine.isCompleted}
                    aria-label="Siguiente diapositiva"
                  >
                    Siguiente diapositiva →
                  </button>
                </div>
              </div>
            )}

            {/* v1.3.0 (BLOQUE C): CTA explícito y separado para terminar el
                tema, nunca una relabelación silenciosa de "Siguiente
                diapositiva". Reutiliza el ratchet de finalización ya
                existente (handleCompleteTopic -> engine.nextScene()); ver
                el comentario extenso más arriba sobre por qué la
                navegación al próximo tópico se difiere un render. */}
            {lesson && engine.isLastScene && !engine.isCompleted && (
              <div className="topic-completion-cta">
                <span>Llegaste al final de este tema.</span>
                <button type="button" className="topic-completion-cta__button" onClick={handleCompleteTopic}>
                  {nextTopic ? "Completar tema y continuar →" : "Completar último tema"}
                </button>
              </div>
            )}

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
                onNavigateToTopic={(targetModuleId, targetTopicId) =>
                  goToTopic({ moduleId: targetModuleId, topicId: targetTopicId })
                }
              />
            )}

            {course && course.modules.length > 0 && (
              <div className="module-topic-nav">
                {flatTopics.map((t, index) => (
                  <Link
                    // Bug real encontrado en QA v1.1.0: `moduleId-topicId` NO
                    // es necesariamente único — un curso puede tener dos
                    // archivos de tópico que colisionan en el mismo slug
                    // (ver "duplicate_slug" en course_diagnostics.py, ya
                    // reportado como warning). Se agrega el índice como
                    // desempate para evitar una key de React duplicada;
                    // ambos siguen siendo navegables, el curso sigue
                    // funcionando — el diagnóstico de warning es lo que le
                    // indica al dueño del curso que hay que corregir esa
                    // colisión en el contenido.
                    key={`${t.moduleId}-${t.topicId}-${index}`}
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

            {/* v1.3.0 (BLOQUE 6): navegación de TÓPICO, SIEMPRE visible
                (con o sin LessonPlan) -- computada sobre el orden lineal
                real del curso (flatTopics), cruzando módulos sin
                problema. Nunca comparte botón con la navegación de
                escena. Reubicada junto al panel de Markdown (antes vivía
                debajo del Tutor) para asociarla visualmente al contenido
                que efectivamente cambia. Vive fuera de
                .content-panel__body (el único contenedor con scroll), por
                lo que permanece visible sin necesitar position: sticky. */}
            <div className="content-panel__topic-nav topic-nav" role="group" aria-label="Navegación entre tópicos">
              <button
                type="button"
                className="topic-nav__prev"
                onClick={() => goToTopic(prevTopic)}
                disabled={!prevTopic}
                aria-label="Tema anterior"
              >
                ← Tema anterior
              </button>
              {contentTab === "explicacion" && <ReadAloudControls reader={readAloud} />}
              <button
                type="button"
                className="topic-nav__next"
                onClick={() => goToTopic(nextTopic)}
                disabled={!nextTopic}
                aria-label="Tema siguiente"
              >
                Tema siguiente →
              </button>
            </div>

            <div className="content-panel__body">
              {!topic && !error && <p>Cargando contenido del tema…</p>}

              {topic && contentTab === "explicacion" && courseId && moduleId && topicId && (
                <div ref={readAloudContainerRef}>
                  <SafeMarkdown
                    markdown={topic.content_markdown}
                    courseId={courseId}
                    moduleId={moduleId}
                    topicId={topicId}
                  />
                </div>
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
            activeSceneType={engine.currentScene?.scene_type}
            activeVisualType={engine.currentScene?.visual.visual_type}
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
      </div>
    </>
  );
}
