import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReadAloudControls } from "../ReadAloudControls";
import type { UseReadAloudResult } from "../useReadAloud";

function baseReader(overrides: Partial<UseReadAloudResult> = {}): UseReadAloudResult {
  return {
    state: "idle",
    rate: 1.0,
    setRate: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    hasReadableContent: true,
    errorMessage: null,
    disabled: false,
    ...overrides,
  };
}

describe("ReadAloudControls", () => {
  it("1. idle muestra 'Leer tema' y ningún botón Stop", () => {
    render(<ReadAloudControls reader={baseReader({ state: "idle" })} />);
    expect(screen.getByRole("button", { name: /Leer tema/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Detener lectura del tema" })).not.toBeInTheDocument();
  });

  it("2. click en el botón principal en idle llama a play()", () => {
    const play = vi.fn();
    render(<ReadAloudControls reader={baseReader({ state: "idle", play })} />);
    fireEvent.click(screen.getByRole("button", { name: /Leer tema/ }));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("3. playing muestra 'Pausar lectura' y el botón Stop", () => {
    render(<ReadAloudControls reader={baseReader({ state: "playing" })} />);
    expect(screen.getByRole("button", { name: /Pausar lectura/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Detener lectura del tema" })).toBeInTheDocument();
  });

  it("4. click en el botón principal en playing llama a pause()", () => {
    const pause = vi.fn();
    render(<ReadAloudControls reader={baseReader({ state: "playing", pause })} />);
    fireEvent.click(screen.getByRole("button", { name: /Pausar lectura/ }));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("5. paused muestra 'Continuar lectura'", () => {
    const resume = vi.fn();
    render(<ReadAloudControls reader={baseReader({ state: "paused", resume })} />);
    const btn = screen.getByRole("button", { name: /Continuar lectura/ });
    fireEvent.click(btn);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("6. completed muestra 'Leer nuevamente'", () => {
    render(<ReadAloudControls reader={baseReader({ state: "completed" })} />);
    expect(screen.getByRole("button", { name: /Leer nuevamente/ })).toBeInTheDocument();
  });

  it("7. error muestra el mensaje y 'Reintentar lectura'", () => {
    render(
      <ReadAloudControls
        reader={baseReader({ state: "error", errorMessage: "No se pudo generar voz." })}
      />
    );
    expect(screen.getByRole("button", { name: /Reintentar lectura/ })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo generar voz.");
  });

  it("8. loading deshabilita el botón principal", () => {
    render(<ReadAloudControls reader={baseReader({ state: "loading" })} />);
    expect(screen.getByRole("button", { name: /Cargando/ })).toBeDisabled();
  });

  it("9. disabled=true deshabilita el botón principal en cualquier estado", () => {
    render(<ReadAloudControls reader={baseReader({ state: "idle", disabled: true })} />);
    expect(screen.getByRole("button", { name: /Leer tema/ })).toBeDisabled();
  });

  it("10. click en Stop llama a stop()", () => {
    const stop = vi.fn();
    render(<ReadAloudControls reader={baseReader({ state: "playing", stop })} />);
    fireEvent.click(screen.getByRole("button", { name: "Detener lectura del tema" }));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("11. selector de velocidad muestra las 5 opciones requeridas", () => {
    render(<ReadAloudControls reader={baseReader()} />);
    const select = screen.getByLabelText("Velocidad de lectura del tema") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["0.75", "1", "1.25", "1.5", "2"]);
  });

  it("12. cambiar la velocidad llama a setRate con el valor numérico correcto", () => {
    const setRate = vi.fn();
    render(<ReadAloudControls reader={baseReader({ setRate })} />);
    fireEvent.change(screen.getByLabelText("Velocidad de lectura del tema"), {
      target: { value: "1.5" },
    });
    expect(setRate).toHaveBeenCalledWith(1.5);
  });

  it("13. el nombre accesible del botón principal incluye el estado real", () => {
    render(<ReadAloudControls reader={baseReader({ state: "playing" })} />);
    expect(screen.getByLabelText(/Pausar lectura.*contenido del tema/)).toBeInTheDocument();
  });
});
