import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiOperationStatus } from "../AiOperationStatus";

describe("AiOperationStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("muestra el mensaje inicial apenas se monta", () => {
    render(
      <AiOperationStatus initialMessage="Preparando clase…" delayedMessage="Puede tardar unos segundos." />
    );
    expect(screen.getByRole("status").textContent).toContain("Preparando clase…");
  });

  it("cambia al mensaje de espera prolongada pasado el tiempo configurado", () => {
    render(
      <AiOperationStatus
        initialMessage="Preparando clase…"
        delayedMessage="Puede tardar unos segundos."
        delayMs={3000}
      />
    );
    expect(screen.getByRole("status").textContent).toContain("Preparando clase…");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole("status").textContent).toContain("Puede tardar unos segundos.");
  });

  it("nunca muestra un porcentaje ni un progreso inventado", () => {
    render(
      <AiOperationStatus initialMessage="Preparando clase…" delayedMessage="Puede tardar unos segundos." />
    );
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\d+\s*(de|\/)\s*\d+/);
  });

  it("usa aria-live polite para no interrumpir al lector de pantalla", () => {
    render(
      <AiOperationStatus initialMessage="Preparando clase…" delayedMessage="Puede tardar unos segundos." />
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
