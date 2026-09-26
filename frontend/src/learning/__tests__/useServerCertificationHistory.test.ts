import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    getCertificationHistory: vi.fn(),
    importLegacyCertificationHistory: vi.fn(),
  },
}));

import { api } from "../../api/client";
import { recordCertificationAttempt, resetCourseProgress } from "../learningProgressStore";
import type { CertificationAttemptSummary } from "../types";
import {
  fetchCourseCertificationHistory,
  useServerCertificationHistory,
} from "../useServerCertificationHistory";

const mockedGetCertificationHistory = api.getCertificationHistory as unknown as ReturnType<typeof vi.fn>;
const mockedImportLegacyCertificationHistory = api.importLegacyCertificationHistory as unknown as ReturnType<
  typeof vi.fn
>;

const COURSE = "curso-demo";

function attempt(overrides: Partial<CertificationAttemptSummary> = {}): CertificationAttemptSummary {
  return {
    attemptId: "attempt-1",
    courseId: COURSE,
    mode: "practice",
    moduleIds: ["modulo-1"],
    topicIds: ["topico-1"],
    questionCount: 2,
    answeredCount: 2,
    correctCount: 1,
    partialCount: 0,
    incorrectCount: 1,
    unansweredCount: 0,
    scorePercentage: 50,
    completedAt: "2026-01-01T00:00:00.000Z",
    performanceByTopic: [
      { module_id: "modulo-1", topic_id: "topico-1", attempted: 2, correct: 1, partially_correct: 0, incorrect: 1, unanswered: 0, practice_score_percent: 50 },
    ],
    competenciesToReinforce: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mockedGetCertificationHistory.mockReset();
  mockedImportLegacyCertificationHistory.mockReset();
});

describe("useServerCertificationHistory", () => {
  it("empieza en loading (attempts=null) y nunca lo interpreta como 0 intentos", () => {
    mockedGetCertificationHistory.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useServerCertificationHistory(COURSE));
    expect(result.current.attempts).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("carga exitosa sin historial: attempts pasa a [] (no null), loading=false", async () => {
    mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
    const { result } = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.attempts).toEqual([]);
    expect(result.current.error).toBe(false);
    expect(mockedImportLegacyCertificationHistory).not.toHaveBeenCalled();
  });

  it("carga exitosa con historial real refleja score/completedAt", async () => {
    mockedGetCertificationHistory.mockResolvedValue({
      course_id: COURSE,
      attempts: [
        {
          attempt_id: "attempt-1", course_id: COURSE, mode: "practice", module_ids: ["modulo-1"],
          topic_ids: ["topico-1"], question_count: 2, answered_count: 2, correct_count: 2, partial_count: 0,
          incorrect_count: 0, unanswered_count: 0, score_percentage: 100, completed_at: "2026-01-01T00:00:00.000Z",
          performance_by_topic: [], competencies_to_reinforce: [], topics_to_reinforce: [], origin: "server_evaluated",
        },
      ],
    });
    const { result } = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.attempts?.[0].scorePercentage).toBe(100);
    expect(result.current.attempts?.[0].attemptId).toBe("attempt-1");
  });

  it("primera carga con legacy local dispara el import una sola vez", async () => {
    recordCertificationAttempt(COURSE, attempt());
    mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
    mockedImportLegacyCertificationHistory.mockResolvedValue({
      course_id: COURSE,
      attempts: [
        {
          attempt_id: "attempt-1", course_id: COURSE, mode: "practice", module_ids: ["modulo-1"],
          topic_ids: ["topico-1"], question_count: 2, answered_count: 2, correct_count: 1, partial_count: 0,
          incorrect_count: 1, unanswered_count: 0, score_percentage: 50, completed_at: "2026-01-01T00:00:00.000Z",
          performance_by_topic: [], competencies_to_reinforce: [], topics_to_reinforce: [], origin: "legacy_import",
        },
      ],
    });

    const { result } = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedImportLegacyCertificationHistory).toHaveBeenCalledTimes(1);
    expect(result.current.attempts?.[0].attemptId).toBe("attempt-1");
  });

  it("sin legacy local, nunca llama a importLegacyCertificationHistory", async () => {
    mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
    const { result } = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedImportLegacyCertificationHistory).not.toHaveBeenCalled();
  });

  it("una entrada legacy con datos inconsistentes (fuera de rango) nunca se envía al backend", async () => {
    recordCertificationAttempt(COURSE, attempt({ attemptId: "bad-1", scorePercentage: 150 }));
    recordCertificationAttempt(COURSE, attempt({ attemptId: "good-1", scorePercentage: 80 }));
    mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
    mockedImportLegacyCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });

    const { result } = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const sentAttempts = mockedImportLegacyCertificationHistory.mock.calls[0][1].attempts;
    expect(sentAttempts).toHaveLength(1);
    expect(sentAttempts[0].practice_id).toBe("good-1");
  });

  it("ya migrado (remount del hook para el mismo curso) nunca reintenta el import", async () => {
    recordCertificationAttempt(COURSE, attempt());
    mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
    mockedImportLegacyCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });

    const first = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(mockedImportLegacyCertificationHistory).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(mockedImportLegacyCertificationHistory).toHaveBeenCalledTimes(1);
  });

  it("error de red nunca pisa el historial con un estado vacío -- attempts queda null, error=true", async () => {
    mockedGetCertificationHistory.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.attempts).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("refetch() vuelve a consultar el servidor", async () => {
    mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
    const { result } = renderHook(() => useServerCertificationHistory(COURSE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedGetCertificationHistory).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());
    await waitFor(() => expect(mockedGetCertificationHistory).toHaveBeenCalledTimes(2));
  });

  it("courseId null nunca dispara ninguna llamada de red", () => {
    const { result } = renderHook(() => useServerCertificationHistory(null));
    expect(result.current.attempts).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockedGetCertificationHistory).not.toHaveBeenCalled();
  });

  describe("fetchCourseCertificationHistory (bug real de QA: llamada puntual sin el hook)", () => {
    it("dispara el import legacy igual que el hook, aunque el hook nunca se haya montado para este curso", async () => {
      recordCertificationAttempt(COURSE, attempt());
      mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
      mockedImportLegacyCertificationHistory.mockResolvedValue({
        course_id: COURSE,
        attempts: [
          {
            attempt_id: "attempt-1", course_id: COURSE, mode: "practice", module_ids: ["modulo-1"],
            topic_ids: ["topico-1"], question_count: 2, answered_count: 2, correct_count: 1, partial_count: 0,
            incorrect_count: 1, unanswered_count: 0, score_percentage: 50, completed_at: "2026-01-01T00:00:00.000Z",
            performance_by_topic: [], competencies_to_reinforce: [], topics_to_reinforce: [], origin: "legacy_import",
          },
        ],
      });

      const list = await fetchCourseCertificationHistory(COURSE);

      expect(mockedImportLegacyCertificationHistory).toHaveBeenCalledTimes(1);
      expect(list[0].attemptId).toBe("attempt-1");
    });

    it("es idempotente con el hook: llamar la función puntual y luego montar el hook para el mismo curso nunca reimporta dos veces", async () => {
      recordCertificationAttempt(COURSE, attempt());
      mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
      mockedImportLegacyCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });

      await fetchCourseCertificationHistory(COURSE);
      expect(mockedImportLegacyCertificationHistory).toHaveBeenCalledTimes(1);

      const { result } = renderHook(() => useServerCertificationHistory(COURSE));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockedImportLegacyCertificationHistory).toHaveBeenCalledTimes(1);
    });
  });

  describe("REGRESIÓN (v1.7.0 Bloque 6, cierre de migración): reset + reload nunca resucita Certification history legacy", () => {
    it("mismo patrón ya probado para topic progress (useServerTopicProgress.test.ts) -- nunca había un test dedicado para Certification history", async () => {
      // (1) legacy attempt importado, (2) server history existe, (3) el
      // alumno resetea (SettingsPage.tsx: DELETE server + resetCourseProgress
      // local -- borra `certificationAttempts` Y el marcador
      // `certificationHistoryImportedAt` JUNTOS, atómicamente, al eliminar
      // el objeto de curso completo), (4) reload (nueva instancia del
      // hook). Esperado: el import legacy NUNCA se reintenta y el intento
      // reseteado NUNCA reaparece -- no porque el marcador siga en pie,
      // sino porque el propio reset ya destruyó el snapshot legacy que
      // hubiera alimentado un reimport.
      recordCertificationAttempt(COURSE, attempt());
      mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] });
      mockedImportLegacyCertificationHistory.mockResolvedValue({
        course_id: COURSE,
        attempts: [
          {
            attempt_id: "attempt-1", course_id: COURSE, mode: "practice", module_ids: ["modulo-1"],
            topic_ids: ["topico-1"], question_count: 2, answered_count: 2, correct_count: 1, partial_count: 0,
            incorrect_count: 1, unanswered_count: 0, score_percentage: 50, completed_at: "2026-01-01T00:00:00.000Z",
            performance_by_topic: [{ module_id: "modulo-1", topic_id: "topico-1", attempted: 2, correct: 1, partially_correct: 0, incorrect: 1, unanswered: 0, practice_score_percent: 50 }],
            competencies_to_reinforce: [], topics_to_reinforce: [], origin: "legacy_import",
          },
        ],
      });

      const first = renderHook(() => useServerCertificationHistory(COURSE));
      await waitFor(() => expect(first.result.current.loading).toBe(false));
      expect(mockedImportLegacyCertificationHistory).toHaveBeenCalledTimes(1);
      expect(first.result.current.attempts).toHaveLength(1);

      // Reset real (mismo flujo que SettingsPage.tsx: DELETE server-side ya
      // ejecutado -- acá se simula el lado cliente del reset).
      resetCourseProgress(COURSE);
      mockedGetCertificationHistory.mockResolvedValue({ course_id: COURSE, attempts: [] }); // server ya vacío tras el DELETE

      // Reload = nueva instancia del hook (F5 real remonta todo el árbol).
      const second = renderHook(() => useServerCertificationHistory(COURSE));
      await waitFor(() => expect(second.result.current.loading).toBe(false));

      expect(mockedImportLegacyCertificationHistory).toHaveBeenCalledTimes(1); // nunca un segundo import
      expect(second.result.current.attempts).toEqual([]); // nunca resucita
    });
  });
});
