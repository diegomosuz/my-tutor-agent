import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    getCourseProgress: vi.fn(),
    importLegacyProgress: vi.fn(),
  },
}));

import { api } from "../../api/client";
import { markTopicCompleted, markTopicStarted, resetCourseProgress } from "../learningProgressStore";
import { fetchCourseTopicProgress, useServerTopicProgress } from "../useServerTopicProgress";

const mockedGetCourseProgress = api.getCourseProgress as unknown as ReturnType<typeof vi.fn>;
const mockedImportLegacyProgress = api.importLegacyProgress as unknown as ReturnType<typeof vi.fn>;

const COURSE = "curso-demo";

beforeEach(() => {
  window.localStorage.clear();
  mockedGetCourseProgress.mockReset();
  mockedImportLegacyProgress.mockReset();
});

describe("useServerTopicProgress", () => {
  it("empieza en loading (topics=null) y nunca lo interpreta como 0 progreso", async () => {
    mockedGetCourseProgress.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useServerTopicProgress(COURSE));
    expect(result.current.topics).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("carga exitosa sin progreso: topics pasa a {} (no null), loading=false", async () => {
    mockedGetCourseProgress.mockResolvedValue({ course_id: COURSE, topics: [] });
    const { result } = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.topics).toEqual({});
    expect(result.current.error).toBe(false);
    expect(mockedImportLegacyProgress).not.toHaveBeenCalled();
  });

  it("carga exitosa con progreso real refleja status/timestamps", async () => {
    mockedGetCourseProgress.mockResolvedValue({
      course_id: COURSE,
      topics: [
        {
          module_id: "modulo-1",
          topic_id: "topico-1",
          status: "completed",
          started_at: "2026-01-01T00:00:00.000Z",
          completed_at: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    const { result } = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.topics?.["modulo-1:topico-1"].status).toBe("completed");
    expect(result.current.topics?.["modulo-1:topico-1"].completedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("primera carga con legacy local dispara el import una sola vez y usa el resultado fusionado", async () => {
    markTopicStarted(COURSE, "modulo-1", "topico-1");
    markTopicCompleted(COURSE, "modulo-1", "topico-2");
    mockedGetCourseProgress.mockResolvedValue({ course_id: COURSE, topics: [] });
    mockedImportLegacyProgress.mockResolvedValue({
      course_id: COURSE,
      topics: [
        { module_id: "modulo-1", topic_id: "topico-1", status: "in_progress", started_at: null, completed_at: null },
        { module_id: "modulo-1", topic_id: "topico-2", status: "completed", started_at: null, completed_at: null },
      ],
    });

    const { result } = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1);
    const [importedCourseId, importedBody] = mockedImportLegacyProgress.mock.calls[0];
    expect(importedCourseId).toBe(COURSE);
    expect(importedBody.topics).toHaveLength(2);
    expect(result.current.topics?.["modulo-1:topico-2"].status).toBe("completed");
  });

  it("sin legacy local, nunca llama a importLegacyProgress", async () => {
    mockedGetCourseProgress.mockResolvedValue({ course_id: COURSE, topics: [] });
    const { result } = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedImportLegacyProgress).not.toHaveBeenCalled();
  });

  it("ya migrado (remount del hook para el mismo curso) nunca reintenta el import", async () => {
    markTopicCompleted(COURSE, "modulo-1", "topico-1");
    mockedGetCourseProgress.mockResolvedValue({ course_id: COURSE, topics: [] });
    mockedImportLegacyProgress.mockResolvedValue({
      course_id: COURSE,
      topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
    });

    const first = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1);

    // Segunda instancia del hook (simula un remount de página, ej. volver a
    // "Mi aprendizaje"): el marcador cliente ya está seteado, nunca
    // reintenta el import.
    const second = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1);
  });

  it("error de red nunca pisa el progreso con un estado vacío -- topics queda null, error=true", async () => {
    mockedGetCourseProgress.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.topics).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("refetch() vuelve a consultar el servidor", async () => {
    mockedGetCourseProgress.mockResolvedValue({ course_id: COURSE, topics: [] });
    const { result } = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedGetCourseProgress).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());
    await waitFor(() => expect(mockedGetCourseProgress).toHaveBeenCalledTimes(2));
  });

  it("REGRESIÓN (auditoría pre-Bloque 3): reset + reload nunca resucita progreso legacy ya reseteado", async () => {
    // v1.7.0 Bloque 2, escenario auditado antes de empezar Bloque 3: (1)
    // legacy topic progress importado, (2) server progress existe, (3) el
    // alumno resetea (SettingsPage.tsx: DELETE server + resetCourseProgress
    // local -- que borra `topics` Y el marcador `serverProgressImportedAt`
    // JUNTOS, atómicamente, al eliminar el objeto de curso completo), (4)
    // reload (nueva instancia del hook). Esperado: el import legacy NUNCA
    // se reintenta y el progreso reseteado NUNCA reaparece -- no porque el
    // marcador siga en pie, sino porque el propio reset ya destruyó el
    // snapshot legacy que hubiera alimentado un reimport.
    markTopicCompleted(COURSE, "modulo-1", "topico-1");
    mockedGetCourseProgress.mockResolvedValue({ course_id: COURSE, topics: [] });
    mockedImportLegacyProgress.mockResolvedValue({
      course_id: COURSE,
      topics: [
        { module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null },
      ],
    });

    const first = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1);
    expect(first.result.current.topics?.["modulo-1:topico-1"].status).toBe("completed");

    // Reset real (mismo flujo que SettingsPage.tsx).
    resetCourseProgress(COURSE);
    mockedGetCourseProgress.mockResolvedValue({ course_id: COURSE, topics: [] }); // server ya vacío tras el DELETE

    // Reload = nueva instancia del hook (F5 real remonta todo el árbol).
    const second = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1); // nunca un segundo import
    expect(second.result.current.topics).toEqual({}); // nunca resucita
  });

  it("REGRESIÓN (v1.7.0 Bloque 6): mutar el documento legacy DESPUÉS de la migración nunca se refleja -- el marcador ya seteado salta el import por completo, sin importar qué contenga el snapshot legacy en ese momento", async () => {
    markTopicCompleted(COURSE, "modulo-1", "topico-1");
    mockedGetCourseProgress.mockResolvedValue({
      course_id: COURSE,
      topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
    });
    mockedImportLegacyProgress.mockResolvedValue({
      course_id: COURSE,
      topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
    });

    const first = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1);

    // Manipulación DIRECTA del documento legacy (nunca vía la app real --
    // simula una pestaña vieja o una edición manual) DESPUÉS de que la
    // migración ya se consideró terminada: agrega un tópico "dominado"
    // legacy que el servidor JAMÁS vio.
    markTopicCompleted(COURSE, "modulo-2", "topico-fantasma-legacy");

    // El servidor sigue devolviendo solo lo que realmente persiste --
    // nunca ve la mutación legacy de arriba.
    mockedGetCourseProgress.mockResolvedValue({
      course_id: COURSE,
      topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
    });

    const second = renderHook(() => useServerTopicProgress(COURSE));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1); // nunca un segundo import
    expect(second.result.current.topics?.["modulo-2:topico-fantasma-legacy"]).toBeUndefined();
    expect(Object.keys(second.result.current.topics ?? {})).toEqual(["modulo-1:topico-1"]);
  });

  it("courseId null nunca dispara ninguna llamada de red", () => {
    const { result } = renderHook(() => useServerTopicProgress(null));
    expect(result.current.topics).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockedGetCourseProgress).not.toHaveBeenCalled();
  });

  describe("fetchCourseTopicProgress (bug real de QA: llamada puntual sin el hook)", () => {
    it("dispara el import legacy igual que el hook, aunque el hook nunca se haya montado para este curso", async () => {
      markTopicCompleted(COURSE, "modulo-1", "topico-1");
      mockedGetCourseProgress.mockResolvedValue({ course_id: COURSE, topics: [] });
      mockedImportLegacyProgress.mockResolvedValue({
        course_id: COURSE,
        topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
      });

      const record = await fetchCourseTopicProgress(COURSE);

      expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1);
      expect(record["modulo-1:topico-1"].status).toBe("completed");
    });

    it("es idempotente con el hook: llamar la función puntual y luego montar el hook para el mismo curso nunca reimporta dos veces", async () => {
      markTopicCompleted(COURSE, "modulo-1", "topico-1");
      mockedGetCourseProgress.mockResolvedValue({
        course_id: COURSE,
        topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
      });
      mockedImportLegacyProgress.mockResolvedValue({
        course_id: COURSE,
        topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
      });

      await fetchCourseTopicProgress(COURSE);
      expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1);

      const { result } = renderHook(() => useServerTopicProgress(COURSE));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockedImportLegacyProgress).toHaveBeenCalledTimes(1); // sigue en 1, nunca 2
    });
  });
});
