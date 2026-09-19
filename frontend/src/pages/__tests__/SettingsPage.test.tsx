import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { getSystemStatus: vi.fn(), getCourses: vi.fn() },
}));

import { api } from "../../api/client";
import { SettingsPage } from "../SettingsPage";

const mockedGetStatus = api.getSystemStatus as unknown as ReturnType<typeof vi.fn>;
const mockedGetCourses = api.getCourses as unknown as ReturnType<typeof vi.fn>;

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
});
