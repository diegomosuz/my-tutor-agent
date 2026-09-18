// Classroom Engine (Fase 4): capa simple y reusable que administra la
// navegación determinística entre escenas de una LessonPlan, el estado de
// reproducción (play/pause/completed) y el progreso local por tópico.
//
// Deliberadamente NO es una state machine library (XState, etc.): un
// puñado de useState + useEffect alcanza para este caso de uso y es más
// simple de leer, testear y mantener.
import { useEffect, useMemo, useState } from "react";
import type { LessonPlan, LessonScene } from "../types/api";
import {
  clearTopicProgress,
  loadTopicProgress,
  saveTopicProgress,
} from "./classroomStorage";

export interface ClassroomEngineParams {
  lesson: LessonPlan | null;
  courseId: string | undefined;
  moduleId: string | undefined;
  topicId: string | undefined;
}

export interface ClassroomEngine {
  // Estado
  currentSceneIndex: number;
  currentScene: LessonScene | null;
  totalScenes: number;
  currentNarrationIndex: number;
  currentNarrationChunk: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  progressPercent: number;
  /** Cambia cada vez que se debe reiniciar una animación/transición (nueva
   * escena, "Repetir"). Los componentes visuales lo usan como `key` de
   * React o como dependencia de efecto. */
  renderKey: number;
  isFirstScene: boolean;
  isLastScene: boolean;

  // Acciones
  nextScene: () => void;
  previousScene: () => void;
  pause: () => void;
  resume: () => void;
  repeatScene: () => void;
  goToScene: (index: number) => void;
  resetLesson: () => void;
  nextNarrationChunk: () => void;
}

/** progressPercent determinístico: 0% en la primera escena, 100% al llegar
 * a la última (o al completar el tópico). Con una sola escena, el avance
 * real solo puede expresarse vía `isCompleted`. */
function computeProgress(sceneIndex: number, total: number, completed: boolean): number {
  if (total <= 0) return 0;
  if (completed) return 100;
  if (total === 1) return 0;
  return Math.round((sceneIndex / (total - 1)) * 100);
}

export function useClassroomEngine({
  lesson,
  courseId,
  moduleId,
  topicId,
}: ClassroomEngineParams): ClassroomEngine {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [narrationIndex, setNarrationIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  // Cada vez que cambia la identidad de la lección (lesson_id ya codifica
  // content_sha256 + provider + model + prompt_version, ver backend Fase
  // 3), reiniciamos el motor y restauramos progreso guardado SOLO si
  // corresponde al mismo contentSha256. Un cambio de contenido real nunca
  // aplica progreso viejo automáticamente.
  useEffect(() => {
    if (!lesson) {
      setSceneIndex(0);
      setIsCompleted(false);
      setNarrationIndex(0);
      setIsPaused(false);
      return;
    }
    const saved =
      courseId && moduleId && topicId ? loadTopicProgress(courseId, moduleId, topicId) : null;
    const canRestore = saved != null && saved.contentSha256 === lesson.content_sha256;
    const restoredIndex = canRestore
      ? Math.min(Math.max(saved!.currentSceneIndex, 0), lesson.scenes.length - 1)
      : 0;
    setSceneIndex(restoredIndex);
    setIsCompleted(canRestore ? saved!.completed : false);
    setNarrationIndex(0);
    setIsPaused(false);
    setRenderKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.lesson_id]);

  // Persistir progreso en cada cambio de escena/finalización.
  useEffect(() => {
    if (!lesson || !courseId || !moduleId || !topicId) return;
    saveTopicProgress({
      courseId,
      moduleId,
      topicId,
      contentSha256: lesson.content_sha256,
      currentSceneIndex: sceneIndex,
      completed: isCompleted,
      updatedAt: new Date().toISOString(),
    });
  }, [lesson, courseId, moduleId, topicId, sceneIndex, isCompleted]);

  const totalScenes = lesson?.scenes.length ?? 0;
  const currentScene: LessonScene | null = lesson?.scenes[sceneIndex] ?? null;
  const narrationChunks = currentScene?.narration ?? [];
  const currentNarrationChunk = narrationChunks[narrationIndex]?.text ?? null;

  function nextScene() {
    if (!lesson || totalScenes === 0) return;
    if (sceneIndex >= totalScenes - 1) {
      // Última escena: "Siguiente" se convierte en "Finalizar".
      setIsCompleted(true);
      return;
    }
    setSceneIndex((i) => i + 1);
    setNarrationIndex(0);
    setRenderKey((k) => k + 1);
  }

  function previousScene() {
    setIsCompleted(false);
    setSceneIndex((i) => Math.max(0, i - 1));
    setNarrationIndex(0);
    setRenderKey((k) => k + 1);
  }

  function pause() {
    setIsPaused(true);
  }

  function resume() {
    setIsPaused(false);
  }

  function repeatScene() {
    // Permanece en la misma escena: solo reinicia narración y renderKey
    // (esto es lo que dispara el reinicio de animaciones/TTS).
    setNarrationIndex(0);
    setRenderKey((k) => k + 1);
  }

  function goToScene(index: number) {
    if (!lesson || totalScenes === 0) return;
    const clamped = Math.max(0, Math.min(index, totalScenes - 1));
    setIsCompleted(false);
    setSceneIndex(clamped);
    setNarrationIndex(0);
    setRenderKey((k) => k + 1);
  }

  function resetLesson() {
    setSceneIndex(0);
    setNarrationIndex(0);
    setIsCompleted(false);
    setIsPaused(false);
    setRenderKey((k) => k + 1);
    if (courseId && moduleId && topicId) {
      clearTopicProgress(courseId, moduleId, topicId);
    }
  }

  function nextNarrationChunk() {
    setNarrationIndex((i) => Math.min(i + 1, Math.max(narrationChunks.length - 1, 0)));
  }

  const progressPercent = useMemo(
    () => computeProgress(sceneIndex, totalScenes, isCompleted),
    [sceneIndex, totalScenes, isCompleted]
  );

  return {
    currentSceneIndex: sceneIndex,
    currentScene,
    totalScenes,
    currentNarrationIndex: narrationIndex,
    currentNarrationChunk,
    isPlaying: !isPaused && !isCompleted && lesson !== null,
    isPaused,
    isCompleted,
    progressPercent,
    renderKey,
    isFirstScene: sceneIndex === 0,
    isLastScene: totalScenes > 0 && sceneIndex === totalScenes - 1,
    nextScene,
    previousScene,
    pause,
    resume,
    repeatScene,
    goToScene,
    resetLesson,
    nextNarrationChunk,
  };
}
