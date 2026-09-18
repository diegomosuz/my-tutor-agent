import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { saveTopicProgress } from "../classroomStorage";
import { useClassroomEngine } from "../useClassroomEngine";
import { SAMPLE_LESSON } from "./fixtures";

const IDS = { courseId: "curso-demo", moduleId: "modulo-demo", topicId: "topico-demo" };

beforeEach(() => {
  window.localStorage.clear();
});

describe("useClassroomEngine", () => {
  it("1. inicia en scene 0", () => {
    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    expect(result.current.currentSceneIndex).toBe(0);
    expect(result.current.currentScene?.scene_id).toBe("SCENE-001");
  });

  it("2. next avanza a la siguiente escena", async () => {
    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    act(() => result.current.nextScene());
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(1));
    expect(result.current.currentScene?.scene_id).toBe("SCENE-002");
  });

  it("3. previous retrocede a la escena anterior", async () => {
    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    act(() => result.current.nextScene());
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(1));
    act(() => result.current.previousScene());
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(0));
  });

  it("4. previous no baja de la escena 0", async () => {
    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    act(() => result.current.previousScene());
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(0));
    expect(result.current.isFirstScene).toBe(true);
  });

  it("5. repeat mantiene la escena actual y reinicia narration", async () => {
    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    act(() => result.current.nextScene());
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(1));

    act(() => result.current.nextNarrationChunk());
    await waitFor(() => expect(result.current.currentNarrationIndex).toBe(1));

    const renderKeyBefore = result.current.renderKey;
    act(() => result.current.repeatScene());

    await waitFor(() => expect(result.current.currentNarrationIndex).toBe(0));
    expect(result.current.currentSceneIndex).toBe(1); // sigue en la misma escena
    expect(result.current.renderKey).toBeGreaterThan(renderKeyBefore);
  });

  it("6. llegar a la última escena y avanzar marca completed", async () => {
    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    act(() => result.current.nextScene()); // -> 1
    act(() => result.current.nextScene()); // -> 2 (última, índice 2 de 3)
    await waitFor(() => expect(result.current.isLastScene).toBe(true));
    expect(result.current.isCompleted).toBe(false);

    act(() => result.current.nextScene()); // "Siguiente" en la última = Finalizar
    await waitFor(() => expect(result.current.isCompleted).toBe(true));
    // No se sale del arreglo de escenas.
    expect(result.current.currentSceneIndex).toBe(2);
  });

  it("7. progressPercent avanza de forma correcta y determinística", async () => {
    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    expect(result.current.progressPercent).toBe(0);

    act(() => result.current.nextScene());
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(1));
    expect(result.current.progressPercent).toBe(50); // 1 de (3-1) escenas

    act(() => result.current.nextScene());
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(2));
    expect(result.current.progressPercent).toBe(100);
  });

  it("8. el progreso se restaura desde localStorage si el contentSha256 coincide", async () => {
    saveTopicProgress({
      ...IDS,
      contentSha256: SAMPLE_LESSON.content_sha256,
      currentSceneIndex: 2,
      completed: false,
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(2));
  });

  it("9. el progreso NO se restaura si el contentSha256 cambió", async () => {
    saveTopicProgress({
      ...IDS,
      contentSha256: "un-hash-viejo-distinto",
      currentSceneIndex: 2,
      completed: false,
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useClassroomEngine({ lesson: SAMPLE_LESSON, ...IDS }));
    // Le damos tiempo al efecto de restauración a correr; debe quedarse en 0.
    await waitFor(() => expect(result.current.currentSceneIndex).toBe(0));
  });
});
