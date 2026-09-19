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
      comparison: { column_labels: ["Concepto A", "Concepto B"], rows: [] },
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
});

describe("ArchitectureVisual — v1.1.0 nodes/edges", () => {
  it("renderiza nodos y relaciones EXACTAMENTE como fueron declaradas, sin inventar conexiones", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "api", label: "API Gateway", description: "", role: "component" },
        { id: "db", label: "Base de datos", description: "", role: "datastore" },
      ],
      edges: [{ from_id: "api", to_id: "db", label: "consulta", relation_type: "connects_to" }],
    });
    render(<ArchitectureVisual {...props({ scene })} />);
    expect(screen.getAllByText("API Gateway").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Base de datos").length).toBeGreaterThan(0);
    expect(screen.getByText("consulta")).toBeInTheDocument();
    // Solo una relación declarada -> solo un ítem en la lista de aristas.
    const edgeItems = document.querySelectorAll(".visual-graph__edges li");
    expect(edgeItems).toHaveLength(1);
  });

  it("sin nodes, no muestra ninguna relación inventada (fallback a key_points)", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"]);
    const { container } = render(<ArchitectureVisual {...props({ scene })} />);
    expect(container.querySelector(".visual-graph__edges")).not.toBeInTheDocument();
    for (const kp of baseScene.key_points) {
      expect(screen.getByText(kp.text)).toBeInTheDocument();
    }
  });
});

describe("ConceptMapVisual — v1.1.0 nodes/edges", () => {
  it("distingue visualmente de architecture (radial, no grid) y muestra relaciones declaradas", () => {
    const scene = withVisual(baseScene, "concept_map", ["SRC-002"], {
      nodes: [
        { id: "a", label: "Concepto A", description: "", role: null },
        { id: "b", label: "Concepto B", description: "", role: null },
      ],
      edges: [{ from_id: "a", to_id: "b", label: "", relation_type: "relates_to" }],
    });
    const { container } = render(<ConceptMapVisual {...props({ scene })} />);
    expect(container.querySelector(".visual-concept-map__center")).toHaveTextContent(baseScene.title.text);
    expect(screen.getAllByText("Concepto A").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".visual-graph__edges li")).toHaveLength(1);
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
