import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    getSystemStatus: vi.fn(),
    getCourses: vi.fn(),
    // v1.7.0 Bloque 2: "Restablecer mi progreso" ahora consulta/borra
    // topic progress server-side además del historial local de
    // Certification -- ver docs/SERVER_SIDE_PROFILE_V1_7.md.
    getCourseProgress: vi.fn(),
    resetCourseProgressServer: vi.fn(),
  },
}));

import { api } from "../../api/client";
import { recordCertificationAttempt } from "../../learning/learningProgressStore";
import { SettingsPage } from "../SettingsPage";

const mockedGetStatus = api.getSystemStatus as unknown as ReturnType<typeof vi.fn>;
const mockedGetCourses = api.getCourses as unknown as ReturnType<typeof vi.fn>;
const mockedGetCourseProgress = api.getCourseProgress as unknown as ReturnType<typeof vi.fn>;
const mockedResetCourseProgressServer = api.resetCourseProgressServer as unknown as ReturnType<typeof vi.fn>;

const STATUS = {
  app_version: "0.7.0",
  backend: "ok",
  courses: { count: 4, diagnostics: "ok" },
  llm: {
    provider: "pwc",
    model: "openai.gpt-4o-2024-11-20",
    configured: true,
    prompt_version: "lesson-v2",
    certification_prompt_version: "certification-v1",
  },
  voice: { provider: "auto", neural_configured: false, tts_model: "gpt-4o-mini-tts" },
  cache_writable: true,
};

describe("SettingsPage", () => {
  beforeEach(() => {
    mockedGetCourses.mockResolvedValue([]);
    mockedGetCourseProgress.mockReset().mockResolvedValue({ course_id: "curso-demo", topics: [] });
    mockedResetCourseProgressServer.mockReset().mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  it("muestra cursos/IA/voz/sistema sin exponer secretos", async () => {
    mockedGetStatus.mockResolvedValue(STATUS);
    const { container } = render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
    expect(screen.getByText("pwc")).toBeInTheDocument();
    expect(screen.getByText("0.7.0")).toBeInTheDocument();
    // El nombre de la env var (ej. "OPENAI_API_KEY") SÍ puede aparecer como
    // hint de qué configurar; lo que nunca debe aparecer es un VALOR de
    // credencial (ej. "sk-..." o un header Authorization real).
    expect(container.textContent).not.toMatch(/sk-[a-zA-Z0-9]|Bearer\s/i);
  });

  it("nunca muestra el path completo del filesystem del host", async () => {
    mockedGetStatus.mockResolvedValue(STATUS);
    const { container } = render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("0.7.0")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/C:\\|\/home\/|\/content/);
  });

  it("indica claramente cuando la voz neural no está configurada", async () => {
    mockedGetStatus.mockResolvedValue(STATUS);
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText(/no — requiere OPENAI_API_KEY/)).toBeInTheDocument()
    );
  });

  it("muestra un error controlado si falla la carga", async () => {
    mockedGetStatus.mockRejectedValue(new Error("network"));
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText("No pudimos cargar el estado del sistema")).toBeInTheDocument()
    );
  });

  it("v1.1.0: ofrece restablecer progreso por curso, nunca de forma inmediata sin confirmar", async () => {
    mockedGetStatus.mockResolvedValue(STATUS);
    mockedGetCourses.mockResolvedValue([{ id: "curso-demo", title: "Curso Demo" }]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("Restablecer mi progreso")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Restablecer mi progreso"));
    // Sin progreso guardado para ese curso, ni siquiera se llega a pedir
    // confirmación — se informa directamente que no hay nada que borrar.
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/No hay progreso guardado/)).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it("v1.7.0 Bloque 2: con progreso server-side, confirma y borra topic progress + Certification local juntos", async () => {
    mockedGetStatus.mockResolvedValue(STATUS);
    mockedGetCourses.mockResolvedValue([{ id: "curso-demo", title: "Curso Demo" }]);
    mockedGetCourseProgress.mockResolvedValue({
      course_id: "curso-demo",
      topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("Restablecer mi progreso")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Restablecer mi progreso"));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    await waitFor(() => expect(mockedResetCourseProgressServer).toHaveBeenCalledWith("curso-demo"));
    await waitFor(() => expect(screen.getByText(/restablecido/)).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it("v1.7.0 Bloque 2: con progreso solo de Certification local (sin topic progress server-side) también ofrece confirmar", async () => {
    mockedGetStatus.mockResolvedValue(STATUS);
    mockedGetCourses.mockResolvedValue([{ id: "curso-demo", title: "Curso Demo" }]);
    recordCertificationAttempt("curso-demo", {
      attemptId: "att-1",
      courseId: "curso-demo",
      mode: "practice",
      moduleIds: ["modulo-1"],
      topicIds: ["topico-1"],
      questionCount: 5,
      answeredCount: 5,
      correctCount: 5,
      partialCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
      scorePercentage: 100,
      completedAt: "2026-01-01T00:00:00.000Z",
      performanceByTopic: [],
      competenciesToReinforce: [],
    }); // solo local (Certification), sin topic progress server-side
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("Restablecer mi progreso")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Restablecer mi progreso"));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });

  it("v1.7.0 Bloque 2: si el servidor falla, nunca borra el historial local de Certification (aborta por completo)", async () => {
    mockedGetStatus.mockResolvedValue(STATUS);
    mockedGetCourses.mockResolvedValue([{ id: "curso-demo", title: "Curso Demo" }]);
    mockedGetCourseProgress.mockResolvedValue({
      course_id: "curso-demo",
      topics: [{ module_id: "modulo-1", topic_id: "topico-1", status: "completed", started_at: null, completed_at: null }],
    });
    mockedResetCourseProgressServer.mockRejectedValue(new Error("network"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("Restablecer mi progreso")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Restablecer mi progreso"));
    await waitFor(() => expect(screen.getByText(/no se pudo restablecer/i)).toBeInTheDocument());
    confirmSpy.mockRestore();
  });
});
