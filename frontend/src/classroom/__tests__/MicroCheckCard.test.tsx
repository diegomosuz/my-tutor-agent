import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { api: { evaluateMicroCheckFeedback: vi.fn() }, ApiError };
});

import { api, ApiError } from "../../api/client";
import { MicroCheckCard } from "../MicroCheckCard";
import type { TutorMicroCheck } from "../../types/api";

const mockedEvaluate = api.evaluateMicroCheckFeedback as unknown as ReturnType<typeof vi.fn>;

const IDS = { courseId: "curso-demo", moduleId: "modulo-demo", topicId: "topico-demo" };

function microCheck(): TutorMicroCheck {
  return {
    question: { text: "¿Qué diferencia hay entre A y B?", source_refs: ["SRC-002"] },
    kind: "conceptual",
  };
}

beforeEach(() => {
  mockedEvaluate.mockReset();
});

describe("MicroCheckCard", () => {
  it("muestra la pregunta del micro-check", () => {
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    expect(screen.getByText("¿Qué diferencia hay entre A y B?")).toBeInTheDocument();
  });

  it("NUNCA muestra un score, answer key ni un estado de mastery", () => {
    const { container } = render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    const text = container.textContent ?? "";
    for (const forbidden of ["score", "answer_key", "mastered", "needs_review", "%"]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("enviar respuesta llama a api.evaluateMicroCheckFeedback con la pregunta y la respuesta", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "correct",
      feedback: { text: "Bien, identificaste la diferencia clave.", source_refs: ["SRC-002"] },
    });
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);

    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "A hace X, B hace Y." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));

    await waitFor(() => expect(mockedEvaluate).toHaveBeenCalledTimes(1));
    expect(mockedEvaluate).toHaveBeenCalledWith("curso-demo", "modulo-demo", "topico-demo", {
      micro_check_question: "¿Qué diferencia hay entre A y B?",
      student_answer: "A hace X, B hace Y.",
    });
  });

  it("muestra el veredicto y el feedback grounded tras responder", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "partially_correct",
      feedback: { text: "Identificaste A, pero falta B.", source_refs: ["SRC-002"] },
    });
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), {
      target: { value: "A hace X." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));

    await waitFor(() => expect(screen.getByText("Parcialmente correcto")).toBeInTheDocument());
    expect(screen.getByText("Identificaste A, pero falta B.")).toBeInTheDocument();
  });

  it("el formulario desaparece tras responder, reemplazado por el resultado", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "correct",
      feedback: { text: "Bien.", source_refs: ["SRC-002"] },
    });
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));

    await waitFor(() => expect(screen.getByText("Correcto")).toBeInTheDocument());
    expect(screen.queryByPlaceholderText("Escribí tu respuesta…")).not.toBeInTheDocument();
  });

  it("Intentar de nuevo limpia el resultado y vuelve a mostrar el formulario", async () => {
    mockedEvaluate.mockResolvedValue({
      verdict: "needs_revision",
      feedback: { text: "Repasemos el concepto.", source_refs: ["SRC-002"] },
    });
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));

    await waitFor(() => expect(screen.getByText("A revisar")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

    expect(screen.getByPlaceholderText("Escribí tu respuesta…")).toBeInTheDocument();
    expect(screen.queryByText("A revisar")).not.toBeInTheDocument();
  });

  it("el botón Responder se deshabilita mientras evalúa (evita doble envío)", async () => {
    let resolvePromise!: (value: unknown) => void;
    mockedEvaluate.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Evaluando/ })).toBeDisabled());
    expect(mockedEvaluate).toHaveBeenCalledTimes(1);

    resolvePromise({ verdict: "correct", feedback: { text: "Ok", source_refs: ["SRC-002"] } });
  });

  it("un error controlado se muestra sin romper la tarjeta", async () => {
    mockedEvaluate.mockRejectedValue(new ApiError(502, "El proveedor de IA falló."));
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    fireEvent.change(screen.getByPlaceholderText("Escribí tu respuesta…"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));

    await waitFor(() => expect(screen.queryByText(/no está disponible|falló|IA/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Responder" })).toBeInTheDocument();
  });

  it("no envía con respuesta vacía (el botón permanece deshabilitado)", () => {
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    expect(screen.getByRole("button", { name: "Responder" })).toBeDisabled();
  });

  it("es accesible por teclado: input y botón tienen label/rol correctos", () => {
    render(<MicroCheckCard {...IDS} microCheck={microCheck()} />);
    const input = screen.getByPlaceholderText("Escribí tu respuesta…");
    expect(input).toHaveAccessibleName();
    expect(screen.getByRole("group", { name: "Comprobación rápida" })).toBeInTheDocument();
  });
});
