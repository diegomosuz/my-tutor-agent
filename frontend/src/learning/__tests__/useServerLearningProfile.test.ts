import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// v1.7.0 Bloque 5: `fetchCourseLearningProfile`/`useServerLearningProfile`
// reutilizan EXACTAMENTE `fetchCourseTopicProgress`/
// `fetchCourseCertificationHistory` (Bloques 2/3) para el bootstrap legacy
// -- este archivo NO reproduce cada escenario de import legacy ya cubierto
// por `useServerTopicProgress.test.ts`/`useServerCertificationHistory.test.ts`
// (eso sería duplicar responsabilidad de test); prueba en cambio que la
// SECUENCIA (bootstrap completo ANTES del GET del perfil, PASO 14-17) y la
// adaptación de shape (PASO 10) son correctas.
vi.mock("../../api/client", () => ({
  api: {
    getCourseProgress: vi.fn(),
    importLegacyProgress: vi.fn(),
    getCertificationHistory: vi.fn(),
    importLegacyCertificationHistory: vi.fn(),
    getLearningProfile: vi.fn(),
  },
}));

import { api } from "../../api/client";
import { fetchCourseLearningProfile, useServerLearningProfile } from "../useServerLearningProfile";

const mockedGetCourseProgress = api.getCourseProgress as unknown as ReturnType<typeof vi.fn>;
const mockedImportLegacyProgress = api.importLegacyProgress as unknown as ReturnType<typeof vi.fn>;
const mockedGetCertificationHistory = api.getCertificationHistory as unknown as ReturnType<typeof vi.fn>;
const mockedImportLegacyCertificationHistory = api.importLegacyCertificationHistory as unknown as ReturnType<
  typeof vi.fn
>;
const mockedGetLearningProfile = api.getLearningProfile as unknown as ReturnType<typeof vi.fn>;

const COURSE = "curso-demo";

const EMPTY_PROGRESS = { course_id: COURSE, topics: [] };
const EMPTY_HISTORY = { course_id: COURSE, attempts: [] };

function profileResponse(courseId = COURSE) {
  return {
    course_id: courseId,
    summary: { total_topics: 2, not_started: 0, progressing: 1, needs_review: 1, mastered: 0 },
    topics: [
      {
        module_id: "modulo-1",
        topic_id: "topico-1",
        module_title: "Módulo 1",
        topic_title: "Tópico 1",
        curricular_status: "completed" as const,
        learning_status: "progressing" as const,
        reason_code: "COMPLETED_NO_ASSESSMENT" as const,
        recent_average: null,
        observation_count: 0,
      },
      {
        module_id: "modulo-1",
        topic_id: "topico-2",
        module_title: "Módulo 1",
        topic_title: "Tópico 2",
        curricular_status: "not_started" as const,
        learning_status: "needs_review" as const,
        reason_code: "LOW_CERTIFICATION_SCORE" as const,
        recent_average: 30,
        observation_count: 1,
      },
    ],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mockedGetCourseProgress.mockReset();
  mockedImportLegacyProgress.mockReset();
  mockedGetCertificationHistory.mockReset();
  mockedImportLegacyCertificationHistory.mockReset();
  mockedGetLearningProfile.mockReset();
  mockedGetCourseProgress.mockResolvedValue(EMPTY_PROGRESS);
  mockedGetCertificationHistory.mockResolvedValue(EMPTY_HISTORY);
});

describe("fetchCourseLearningProfile", () => {
  it("adapta la respuesta del backend a LearningState[]/LearningStateSummary sin reclasificar nada", async () => {
    mockedGetLearningProfile.mockResolvedValue(profileResponse());
    const profile = await fetchCourseLearningProfile(COURSE);

    expect(profile.summary).toEqual({
      courseId: COURSE,
      totalTopics: 2,
      notStarted: 0,
      progressing: 1,
      needsReview: 1,
      mastered: 0,
      masteredPercentage: 0,
    });
    expect(profile.states).toEqual([
      {
        courseId: COURSE,
        moduleId: "modulo-1",
        topicId: "topico-1",
        status: "progressing",
        reasonCode: "COMPLETED_NO_ASSESSMENT",
        evidence: {
          moduleId: "modulo-1",
          topicId: "topico-1",
          status: "completed",
          observations: 0,
          latestScore: null,
          recentAverage: null,
          reinforcementLevel: null,
          lastObservedAt: null,
        },
      },
      {
        courseId: COURSE,
        moduleId: "modulo-1",
        topicId: "topico-2",
        status: "needs_review",
        reasonCode: "LOW_CERTIFICATION_SCORE",
        evidence: {
          moduleId: "modulo-1",
          topicId: "topico-2",
          status: "not_started",
          observations: 1,
          latestScore: null,
          recentAverage: 30,
          reinforcementLevel: null,
          lastObservedAt: null,
        },
      },
    ]);
  });

  it("bootstrap: ambos fetchers (topic progress + Certification history) se llaman ANTES del GET del perfil", async () => {
    const callOrder: string[] = [];
    mockedGetCourseProgress.mockImplementation(async () => {
      callOrder.push("progress");
      return EMPTY_PROGRESS;
    });
    mockedGetCertificationHistory.mockImplementation(async () => {
      callOrder.push("history");
      return EMPTY_HISTORY;
    });
    mockedGetLearningProfile.mockImplementation(async () => {
      callOrder.push("profile");
      return profileResponse();
    });

    await fetchCourseLearningProfile(COURSE);

    expect(callOrder).toContain("progress");
    expect(callOrder).toContain("history");
    expect(callOrder.indexOf("profile")).toBe(2); // siempre el último -- después de ambos bootstraps
  });

  it("bootstrap: si el import/get de topic progress falla, el perfil NUNCA se pide (PASO 17)", async () => {
    mockedGetCourseProgress.mockRejectedValue(new Error("network"));
    await expect(fetchCourseLearningProfile(COURSE)).rejects.toThrow();
    expect(mockedGetLearningProfile).not.toHaveBeenCalled();
  });

  it("bootstrap: si el import/get de Certification history falla, el perfil NUNCA se pide (PASO 17)", async () => {
    mockedGetCertificationHistory.mockRejectedValue(new Error("network"));
    await expect(fetchCourseLearningProfile(COURSE)).rejects.toThrow();
    expect(mockedGetLearningProfile).not.toHaveBeenCalled();
  });

  it("servidor ya poblado (sin legacy local): igual ejecuta el bootstrap (get-only, sin reimportar) y resuelve el perfil normal", async () => {
    mockedGetCourseProgress.mockResolvedValue({
      course_id: COURSE,
      topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
    });
    mockedGetLearningProfile.mockResolvedValue(profileResponse());

    const profile = await fetchCourseLearningProfile(COURSE);

    expect(mockedImportLegacyProgress).not.toHaveBeenCalled();
    expect(profile.states).toHaveLength(2);
  });

  it("perfil de un curso sin ningún tópico: summary en 0, states vacío (nunca un placeholder)", async () => {
    mockedGetLearningProfile.mockResolvedValue({
      course_id: COURSE,
      summary: { total_topics: 0, not_started: 0, progressing: 0, needs_review: 0, mastered: 0 },
      topics: [],
    });
    const profile = await fetchCourseLearningProfile(COURSE);
    expect(profile.states).toEqual([]);
    expect(profile.summary.totalTopics).toBe(0);
    expect(profile.summary.masteredPercentage).toBe(0);
  });
});

describe("useServerLearningProfile", () => {
  it("empieza en loading (profile=null) y nunca lo interpreta como perfil vacío", () => {
    mockedGetLearningProfile.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useServerLearningProfile(COURSE));
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it("carga exitosa: profile refleja el summary/states adaptados", async () => {
    mockedGetLearningProfile.mockResolvedValue(profileResponse());
    const { result } = renderHook(() => useServerLearningProfile(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.summary.needsReview).toBe(1);
    expect(result.current.profile?.states).toHaveLength(2);
    expect(result.current.error).toBe(false);
  });

  it("404 (curso inexistente) nunca se convierte en perfil vacío -- error=true, profile permanece null", async () => {
    class FakeApiError extends Error {
      status = 404;
    }
    mockedGetLearningProfile.mockRejectedValue(new FakeApiError("not found"));
    const { result } = renderHook(() => useServerLearningProfile(COURSE));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("503 (Postgres caído) nunca se convierte en perfil 'todo not_started' -- error=true, profile permanece null", async () => {
    class FakeApiError extends Error {
      status = 503;
    }
    mockedGetLearningProfile.mockRejectedValue(new FakeApiError("db down"));
    const { result } = renderHook(() => useServerLearningProfile(COURSE));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.profile).toBeNull();
  });

  it("error de red nunca pisa un perfil ya cargado con un estado vacío", async () => {
    mockedGetLearningProfile.mockResolvedValueOnce(profileResponse());
    const { result, rerender } = renderHook(({ id }) => useServerLearningProfile(id), {
      initialProps: { id: COURSE as string | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const loaded = result.current.profile;
    expect(loaded).not.toBeNull();

    mockedGetLearningProfile.mockRejectedValue(new Error("network"));
    act(() => result.current.refetch());
    rerender({ id: COURSE });
    await waitFor(() => expect(result.current.error).toBe(true));
    // El último perfil bueno se preserva -- nunca se reemplaza por vacío.
    expect(result.current.profile).toEqual(loaded);
  });

  it("courseId null nunca dispara ninguna llamada de red", () => {
    const { result } = renderHook(() => useServerLearningProfile(null));
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockedGetLearningProfile).not.toHaveBeenCalled();
  });

  it("cambio de curso mientras una request anterior está en vuelo: el resultado del curso viejo nunca sobrescribe el nuevo", async () => {
    let resolveA: (value: unknown) => void = () => {};
    const pendingA = new Promise((resolve) => {
      resolveA = resolve;
    });
    mockedGetLearningProfile.mockImplementation((courseId: string) =>
      courseId === "curso-a" ? pendingA : Promise.resolve(profileResponse("curso-b"))
    );

    const { result, rerender } = renderHook(({ id }) => useServerLearningProfile(id), {
      initialProps: { id: "curso-a" },
    });
    // Cambia de curso ANTES de que la request de curso-a resuelva.
    rerender({ id: "curso-b" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.courseId).toBe("curso-b");

    // La respuesta tardía de curso-a llega DESPUÉS -- nunca debe pisar
    // el estado ya asentado de curso-b.
    resolveA(profileResponse("curso-a"));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.profile?.courseId).toBe("curso-b");
  });

  it("refetch() vuelve a consultar el servidor", async () => {
    mockedGetLearningProfile.mockResolvedValue(profileResponse());
    const { result } = renderHook(() => useServerLearningProfile(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedGetLearningProfile).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());
    await waitFor(() => expect(mockedGetLearningProfile).toHaveBeenCalledTimes(2));
  });

  it("bootstrap repetido: remontar el hook para el mismo curso refetchea el perfil (no rompe, no reimporta legacy)", async () => {
    mockedGetLearningProfile.mockResolvedValue(profileResponse());
    const first = renderHook(() => useServerLearningProfile(COURSE));
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    const second = renderHook(() => useServerLearningProfile(COURSE));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(mockedImportLegacyProgress).not.toHaveBeenCalled();
    expect(mockedImportLegacyCertificationHistory).not.toHaveBeenCalled();
    expect(second.result.current.profile?.states).toHaveLength(2);
  });

  it("unmount antes de que la request resuelva nunca actualiza estado (sin warning de setState post-unmount)", async () => {
    let resolveProfile: (value: unknown) => void = () => {};
    mockedGetLearningProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        })
    );
    const { result, unmount } = renderHook(() => useServerLearningProfile(COURSE));
    expect(result.current.loading).toBe(true);
    unmount();
    resolveProfile(profileResponse());
    await new Promise((r) => setTimeout(r, 0));
    // Nada que assertar sobre `result.current` (el hook ya está desmontado) --
    // lo que importa es que esto no lance ni produzca un warning de React.
  });
});
