import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "../NotFoundPage";

describe("NotFoundPage", () => {
  it("muestra un mensaje claro y un link de vuelta al catálogo", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Página no encontrada")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Volver al catálogo/ });
    expect(link).toHaveAttribute("href", "/");
  });
});
