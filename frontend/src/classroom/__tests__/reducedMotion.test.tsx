import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneRenderer } from "../SceneRenderer";
import { CANONICAL_INFO, SAMPLE_LESSON } from "./fixtures";

/** Simula `prefers-reduced-motion: reduce` en window.matchMedia (jsdom no
 * lo implementa por defecto). Nuestros componentes NUNCA consultan
 * matchMedia en JS: las animaciones se desactivan puramente por CSS (ver
 * global.css, @media (prefers-reduced-motion: reduce)). Este test
 * confirma que el renderer sigue funcionando igual (mismo contenido
 * accesible) sin importar esa preferencia del sistema. */
function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("prefers-reduced-motion", () => {
  it("15. no rompe la UI: el contenido sigue siendo usable con reduced-motion activo", () => {
    mockReducedMotion(true);
    const scene = SAMPLE_LESSON.scenes[1];
    render(<SceneRenderer scene={scene} canonical={CANONICAL_INFO} renderKey={0} />);

    expect(screen.getByText(scene.title.text)).toBeInTheDocument();
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
  });

  it("renderiza igual cuando el usuario no pidió reduced-motion", () => {
    mockReducedMotion(false);
    const scene = SAMPLE_LESSON.scenes[1];
    render(<SceneRenderer scene={scene} canonical={CANONICAL_INFO} renderKey={0} />);
    expect(screen.getByText(scene.title.text)).toBeInTheDocument();
  });
});
