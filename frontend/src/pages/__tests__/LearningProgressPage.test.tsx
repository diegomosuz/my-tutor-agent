import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { getCourses: vi.fn(), getCourse: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from "../../api/client";
import { LearningProgressPage } from "../LearningProgressPage";
import {
  markTopicCompleted,
  markTopicStarted,
  recordCertificationAttempt,
} from "../../learning/learningProgressStore";
import { loadGuidedReviewVerificationContext } from "../../learning/guidedReviewVerification";
import type { CertificationAttemptSummary } from "../../learning/types";

const mockedGetCourses = api.getCourses as unknown as ReturnType<typeof vi.fn>;
const mockedGetCourse = api.getCourse as unknown as ReturnType<typeof vi.fn>;

const COURSE_SUMMARY = {
  id: "curso-demo",
  title: "Curso Demo",
  description: "",
  order: 1,
  module_count: 1,
  topic_count: 2,
};

const COURSE_DETAIL = {
  id: "curso-demo",
  title: "Curso Demo",
  description: "",
  order: 1,
  modules: [
    {
      id: "modulo-1",
      title: "Módulo 1",
      order: 1,
      topics: [
        { id: "topico-1", title: "Tópico 1", order: 1 },
        { id: "topico-2", title: "Tópico 2", order: 2 },
      ],
    },
  ],
};

function renderPage(initialEntries?: Array<string | { pathname: string; state?: unknown }>) {
  return render(
    <MemoryRouter initialEntries={initialEntries ?? ["/mi-aprendizaje"]}>
      <LearningProgressPage />
    </MemoryRouter>
  );
}

function attempt(overrides: Partial<CertificationAttemptSummary> = {}): CertificationAttemptSummary {
  return {
    attemptId: "attempt-1",
    courseId: "curso-demo",
    mode: "practice",
    moduleIds: ["modulo-1"],
    topicIds: ["topico-1"],
    questionCount: 5,
    answeredCount: 5,
    correctCount: 1,
    partialCount: 0,
    incorrectCount: 4,
    unansweredCount: 0,
    scorePercentage: 20,
    completedAt: "2026-01-01T00:00:00.000Z",
    performanceByTopic: [
      { module_id: "modulo-1", topic_id: "topico-1", attempted: 5, correct: 1, partially_correct: 0, incorrect: 4, unanswered: 0, practice_score_percent: 20 },
    ],
    competenciesToReinforce: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockedGetCourses.mockReset();
  mockedGetCourse.mockReset();
  mockNavigate.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("LearningProgressPage", () => {
  // A. nuevo usuario: 0 progreso y empty states correctos.
  it("A: curso nunca iniciado muestra el mensaje de progreso vacío, nunca NaN/undefined", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getByText("Tu progreso aparecerá acá cuando empieces a estudiar.")).toBeInTheDocument()
    );
    expect(container.textContent).not.toMatch(/NaN|undefined|Invalid Date/);
  });

  it("sin prácticas ni simulacros muestra los mensajes vacíos correspondientes", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Aún no realizaste prácticas.")).toBeInTheDocument());
    expect(screen.getByText("Aún no realizaste simulacros.")).toBeInTheDocument();
  });

  it("sin cursos publicados muestra el estado vacío correspondiente", async () => {
    mockedGetCourses.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Todavía no hay cursos publicados")).toBeInTheDocument()
    );
  });

  it("con progreso real, muestra el porcentaje y la recomendación de Continuar", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText(/tópicos completados/)).toBeInTheDocument());
    expect(screen.getByText("Recomendado para vos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
    expect(screen.getByText("Dejaste este tópico en progreso.")).toBeInTheDocument();
  });

  it("con el curso completo, muestra 'Curso completado' y nunca el botón Continuar", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    markTopicCompleted("curso-demo", "modulo-1", "topico-2");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Curso completado")).toBeInTheDocument());
    expect(screen.queryByText("Continuar")).not.toBeInTheDocument();
  });

  it("con más de un curso, muestra el selector de curso", async () => {
    mockedGetCourses.mockResolvedValue([
      COURSE_SUMMARY,
      { ...COURSE_SUMMARY, id: "curso-otro", title: "Otro Curso" },
    ]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Curso")).toBeInTheDocument());
  });

  it("con un solo curso, nunca muestra el selector", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Tu progreso aparecerá acá cuando empieces a estudiar.")).toBeInTheDocument()
    );
    expect(screen.queryByLabelText("Curso")).not.toBeInTheDocument();
  });

  it("lista módulos y tópicos con su estado, cada tópico es un link al aula", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector(".learning-modules")).toBeInTheDocument());
    // v1.6.0 (Bloque 2): "Tópico 1" también aparece en la sección "En
    // progreso" (LearningState "progressing"/COMPLETED_NO_ASSESSMENT) --
    // acá se prueba específicamente el link de "Progreso por módulo",
    // scopeado a ese contenedor.
    const modulesSection = within(container.querySelector(".learning-modules") as HTMLElement);
    const link = modulesSection.getByText("Tópico 1").closest("a");
    expect(link).toHaveAttribute("href", "/aula/curso-demo/modulo-1/topico-1");
  });

  // -------------------------------------------------------------------
  // v1.1.0 — adaptación pedagógica (PARTE 26)
  // -------------------------------------------------------------------

  it("Continuar navega al tópico correspondiente", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-1");
  });

  it("Revisar tema navega al tópico débil con ?review=true", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    recordCertificationAttempt("curso-demo", attempt());
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar tema" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Revisar tema" }));
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-1?review=true");
  });

  it("Iniciar práctica abre la preparación de certificación con los tópicos correctos", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    markTopicStarted("curso-demo", "modulo-1", "topico-2");
    recordCertificationAttempt("curso-demo", attempt());
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar práctica" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Iniciar práctica" }));
    expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo?mode=practice&topics=topico-1");
  });

  it("el motivo de la recomendación es siempre visible, con datos reales, nunca 'la IA recomienda'", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Dejaste este tópico en progreso.")).toBeInTheDocument());
    expect(container.textContent?.toLowerCase()).not.toContain("la ia recomienda");
  });

  it("'¿Por qué?' expande datos observados reales", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    recordCertificationAttempt("curso-demo", attempt());
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getAllByText("¿Por qué?").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("¿Por qué?")[0]);
    const whyData = container.querySelector(".learning-recommendation__why-data");
    expect(whyData).not.toBeNull();
    expect(whyData?.textContent).toContain("Último resultado");
    expect(whyData?.textContent).toContain("20%");
  });

  it("nunca usa lenguaje de predicción/certificación oficial ni gamificación en la página completa", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-1");
    markTopicCompleted("curso-demo", "modulo-1", "topico-2");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Curso completado")).toBeInTheDocument());
    const text = container.textContent?.toLowerCase() ?? "";
    for (const banned of ["listo para certificarte", "probabilidad", "nivel de dominio", "xp", "racha", "streak"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("aislamiento multi-curso: un resultado débil en otro curso no genera recomendación de refuerzo acá", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-1");
    recordCertificationAttempt("otro-curso", attempt({ courseId: "otro-curso" }));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Recomendado para vos")).toBeInTheDocument());
    expect(screen.queryByText("Reforzar")).not.toBeInTheDocument();
    expect(screen.queryByText("Practicar")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------
// v1.6.0 Bloque 2 — "Learning Insights UI": hace visible/accionable
// LearningState[] (Bloque 1) dentro de "Mi aprendizaje".
// ---------------------------------------------------------------------

const BIG_COURSE_DETAIL = {
  id: "curso-demo",
  title: "Curso Demo",
  description: "",
  order: 1,
  modules: [
    {
      id: "modulo-1",
      title: "Módulo 1",
      order: 1,
      topics: [
        { id: "topico-a", title: "Tópico A", order: 1 },
        { id: "topico-b", title: "Tópico B", order: 2 },
        { id: "topico-c", title: "Tópico C", order: 3 },
        { id: "topico-d", title: "Tópico D", order: 4 },
      ],
    },
  ],
};

function scoreAttempt(topicId: string, score: number, completedAt: string, attemptId: string) {
  return attempt({
    attemptId,
    completedAt,
    scorePercentage: score,
    topicIds: [topicId],
    performanceByTopic: [
      {
        module_id: "modulo-1",
        topic_id: topicId,
        attempted: 1,
        correct: score >= 80 ? 1 : 0,
        partially_correct: 0,
        incorrect: score < 80 ? 1 : 0,
        unanswered: 0,
        practice_score_percent: score,
      },
    ],
  });
}

describe("LearningProgressPage — v1.6.0 Bloque 2 (Learning Insights UI)", () => {
  it("PASO 46: summary counts exactos con una mezcla real de los 4 estados", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-b");
    markTopicCompleted("curso-demo", "modulo-1", "topico-c");
    markTopicCompleted("curso-demo", "modulo-1", "topico-d");
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-c", 30, "2026-01-01T00:00:00.000Z", "att-c"));
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-d", 95, "2026-01-01T00:00:00.000Z", "att-d"));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Estado de aprendizaje")).toBeInTheDocument());
    const summarySection = within(container.querySelector(".learning-insights-summary") as HTMLElement);
    const masteredItem = summarySection.getByText("Dominados").closest(".learning-insights-summary__item");
    const needsReviewItem = summarySection.getByText("Necesitan repaso").closest(".learning-insights-summary__item");
    const progressingItem = summarySection.getByText("En progreso").closest(".learning-insights-summary__item");
    const notStartedItem = summarySection.getByText("No iniciados").closest(".learning-insights-summary__item");
    // topico-a nunca se tocó -> not_started; topico-b completado sin
    // evaluación -> progressing; topico-c -> needs_review; topico-d -> mastered.
    expect(masteredItem?.querySelector(".learning-insights-summary__count")?.textContent).toBe("1");
    expect(needsReviewItem?.querySelector(".learning-insights-summary__count")?.textContent).toBe("1");
    expect(progressingItem?.querySelector(".learning-insights-summary__count")?.textContent).toBe("1");
    expect(notStartedItem?.querySelector(".learning-insights-summary__count")?.textContent).toBe("1");
  });

  it("PASO 47/58: candidate needs_review visible en 'Prioridad de repaso' con reason copy explícito (nunca enum crudo)", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-a", 35, "2026-01-01T00:00:00.000Z", "att-1"));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Prioridad de repaso")).toBeInTheDocument());
    expect(screen.getByText("Necesita repaso")).toBeInTheDocument();
    expect(
      screen.getByText("Tu resultado reciente en certificación indica que conviene repasar este tema.")
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/LOW_CERTIFICATION_SCORE|needs_review/);
  });

  it("PASO 48/16: repeated low certification score muestra el texto de repetición + conteo de observaciones", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-a", 30, "2026-01-01T00:00:00.000Z", "att-1"));
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-a", 40, "2026-01-02T00:00:00.000Z", "att-2"));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Los resultados recientes muestran dificultad repetida en este tema.")).toBeInTheDocument()
    );
    expect(screen.getByText(/2 resultados recientes/)).toBeInTheDocument();
  });

  it("PASO 49/9: completion-only aparece como 'En progreso', NUNCA 'Dominado'", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-b");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "En progreso" })).toBeInTheDocument());
    const progressingCard = screen
      .getByText("Completaste el tema, pero todavía no hay evidencia suficiente para considerarlo dominado.")
      .closest(".learning-state-card");
    expect(progressingCard?.textContent).toContain("En progreso");
    expect(progressingCard?.textContent).not.toContain("Dominado");
    // Y nunca aparece en la sección "Dominados".
    const masteredHeading = [...container.querySelectorAll("h2")].find((h) => h.textContent === "Dominados");
    expect(masteredHeading).toBeUndefined();
  });

  it("PASO 50: alta evidencia de certificación -> 'Dominado' en la lista compacta", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-d");
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-d", 95, "2026-01-01T00:00:00.000Z", "att-1"));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Dominados" })).toBeInTheDocument());
    // "Tópico D" también aparece en "Progreso por módulo" (lista curricular
    // completa, sin cambios) -- se busca específicamente el link de la
    // sección "Dominados" nueva.
    const links = screen.getAllByText("Tópico D").map((el) => el.closest("a"));
    const masteredLink = links.find((a) => a?.classList.contains("learning-topic--mastered"));
    expect(masteredLink).toBeDefined();
  });

  it("PASO 51/25: curso completamente nuevo (sin actividad) muestra el empty-state correcto, nunca alerta vacía", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText("Todavía no hay suficiente actividad para generar recomendaciones de repaso.")
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "Comenzar repaso" })).not.toBeInTheDocument();
  });

  it("PASO 24: actividad real pero sin needs_review -> mensaje positivo preciso, nunca 'Dominás todo' salvo que todo sea mastered", async () => {
    markTopicStarted("curso-demo", "modulo-1", "topico-a"); // progressing, no mastered
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getByText("No hay temas que requieran repaso prioritario.")).toBeInTheDocument()
    );
    expect(container.textContent?.toLowerCase()).not.toContain("dominás todo");
  });

  it("PASO 52/35: 'Repasar tema' navega usando IDs reales (nunca desde el display name)", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-a", 30, "2026-01-01T00:00:00.000Z", "att-1"));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Repasar tema" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Repasar tema" }));
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-a?review=true");
  });

  it("PASO 53: 'Comenzar repaso' navega al PRIMER candidate needs_review real (nunca otro status)", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-b"); // progressing (no needs_review)
    markTopicCompleted("curso-demo", "modulo-1", "topico-c");
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-c", 20, "2026-01-01T00:00:00.000Z", "att-1"));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Comenzar repaso" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Comenzar repaso" }));
    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-c?review=true");
  });

  it("PASO 54: sin ningún needs_review, 'Comenzar repaso' nunca se muestra", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-b");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Prioridad de repaso")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Comenzar repaso" })).not.toBeInTheDocument();
  });

  it("PASO 55: aislamiento de curso -- evidencia de otro curso nunca aparece acá", async () => {
    recordCertificationAttempt("otro-curso", scoreAttempt("topico-a", 20, "2026-01-01T00:00:00.000Z", "att-1"));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText("Todavía no hay suficiente actividad para generar recomendaciones de repaso.")
      ).toBeInTheDocument()
    );
    expect(screen.queryByText("Necesita repaso")).not.toBeInTheDocument();
  });

  it("PASO 56/33: storage v1.5.0 (sin certificationAttempts previo a Bloque 1) sigue renderizando correctamente", async () => {
    // Simula progreso legado: solo status curricular, certificationAttempts
    // vacío (exactamente lo que produce un usuario real de v1.5.0).
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Estado de aprendizaje")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/NaN|undefined|Invalid Date/);
  });

  it("PASO 57/31: reactividad -- una nueva certificación reordena/actualiza el estado visual al re-renderizar", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    const { rerender } = renderPage();
    await waitFor(() =>
      expect(screen.getByText("No hay temas que requieran repaso prioritario.")).toBeInTheDocument()
    );
    expect(
      screen.queryByText("Todavía no hay suficiente actividad para generar recomendaciones de repaso.")
    ).not.toBeInTheDocument();

    recordCertificationAttempt("curso-demo", scoreAttempt("topico-a", 25, "2026-01-01T00:00:00.000Z", "att-1"));
    rerender(
      <MemoryRouter>
        <LearningProgressPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Prioridad de repaso")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Repasar tema" })).toBeInTheDocument());
  });

  it("PASO 59: COMPLETED_NO_ASSESSMENT nunca menciona checkpoint, score numérico ni 'fallaste'", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-b");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText("Completaste el tema, pero todavía no hay evidencia suficiente para considerarlo dominado.")
      ).toBeInTheDocument()
    );
    const text = screen
      .getByText("Completaste el tema, pero todavía no hay evidencia suficiente para considerarlo dominado.")
      .textContent?.toLowerCase();
    expect(text).not.toContain("checkpoint");
    expect(text).not.toMatch(/\d+%/);
    expect(text).not.toContain("fallaste");
  });

  it("PASO 34: evidencia para un tópico eliminado del curso real no genera card ni rompe la navegación", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-inexistente");
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("Estado de aprendizaje")).toBeInTheDocument());
    expect(container.textContent).not.toContain("topico-inexistente");
    // Los 4 tópicos reales del curso están todos not_started (nunca se
    // "inventa" un 5to tópico fantasma en el summary).
    const counts = [...container.querySelectorAll(".learning-insights-summary__count")].map((el) =>
      Number(el.textContent)
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
  });
});

// ---------------------------------------------------------------------
// v1.6.0 Bloque 3 — "Guided Review Session": "Comenzar repaso" crea una
// sesión real; "Repasar tema" individual NUNCA la crea; confirmación de
// repaso completado.
// ---------------------------------------------------------------------
import { loadGuidedReviewSession, clearGuidedReviewSession } from "../../learning/guidedReviewSession";

describe("LearningProgressPage — v1.6.0 Bloque 3 (Guided Review Session)", () => {
  afterEach(() => {
    clearGuidedReviewSession();
  });

  it("PASO 48: 'Comenzar repaso' crea una GuidedReviewSession real y navega al primer tópico del plan con currentIndex=0", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    recordCertificationAttempt(
      "curso-demo",
      scoreAttempt("topico-a", 30, "2026-01-01T00:00:00.000Z", "att-1")
    );
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Comenzar repaso" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Comenzar repaso" }));

    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-a?review=true");
    const session = loadGuidedReviewSession("curso-demo");
    expect(session?.currentIndex).toBe(0);
    expect(session?.topics).toEqual([{ moduleId: "modulo-1", topicId: "topico-a" }]);
  });

  it("PASO 49: 'Repasar tema' individual navega al tópico pero NUNCA crea una GuidedReviewSession", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    recordCertificationAttempt(
      "curso-demo",
      scoreAttempt("topico-a", 30, "2026-01-01T00:00:00.000Z", "att-1")
    );
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Repasar tema" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Repasar tema" }));

    expect(mockNavigate).toHaveBeenCalledWith("/aula/curso-demo/modulo-1/topico-a?review=true");
    expect(loadGuidedReviewSession("curso-demo")).toBeNull();
  });

  it("confirmación 'Repaso completado' se muestra con el state de navegación, con copy preciso (nunca 'dominás'/'mejoraste')", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    const { container } = renderPage([
      {
        pathname: "/mi-aprendizaje",
        state: {
          reviewCompleted: true,
          courseId: "curso-demo",
          topicCount: 2,
          topics: [
            { moduleId: "modulo-1", topicId: "topico-a" },
            { moduleId: "modulo-1", topicId: "topico-b" },
          ],
        },
      },
    ]);
    await waitFor(() => expect(screen.getByText("Repaso completado")).toBeInTheDocument());
    expect(
      screen.getByText(
        "Completaste esta ruta de repaso (2 temas). Tu estado de aprendizaje se actualizará cuando haya nueva evidencia evaluativa."
      )
    ).toBeInTheDocument();
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("dominás");
    expect(text).not.toContain("mejoraste");
  });

  it("'Evaluar progreso' navega al flujo EXISTENTE de Certification, acotado a los tópicos repasados", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage([
      {
        pathname: "/mi-aprendizaje",
        state: {
          reviewCompleted: true,
          courseId: "curso-demo",
          topicCount: 2,
          topics: [
            { moduleId: "modulo-1", topicId: "topico-a" },
            { moduleId: "modulo-1", topicId: "topico-b" },
          ],
        },
      },
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluar progreso" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Evaluar progreso" }));
    expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo?mode=practice&topics=topico-a%2Ctopico-b");
  });

  it("'Evaluar progreso' crea un GuidedReviewVerificationContext real con el snapshot de estado actual", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-a", 30, "2026-01-01T00:00:00.000Z", "att-1"));
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage([
      {
        pathname: "/mi-aprendizaje",
        state: {
          reviewCompleted: true,
          courseId: "curso-demo",
          topicCount: 1,
          topics: [{ moduleId: "modulo-1", topicId: "topico-a" }],
        },
      },
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluar progreso" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Evaluar progreso" }));

    const context = loadGuidedReviewVerificationContext("curso-demo");
    expect(context?.topics).toEqual([{ moduleId: "modulo-1", topicId: "topico-a" }]);
    expect(context?.preVerificationStates).toEqual([
      { moduleId: "modulo-1", topicId: "topico-a", status: "needs_review", reasonCode: "LOW_CERTIFICATION_SCORE" },
    ]);
    expect(context?.latestAttemptIdAtStart).toBe("att-1");
  });

  it("bug real (QA v1.6.0 Bloque 4): 'Evaluar progreso' crea el contexto aunque getCourses() todavía no haya resuelto (carrera con selectedCourseId)", async () => {
    markTopicCompleted("curso-demo", "modulo-1", "topico-a");
    recordCertificationAttempt("curso-demo", scoreAttempt("topico-a", 30, "2026-01-01T00:00:00.000Z", "att-1"));
    // getCourses() NUNCA resuelve durante este test -- selectedCourseId
    // se queda en null indefinidamente, simulando el click real y rápido
    // que originó el bug (la tarjeta "Repaso completado" ya se ve porque
    // depende únicamente del router state, no de selectedCourseId).
    mockedGetCourses.mockReturnValue(new Promise(() => {}));
    mockedGetCourse.mockReturnValue(new Promise(() => {}));
    renderPage([
      {
        pathname: "/mi-aprendizaje",
        state: {
          reviewCompleted: true,
          courseId: "curso-demo",
          topicCount: 1,
          topics: [{ moduleId: "modulo-1", topicId: "topico-a" }],
        },
      },
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluar progreso" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Evaluar progreso" }));

    expect(mockNavigate).toHaveBeenCalledWith("/certificacion/curso-demo?mode=practice&topics=topico-a");
    const context = loadGuidedReviewVerificationContext("curso-demo");
    expect(context?.latestAttemptIdAtStart).toBe("att-1");
  });

  it("'Entendido' cierra la confirmación sin efectos secundarios", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage([
      {
        pathname: "/mi-aprendizaje",
        state: {
          reviewCompleted: true,
          courseId: "curso-demo",
          topicCount: 1,
          topics: [{ moduleId: "modulo-1", topicId: "topico-a" }],
        },
      },
    ]);
    await waitFor(() => expect(screen.getByText("Repaso completado")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByText("Repaso completado")).not.toBeInTheDocument();
  });

  it("sin state de navegación, nunca muestra la confirmación de repaso completado", async () => {
    mockedGetCourses.mockResolvedValue([COURSE_SUMMARY]);
    mockedGetCourse.mockResolvedValue(BIG_COURSE_DETAIL);
    renderPage();
    await waitFor(() => expect(screen.getByText("Estado de aprendizaje")).toBeInTheDocument());
    expect(screen.queryByText("Repaso completado")).not.toBeInTheDocument();
  });
});
