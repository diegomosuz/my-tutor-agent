import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CANONICAL_INFO, SAMPLE_LESSON, withVisual } from "../../__tests__/fixtures";
import { buildSourceBlockLookup } from "../../sourceBlockLookup";
import { ArchitectureVisual } from "../ArchitectureVisual";
import { ComparisonVisual } from "../ComparisonVisual";
import { ConceptMapVisual } from "../ConceptMapVisual";
import { ImageVisual } from "../ImageVisual";
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
    ...overrides,
  };
}

describe("ProcessVisual — v1.1.0 contenido estructurado", () => {
  it("usa process_steps (label + detail) cuando vienen poblados", () => {
    const scene = withVisual(baseScene, "process", ["SRC-002"], {
      process_steps: [
        { label: "Recolectar datos", detail: "Desde la fuente autorizada." },
        { label: "Entrenar el modelo", detail: "" },
      ],
    });
    render(<ProcessVisual {...props({ scene })} />);
    expect(screen.getByText("Recolectar datos")).toBeInTheDocument();
    expect(screen.getByText("Desde la fuente autorizada.")).toBeInTheDocument();
    expect(screen.getByText("Entrenar el modelo")).toBeInTheDocument();
  });

  it("cae a key_points cuando process_steps viene vacío (robustez ante cache vieja)", () => {
    const scene = withVisual(baseScene, "process", ["SRC-002"]);
    render(<ProcessVisual {...props({ scene })} />);
    for (const kp of baseScene.key_points) {
      expect(screen.getByText(kp.text)).toBeInTheDocument();
    }
  });
});

describe("ComparisonVisual — v1.1.0 contenido estructurado", () => {
  it("modo tabla: renderiza filas y columnas reales cuando 'rows' viene poblado", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"], {
      comparison: {
        column_labels: ["Sistema tradicional", "Sistema con IA"],
        rows: [
          { label: "Entradas", values: ["Reglas fijas", "Datos de entrenamiento"] },
          { label: "Resultado", values: ["Determinístico", "Probabilístico"] },
        ],
        columns: [],
      },
    });
    render(<ComparisonVisual {...props({ scene })} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Sistema tradicional")).toBeInTheDocument();
    expect(screen.getByText("Reglas fijas")).toBeInTheDocument();
    expect(screen.getByText("Datos de entrenamiento")).toBeInTheDocument();
  });

  it("modo cards: sin 'rows', muestra una card por columna con los key_points", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"], {
      comparison: { column_labels: ["Concepto A", "Concepto B"], rows: [], columns: [] },
    });
    render(<ComparisonVisual {...props({ scene })} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Concepto A")).toBeInTheDocument();
    expect(screen.getByText("Concepto B")).toBeInTheDocument();
  });

  it("cae al comportamiento anterior (pares/cards neutrales) cuando comparison es null", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"]);
    render(<ComparisonVisual {...props({ scene })} />);
    for (const kp of baseScene.key_points) {
      expect(screen.getByText(kp.text)).toBeInTheDocument();
    }
  });

  // v1.2.0 — PARTE 22.L-N: columns column-specific + fallback legacy.
  it("L: modo cards con 'columns', cada columna muestra contenido DISTINTO (nunca los mismos key_points repetidos)", () => {
    const scene = {
      ...withVisual(baseScene, "comparison", ["SRC-002"], {
        comparison: {
          column_labels: ["Antes", "Después"],
          rows: [],
          columns: [
            { title: "Antes", points: ["Configuración repetida", "12 min cargando contexto"] },
            { title: "Después", points: ["Se configura una vez", "Contexto ya disponible"] },
          ],
        },
      }),
      key_points: [{ text: "Punto compartido irrelevante", source_refs: ["SRC-002"] }],
    };
    render(<ComparisonVisual {...props({ scene })} />);
    expect(screen.getByText("Configuración repetida")).toBeInTheDocument();
    expect(screen.getByText("Se configura una vez")).toBeInTheDocument();
    // Nunca aparecen los mismos puntos duplicados en ambas columnas.
    expect(screen.queryAllByText("Configuración repetida")).toHaveLength(1);
    expect(screen.queryByText("Punto compartido irrelevante")).not.toBeInTheDocument();
  });

  it("M: sin 'columns' (legacy), vuelve a mostrar los key_points compartidos en cada card", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"], {
      comparison: { column_labels: ["Concepto A", "Concepto B"], rows: [], columns: [] },
    });
    render(<ComparisonVisual {...props({ scene })} />);
    // Comportamiento legacy intacto: los key_points de la escena aparecen
    // repetidos en cada card (ver fixture baseScene.key_points).
    for (const kp of baseScene.key_points) {
      expect(screen.getAllByText(kp.text).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("N: la tabla existente (rows) sigue funcionando exactamente igual con el nuevo schema", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"], {
      comparison: {
        column_labels: ["A", "B"],
        rows: [{ label: "Fila", values: ["x", "y"] }],
        columns: [],
      },
    });
    render(<ComparisonVisual {...props({ scene })} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("x")).toBeInTheDocument();
  });
});

describe("ArchitectureVisual — v1.2.0 diagrama real (DiagramCanvas)", () => {
  it("E/F: renderiza nodos y dibuja un conector SVG real por cada edge declarada, sin inventar conexiones", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "api", label: "API Gateway", description: "", role: "component" },
        { id: "db", label: "Base de datos", description: "", role: "datastore" },
      ],
      edges: [{ from_id: "api", to_id: "db", label: "consulta", relation_type: "connects_to" }],
    });
    const { container } = render(<ArchitectureVisual {...props({ scene })} />);
    expect(screen.getAllByText("API Gateway").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Base de datos").length).toBeGreaterThan(0);
    // Conector geométrico real (SVG <line>), nunca una lista de texto "A -> B".
    expect(container.querySelectorAll("svg.diagram-canvas__edges line")).toHaveLength(1);
    expect(container.querySelector(".visual-graph__edges")).not.toBeInTheDocument();
    // Representación accesible equivalente (PARTE 29), oculta visualmente.
    expect(container.querySelector(".sr-only")?.textContent).toContain("API Gateway");
    expect(container.querySelector(".sr-only")?.textContent).toContain("Base de datos");
  });

  it("G: el label de una edge se muestra de forma compacta cuando hay espacio", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "a", label: "A", description: "", role: null },
        { id: "b", label: "B", description: "", role: null },
      ],
      edges: [{ from_id: "a", to_id: "b", label: "corto", relation_type: "connects_to" }],
    });
    const { container } = render(<ArchitectureVisual {...props({ scene })} />);
    expect(container.querySelector("svg text.diagram-canvas__edge-label")?.textContent).toBe("corto");
  });

  it("un label de edge demasiado largo no se renderiza inline (no rompe el diagrama)", () => {
    const longLabel = "a".repeat(80);
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "a", label: "A", description: "", role: null },
        { id: "b", label: "B", description: "", role: null },
      ],
      edges: [{ from_id: "a", to_id: "b", label: longLabel, relation_type: "connects_to" }],
    });
    const { container } = render(<ArchitectureVisual {...props({ scene })} />);
    expect(container.querySelector("svg text.diagram-canvas__edge-label")).not.toBeInTheDocument();
    // El contenido completo sigue disponible para accesibilidad.
    expect(container.querySelector(".sr-only")?.textContent).toContain(longLabel);
  });

  it("sin nodes, no muestra ninguna relación inventada (fallback a key_points)", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"]);
    const { container } = render(<ArchitectureVisual {...props({ scene })} />);
    expect(container.querySelector(".diagram-canvas")).not.toBeInTheDocument();
    for (const kp of baseScene.key_points) {
      expect(screen.getByText(kp.text)).toBeInTheDocument();
    }
  });
});

describe("ConceptMapVisual — v1.2.0 diagrama real (DiagramCanvas)", () => {
  it("I/J/K: centro fijo = scene.title, nodos visibles, edges como conector SVG real (nunca lista 'A -> B')", () => {
    const scene = withVisual(baseScene, "concept_map", ["SRC-002"], {
      nodes: [
        { id: "a", label: "Concepto A", description: "", role: null },
        { id: "b", label: "Concepto B", description: "", role: null },
      ],
      edges: [{ from_id: "a", to_id: "b", label: "", relation_type: "relates_to" }],
    });
    const { container } = render(<ConceptMapVisual {...props({ scene })} />);
    expect(container.querySelector(".diagram-canvas__radial-center")).toHaveTextContent(baseScene.title.text);
    expect(screen.getAllByText("Concepto A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Concepto B").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("svg.diagram-canvas__edges line")).toHaveLength(1);
    expect(container.querySelector(".visual-graph__edges")).not.toBeInTheDocument();
    expect(screen.queryByText(/Concepto A.*->.*Concepto B/)).not.toBeInTheDocument();
  });

  it("sin nodes, cae a key_points alrededor de scene.title (robustez ante cache vieja)", () => {
    const scene = withVisual(baseScene, "concept_map", ["SRC-002"]);
    const { container } = render(<ConceptMapVisual {...props({ scene })} />);
    expect(container.querySelector(".diagram-canvas")).not.toBeInTheDocument();
    expect(container.querySelector(".visual-concept-map__center")).toHaveTextContent(baseScene.title.text);
  });
});

describe("ImageVisual — v1.1.0", () => {
  it("renderiza la imagen citada vía source_refs (nunca una URL inventada)", () => {
    const scene = withVisual(baseScene, "image", ["SRC-006"]);
    const { container } = render(<ImageVisual {...props({ scene })} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("architecture.png");
  });

  it("sin bloque de imagen citado, cae a key_points (nunca una imagen rota)", () => {
    const scene = withVisual(baseScene, "image", ["SRC-002"]); // SRC-002 no es imagen
    const { container } = render(<ImageVisual {...props({ scene })} />);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    for (const kp of baseScene.key_points) {
      expect(screen.getByText(kp.text)).toBeInTheDocument();
    }
  });
});
