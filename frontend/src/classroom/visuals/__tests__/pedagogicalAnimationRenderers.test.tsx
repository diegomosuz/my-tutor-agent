// Tests de integración de Pedagogical Animations en los 5 visual
// renderers de foco (PARTE 32 de la especificación): progresión real por
// etapa, reduced-motion muestra todo de inmediato, y el contenido
// semántico completo sigue en el DOM (accesible) aunque visualmente no se
// haya "revelado" todavía — nunca `display:none`/remoción del árbol.
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_INFO, SAMPLE_LESSON, withVisual } from "../../__tests__/fixtures";
import { buildSourceBlockLookup } from "../../sourceBlockLookup";
import { ANIMATION_TIMING } from "../../animationTiming";
import { ArchitectureVisual } from "../ArchitectureVisual";
import { ComparisonVisual } from "../ComparisonVisual";
import { ConceptMapVisual } from "../ConceptMapVisual";
import { HierarchyVisual } from "../HierarchyVisual";
import { ProcessVisual } from "../ProcessVisual";
import type { VisualComponentProps } from "../types";

const baseScene = SAMPLE_LESSON.scenes[1];
const lookupSourceBlock = buildSourceBlockLookup(CANONICAL_INFO);

function props(overrides: Partial<VisualComponentProps> = {}): VisualComponentProps {
  return {
    scene: baseScene,
    lookupSourceBlock,
    renderKey: 0,
    courseId: "curso-demo",
    moduleId: "modulo-demo",
    topicId: "topico-demo",
    isPaused: false,
    ...overrides,
  };
}

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

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ProcessVisual — animación pedagógica", () => {
  it("solo el elemento permitido por etapa está 'revelado'; el resto sigue en el DOM oculto (accesible)", () => {
    const scene = withVisual(baseScene, "process", ["SRC-002"], {
      process_steps: [
        { label: "Paso 1", detail: "" },
        { label: "Paso 2", detail: "" },
        { label: "Paso 3", detail: "" },
      ],
    });
    const { container, getByText } = render(<ProcessVisual {...props({ scene })} />);
    const steps = container.querySelectorAll(".visual-process__step");

    // Estado inicial: nada revelado todavía (antes del initialDelay).
    expect(steps[0].className).toContain("pedagogical-hidden");
    expect(steps[1].className).toContain("pedagogical-hidden");
    // Pero el texto SIGUE en el DOM -- nunca se quita (PARTE 26).
    expect(getByText("Paso 2")).toBeInTheDocument();
    expect(getByText("Paso 3")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(steps[0].className).toContain("pedagogical-active");
    expect(steps[1].className).toContain("pedagogical-hidden");
    expect(steps[2].className).toContain("pedagogical-hidden");
  });

  it("reduced-motion: todos los pasos y conectores visibles de inmediato", () => {
    mockReducedMotion(true);
    const scene = withVisual(baseScene, "process", ["SRC-002"], {
      process_steps: [
        { label: "Paso 1", detail: "" },
        { label: "Paso 2", detail: "" },
      ],
    });
    const { container } = render(<ProcessVisual {...props({ scene })} />);
    const steps = container.querySelectorAll(".visual-process__step");
    expect(steps[0].className).toContain("pedagogical-revealed");
    expect(steps[1].className).toContain("pedagogical-revealed");
  });
});

describe("HierarchyVisual — animación pedagógica", () => {
  it("root aparece antes que los children (root primero, children como grupo después)", () => {
    const scene = withVisual(baseScene, "hierarchy", ["SRC-002"], {
      nodes: [
        { id: "root", label: "Categoría", description: "", role: null },
        { id: "hijo-1", label: "Subcategoría 1", description: "", role: null },
      ],
      edges: [{ from_id: "root", to_id: "hijo-1", label: "", relation_type: "contains" }],
    });
    const { container } = render(<HierarchyVisual {...props({ scene })} />);
    const root = container.querySelector(".visual-hierarchy__root")!;
    const child = container.querySelector(".visual-hierarchy__child")!;

    expect(root.className).toContain("pedagogical-hidden");
    expect(child.className).toContain("pedagogical-hidden");

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(root.className).toContain("pedagogical-active");
    expect(child.className).toContain("pedagogical-hidden");

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs));
    // Último paso de la secuencia: pasa directo a "revealed" (la
    // secuencia ya está completa, no queda un paso siguiente contra el
    // cual distinguir "active" — mismo criterio que
    // usePedagogicalAnimation.test.ts).
    expect(root.className).toContain("pedagogical-revealed");
    expect(child.className).toContain("pedagogical-revealed");
  });

  it("sin raíz clara (0 edges): root/title siempre visible, children revelados como grupo simultáneo", () => {
    const scene = withVisual(baseScene, "hierarchy", ["SRC-002"], {
      nodes: [
        { id: "a", label: "Nivel A", description: "", role: null },
        { id: "b", label: "Nivel B", description: "", role: null },
      ],
      edges: [],
    });
    const { container } = render(<HierarchyVisual {...props({ scene })} />);
    // El título/root fallback nunca forma parte de la animación (no es un
    // node real) -- siempre visible.
    expect(container.querySelector(".visual-hierarchy__root")!.className).toContain(
      "pedagogical-revealed"
    );
    const children = container.querySelectorAll(".visual-hierarchy__child");
    expect(children[0].className).toContain("pedagogical-hidden");
    expect(children[1].className).toContain("pedagogical-hidden");

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    // Ambos aparecen JUNTOS -- nunca A antes que B con delay (no implica
    // causalidad entre siblings). Es el único paso de la secuencia, así
    // que pasa directo a "revealed" (secuencia completa en un solo tick).
    expect(children[0].className).toContain("pedagogical-revealed");
    expect(children[1].className).toContain("pedagogical-revealed");
  });
});

describe("ArchitectureVisual — animación pedagógica", () => {
  it("nodes/edges progresan según el traversal; el texto accesible (.sr-only) está completo desde el inicio", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "cliente", label: "Cliente", description: "", role: null },
        { id: "api", label: "API", description: "", role: null },
      ],
      edges: [{ from_id: "cliente", to_id: "api", label: "", relation_type: "connects_to" }],
    });
    const { container } = render(<ArchitectureVisual {...props({ scene })} />);
    const slots = container.querySelectorAll(".diagram-canvas__node-slot");
    expect(slots[0].className).toContain("diagram-canvas__node-slot--hidden");
    expect(slots[1].className).toContain("diagram-canvas__node-slot--hidden");
    // Accesibilidad: la relación completa ya está en el DOM, sin importar
    // el estado visual (PARTE 26).
    expect(container.querySelector(".sr-only")?.textContent).toContain("Cliente");
    expect(container.querySelector(".sr-only")?.textContent).toContain("API");

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(slots[0].className).toContain("diagram-canvas__node-slot--active"); // cliente = raíz
    expect(slots[1].className).toContain("diagram-canvas__node-slot--hidden");

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs));
    // Último paso (api + su edge): la secuencia completa en este mismo
    // tick, pasa directo a "revealed" (mismo criterio que en
    // usePedagogicalAnimation.test.ts).
    expect(slots[1].className).toContain("diagram-canvas__node-slot--revealed"); // api llega con su edge
    const line = container.querySelector("svg.diagram-canvas__edges line")!;
    expect(line.getAttribute("class")).toContain("diagram-canvas__edge-line--revealed");
  });

  it("reduced-motion: nodes y edges visibles de inmediato", () => {
    mockReducedMotion(true);
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "a", label: "A", description: "", role: null },
        { id: "b", label: "B", description: "", role: null },
      ],
      edges: [{ from_id: "a", to_id: "b", label: "", relation_type: "connects_to" }],
    });
    const { container } = render(<ArchitectureVisual {...props({ scene })} />);
    const slots = container.querySelectorAll(".diagram-canvas__node-slot");
    expect(slots[0].className).toContain("diagram-canvas__node-slot--revealed");
    expect(slots[1].className).toContain("diagram-canvas__node-slot--revealed");
  });
});

describe("ConceptMapVisual — animación pedagógica", () => {
  it("nodos relacionados aparecen como grupo, sin falsa temporalidad entre ellos", () => {
    const scene = withVisual(baseScene, "concept_map", ["SRC-002"], {
      nodes: [
        { id: "a", label: "Concepto A", description: "", role: null },
        { id: "b", label: "Concepto B", description: "", role: null },
      ],
      edges: [{ from_id: "a", to_id: "b", label: "", relation_type: "relates_to" }],
    });
    const { container } = render(<ConceptMapVisual {...props({ scene })} />);
    const nodes = container.querySelectorAll(".diagram-canvas__radial-node");
    expect(nodes[0].className).toContain("diagram-canvas__radial-node--hidden");
    expect(nodes[1].className).toContain("diagram-canvas__radial-node--hidden");

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    expect(nodes[0].className).toContain("active");
    expect(nodes[1].className).toContain("active");

    const line = container.querySelector("svg.diagram-canvas__edges line")!;
    expect(line.getAttribute("class")).toContain("diagram-canvas__edge-line--hidden");
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs));
    // Último paso: revealed directo (secuencia completa).
    expect(line.getAttribute("class")).toContain("revealed");
  });
});

describe("ComparisonVisual — animación pedagógica", () => {
  it("modo tabla: filas progresivas, cada fila revela TODAS sus columnas a la vez", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"], {
      comparison: {
        column_labels: ["Antes", "Después"],
        rows: [
          { label: "Duración", values: ["40 min", "25 min"] },
          { label: "Calidad", values: ["igual", "igual"] },
        ],
        columns: [],
      },
    });
    const { container } = render(<ComparisonVisual {...props({ scene })} />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0].className).toContain("pedagogical-hidden");
    expect(rows[1].className).toContain("pedagogical-hidden");

    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs)); // header
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.stepIntervalMs)); // row-0
    expect(rows[0].className).toContain("pedagogical-active");
    expect(rows[1].className).toContain("pedagogical-hidden");
    // Ambas columnas de la fila 0 ya están accesibles juntas.
    expect(rows[0].textContent).toContain("40 min");
    expect(rows[0].textContent).toContain("25 min");
  });

  it("modo cards (columns): pares simultáneos, nunca A mucho antes que B", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"], {
      comparison: {
        column_labels: ["Antes", "Después"],
        rows: [],
        columns: [
          { title: "Antes", points: ["Config repetida"] },
          { title: "Después", points: ["Config única"] },
        ],
      },
    });
    const { container } = render(<ComparisonVisual {...props({ scene })} />);
    const grid = container.querySelector(".visual-comparison__grid")!;
    expect(grid.className).toContain("pedagogical-hidden");
    act(() => vi.advanceTimersByTime(ANIMATION_TIMING.initialDelayMs));
    // Único paso: TODO el grid (ambas columnas) revelado a la vez.
    expect(grid.className).toContain("pedagogical-revealed");
  });
});
