import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../ErrorBoundary";

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renderiza a los hijos normalmente cuando no hay error", () => {
    render(
      <ErrorBoundary>
        <p>Todo bien</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("Todo bien")).toBeInTheDocument();
  });

  it("muestra 'Algo salió mal' y nunca un stack trace ante un error inesperado", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver al catálogo" })).toBeInTheDocument();
    expect(screen.queryByText(/at Boom|\.tsx:\d+/)).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
