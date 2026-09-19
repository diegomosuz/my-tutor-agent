import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { getCourse: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const mockPrepare = vi.fn();
let mockExamReturn: {
  session: unknown;
  loading: boolean;
  error: { title: string; detail: string } | null;
  prepare: typeof mockPrepare;
};

vi.mock("../../certification/useCertificationExam", () => ({
  useCertificationExam: vi.fn(() => mockExamReturn),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from "../../api/client";
import { CertificationSetupPage } from "../CertificationSetupPage";

const mockedGetCourse = api.getCourse as unknown as ReturnType<typeof vi.fn>;

const COURSE = {
  id: "curso-demo",
  title: "Demo Curso IA",
  description: "",
  order: 1,
  modules: [
    {
      id: "modulo-a",
      title: "Módulo A",
      order: 1,
      topics: [
        { id: "topico-a1", title: "Tópico A1", order: 1 },
        { id: "topico-a2", title: "Tópico A2", order: 2 },
      ],
    },
    { id: "modulo-b", title: "Módulo B", order: 2, topics: [{ id: "topico-b1", title: "Tópico B1", order: 1 }] },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/certificacion/curso-demo"]}>
      <Routes>
        <Route path="/certificacion/:courseId" element={<CertificationSetupPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPageAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/certificacion/:courseId" element={<CertificationSetupPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockedGetCourse.mockReset();
  mockPrepare.mockReset();
  mockNavigate.mockReset();
  mockExamReturn = { session: null, loading: false, error: null, prepare: mockPrepare };
});

describe("CertificationSetupPage", () => {
  it("muestra el nombre del curso y el disclaimer no oficial", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    expect(
      screen.getByText(/no representan preguntas oficiales de una certificación/i)
    ).toBeInTheDocument();
  });

  it("selección de alcance: al elegir 'Módulos específicos' aparece la lista de módulos", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Módulos específicos"));
    expect(screen.getByLabelText("Módulo A")).toBeInTheDocument();
    expect(screen.getByLabelText("Módulo B")).toBeInTheDocument();
  });

  it("selección de modo: practice vs simulation", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());

    const simulationRadio = screen.getByLabelText(/Simulacro/i) as HTMLInputElement;
    fireEvent.click(simulationRadio);
    expect(simulationRadio.checked).toBe(true);
  });

  it("'Preparar práctica' llama a prepare() con el scope de curso completo por defecto", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    mockPrepare.mockResolvedValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Preparar práctica" }));

    await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(1));
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "practice",
        scope: { module_ids: [], topic_ids: [] },
        question_count: 10,
      })
    );
  });

  it("navega a /practica tras preparar exitosamente en modo practice", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    mockPrepare.mockResolvedValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Preparar práctica" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo/practica"));
  });

  it("navega a /simulacro tras preparar exitosamente en modo simulation", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    mockPrepare.mockResolvedValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Simulacro/i));
    fireEvent.click(screen.getByRole("button", { name: "Preparar práctica" }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo/simulacro")
    );
  });

  it("no navega si prepare() falla", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    mockPrepare.mockResolvedValue(false);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Preparar práctica" }));
    await waitFor(() => expect(mockPrepare).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("muestra el estado de carga mientras prepara", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    mockExamReturn = { session: null, loading: true, error: null, prepare: mockPrepare };
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Preparando preguntas…" })).toBeDisabled();
  });

  it("v1.1.0: mientras prepara muestra el mensaje inicial de espera, nunca un porcentaje inventado", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    mockExamReturn = { session: null, loading: true, error: null, prepare: mockPrepare };
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Preparando práctica…");
    expect(status.textContent).not.toMatch(/%/);
  });

  it("v1.1.0: el mensaje de espera no aparece cuando no está cargando", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("muestra un error controlado sin romper la página", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    mockExamReturn = {
      session: null,
      loading: false,
      error: { title: "IA no configurada", detail: "Falta credencial." },
      prepare: mockPrepare,
    };
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    expect(screen.getByText("IA no configurada")).toBeInTheDocument();
    expect(screen.getByText("Falta credencial.")).toBeInTheDocument();
  });

  it("el botón Preparar práctica está deshabilitado si el scope 'Módulos específicos' no tiene selección", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Módulos específicos"));
    expect(screen.getByRole("button", { name: "Preparar práctica" })).toBeDisabled();
  });

  it("no llama al backend de preparación al simplemente abrir la pantalla", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // v1.1.0 — preselección desde una recomendación de "Mi aprendizaje"
  // (PARTE 11/26): ?mode=&topics=, validado contra el curso real.
  // -------------------------------------------------------------------

  it("preselecciona tópicos y modo válidos desde query params", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPageAt("/certificacion/curso-demo?mode=practice&topics=topico-a1,topico-b1");
    await waitFor(() => expect(screen.getByLabelText("Tópico A1")).toBeInTheDocument());
    expect((screen.getByLabelText("Tópico A1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Tópico B1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Tópico A2") as HTMLInputElement).checked).toBe(false);
  });

  it("preselecciona mode=simulation desde query params", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPageAt("/certificacion/curso-demo?mode=simulation&topics=topico-a1");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    expect((screen.getByLabelText(/Simulacro/i) as HTMLInputElement).checked).toBe(true);
  });

  it("ignora IDs de tópico inválidos/inexistentes sin romper la pantalla", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPageAt("/certificacion/curso-demo?mode=practice&topics=topico-fantasma,topico-a1,otro-curso-topic");
    await waitFor(() => expect(screen.getByLabelText("Tópico A1")).toBeInTheDocument());
    expect((screen.getByLabelText("Tópico A1") as HTMLInputElement).checked).toBe(true);
    // Ningún checkbox real corresponde a los ids inventados: la pantalla
    // simplemente los ignora, nunca crashea ni los agrega a la selección.
    expect(screen.queryByText("topico-fantasma")).not.toBeInTheDocument();
  });

  it("un mode inválido en query params se ignora, mantiene el default 'practice'", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPageAt("/certificacion/curso-demo?mode=algo-invalido");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    expect((screen.getByLabelText(/Práctica guiada/i) as HTMLInputElement).checked).toBe(true);
  });

  it("sin query params, el comportamiento por defecto no cambia (curso completo)", async () => {
    mockedGetCourse.mockResolvedValue(COURSE);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demo Curso IA" })).toBeInTheDocument());
    expect((screen.getByLabelText("Curso completo") as HTMLInputElement).checked).toBe(true);
  });
});
