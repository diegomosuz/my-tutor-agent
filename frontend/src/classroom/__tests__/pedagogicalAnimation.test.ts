// Tests puros de buildAnimationSequence (PARTE 30 de la especificación de
// Pedagogical Animations): sin browser, sin timers, sin React. Cada test
// confirma determinismo estructural, nunca contenido pedagógico (eso ya
// lo cubre el backend).
import { describe, expect, it } from "vitest";
import { buildAnimationSequence } from "../pedagogicalAnimation";
import { SAMPLE_LESSON, withVisual } from "./fixtures";

const baseScene = SAMPLE_LESSON.scenes[1];

// --------------------------------------------------------------------
// PROCESS
// --------------------------------------------------------------------
describe("buildAnimationSequence — process", () => {
  it("1. 3 steps -> orden correcto: step, connector, step, connector, step", () => {
    const scene = withVisual(baseScene, "process", ["SRC-002"], {
      process_steps: [
        { label: "Paso 1", detail: "" },
        { label: "Paso 2", detail: "" },
        { label: "Paso 3", detail: "" },
      ],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("progressive");
    expect(sequence.steps.map((s) => s.elements[0].id)).toEqual([
      "step-0",
      "connector-0",
      "step-1",
      "connector-1",
      "step-2",
    ]);
    expect(sequence.steps.every((s) => s.action === "reveal")).toBe(true);
  });

  it("2. 1 step -> no animation segura (mode none, sin steps)", () => {
    const scene = withVisual(baseScene, "process", ["SRC-002"], {
      process_steps: [{ label: "Único paso", detail: "" }],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence).toEqual({ mode: "none", steps: [] });
  });

  it("0 steps (ni process_steps ni key_points) -> no animation segura", () => {
    const scene = withVisual(baseScene, "process", ["SRC-002"], { process_steps: [] });
    const emptyKeyPoints = { ...scene, key_points: [] };
    const sequence = buildAnimationSequence(emptyKeyPoints);
    // Con 0 process_steps y 0 key_points, el fallback interno usa
    // scene.title (1 elemento) -> sigue siendo <=1, no animation.
    expect(sequence.mode).toBe("none");
  });
});

// --------------------------------------------------------------------
// HIERARCHY
// --------------------------------------------------------------------
describe("buildAnimationSequence — hierarchy", () => {
  it("3. root + children -> root primero, children después (grupo simultáneo)", () => {
    const scene = withVisual(baseScene, "hierarchy", ["SRC-002"], {
      nodes: [
        { id: "root", label: "Categoría", description: "", role: null },
        { id: "child-1", label: "Subcategoría 1", description: "", role: null },
        { id: "child-2", label: "Subcategoría 2", description: "", role: null },
      ],
      edges: [
        { from_id: "root", to_id: "child-1", label: "", relation_type: "contains" },
        { from_id: "root", to_id: "child-2", label: "", relation_type: "contains" },
      ],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("progressive");
    expect(sequence.steps).toHaveLength(2);
    expect(sequence.steps[0].elements).toEqual([{ kind: "node", id: "root" }]);
    const childIds = sequence.steps[1].elements.map((e) => e.id).sort();
    expect(childIds).toEqual(["child-1", "child-2"]);
    // Nunca se secuencian los children entre sí: un único step-grupo.
    expect(sequence.steps).toHaveLength(2);
  });

  it("4. ambigua (0 edges) -> no inventa jerarquía, reveal neutro/simultáneo de todos los nodes", () => {
    const scene = withVisual(baseScene, "hierarchy", ["SRC-002"], {
      nodes: [
        { id: "nivel-1", label: "Nivel 1", description: "", role: null },
        { id: "nivel-2", label: "Nivel 2", description: "", role: null },
        { id: "nivel-3", label: "Nivel 3", description: "", role: null },
      ],
      edges: [],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("neutral");
    expect(sequence.steps).toHaveLength(1);
    expect(sequence.steps[0].elements.map((e) => e.id).sort()).toEqual([
      "nivel-1",
      "nivel-2",
      "nivel-3",
    ]);
  });

  it("ambigua (múltiples raíces candidatas) -> también degrada a reveal neutro", () => {
    const scene = withVisual(baseScene, "hierarchy", ["SRC-002"], {
      nodes: [
        { id: "a", label: "A", description: "", role: null },
        { id: "b", label: "B", description: "", role: null },
      ],
      edges: [], // sin edges -> indegree 0 para ambos -> ambiguo
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("neutral");
  });

  it("sin nodes -> no animation segura", () => {
    const scene = withVisual(baseScene, "hierarchy", ["SRC-002"], { nodes: [], edges: [] });
    expect(buildAnimationSequence(scene)).toEqual({ mode: "none", steps: [] });
  });
});

// --------------------------------------------------------------------
// ARCHITECTURE
// --------------------------------------------------------------------
describe("buildAnimationSequence — architecture", () => {
  it("5. DAG con raíz inequívoca -> traversal BFS determinístico", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "cliente", label: "Cliente", description: "", role: null },
        { id: "api", label: "API", description: "", role: null },
        { id: "servicio", label: "Servicio", description: "", role: null },
      ],
      edges: [
        { from_id: "cliente", to_id: "api", label: "", relation_type: "connects_to" },
        { from_id: "api", to_id: "servicio", label: "", relation_type: "connects_to" },
      ],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("progressive");
    expect(sequence.steps[0].elements).toEqual([{ kind: "node", id: "cliente" }]);
    expect(sequence.steps[1]).toEqual({
      elements: [
        { kind: "edge", id: "edge-0" },
        { kind: "node", id: "api" },
      ],
      action: "connect",
    });
    expect(sequence.steps[2]).toEqual({
      elements: [
        { kind: "edge", id: "edge-1" },
        { kind: "node", id: "servicio" },
      ],
      action: "connect",
    });
  });

  it("6. grafo sin raíz inequívoca (ciclo / múltiples raíces) -> reveal neutro: todos los nodes, luego todas las edges", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "a", label: "A", description: "", role: null },
        { id: "b", label: "B", description: "", role: null },
      ],
      edges: [
        { from_id: "a", to_id: "b", label: "", relation_type: "connects_to" },
        { from_id: "b", to_id: "a", label: "", relation_type: "connects_to" }, // ciclo: ambos indegree 1
      ],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("neutral");
    expect(sequence.steps).toHaveLength(2);
    expect(sequence.steps[0].elements.map((e) => e.kind)).toEqual(["node", "node"]);
    expect(sequence.steps[1].elements.map((e) => e.kind)).toEqual(["edge", "edge"]);
  });

  it("raíz inequívoca pero un node desconectado (no alcanzable) -> reveal neutro (no traversal parcial)", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [
        { id: "a", label: "A", description: "", role: null },
        { id: "b", label: "B", description: "", role: null },
        { id: "isla", label: "Isla", description: "", role: null },
      ],
      edges: [{ from_id: "a", to_id: "b", label: "", relation_type: "connects_to" }],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("neutral");
  });

  it("sin edges -> reveal neutro de todos los nodes (nada que traversar)", () => {
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], {
      nodes: [{ id: "a", label: "A", description: "", role: null }],
      edges: [],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("neutral");
    expect(sequence.steps).toHaveLength(1);
  });
});

// --------------------------------------------------------------------
// CONCEPT MAP
// --------------------------------------------------------------------
describe("buildAnimationSequence — concept_map", () => {
  it("7. centro + relacionados -> sin falsa temporalidad (mode neutral, nodes en un solo grupo)", () => {
    const scene = withVisual(baseScene, "concept_map", ["SRC-002"], {
      nodes: [
        { id: "a", label: "Concepto A", description: "", role: null },
        { id: "b", label: "Concepto B", description: "", role: null },
      ],
      edges: [{ from_id: "a", to_id: "b", label: "", relation_type: "relates_to" }],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("neutral");
    expect(sequence.steps).toHaveLength(2); // nodes (grupo), luego edges (grupo)
    expect(sequence.steps[0].elements.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(sequence.steps[1].elements).toEqual([{ kind: "edge", id: "edge-0" }]);
  });

  it("sin edges -> un único paso de nodes, sin paso de edges", () => {
    const scene = withVisual(baseScene, "concept_map", ["SRC-002"], {
      nodes: [{ id: "a", label: "A", description: "", role: null }],
      edges: [],
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.steps).toHaveLength(1);
  });
});

// --------------------------------------------------------------------
// COMPARISON
// --------------------------------------------------------------------
describe("buildAnimationSequence — comparison", () => {
  it("8. dos columnas (cards) -> pares/columnas simultáneas en un único paso", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"], {
      comparison: {
        column_labels: ["Antes", "Después"],
        rows: [],
        columns: [
          { title: "Antes", points: ["x"] },
          { title: "Después", points: ["y"] },
        ],
      },
    });
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("simultaneous");
    expect(sequence.steps).toHaveLength(1);
    expect(sequence.steps[0].elements).toEqual([{ kind: "group", id: "comparison-columns" }]);
  });

  it("9. comparison table (rows) -> header + filas progresivas, nunca todas de golpe", () => {
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
    const sequence = buildAnimationSequence(scene);
    expect(sequence.mode).toBe("progressive");
    expect(sequence.steps.map((s) => s.elements[0].id)).toEqual([
      "comparison-header",
      "row-0",
      "row-1",
    ]);
    // Cada fila es UN solo elemento de grupo (todas sus columnas juntas).
    expect(sequence.steps[1].elements).toHaveLength(1);
  });

  it("comparison null -> no animation segura", () => {
    const scene = withVisual(baseScene, "comparison", ["SRC-002"], { comparison: null });
    expect(buildAnimationSequence(scene)).toEqual({ mode: "none", steps: [] });
  });
});

// --------------------------------------------------------------------
// GENERAL
// --------------------------------------------------------------------
describe("buildAnimationSequence — general", () => {
  it("10. determinismo: la misma escena produce siempre la misma secuencia", () => {
    const scene = withVisual(baseScene, "process", ["SRC-002"], {
      process_steps: [
        { label: "A", detail: "" },
        { label: "B", detail: "" },
      ],
    });
    const first = buildAnimationSequence(scene);
    const second = buildAnimationSequence(scene);
    expect(first).toEqual(second);
  });

  it("11. no muta el input (scene/nodes/edges)", () => {
    const nodes = [
      { id: "a", label: "A", description: "", role: null },
      { id: "b", label: "B", description: "", role: null },
    ];
    const edges = [{ from_id: "a", to_id: "b", label: "", relation_type: "connects_to" as const }];
    const scene = withVisual(baseScene, "architecture", ["SRC-002"], { nodes, edges });
    const snapshotNodes = JSON.parse(JSON.stringify(scene.visual.nodes));
    const snapshotEdges = JSON.parse(JSON.stringify(scene.visual.edges));
    buildAnimationSequence(scene);
    expect(scene.visual.nodes).toEqual(snapshotNodes);
    expect(scene.visual.edges).toEqual(snapshotEdges);
  });

  it("12. visual_type sin algoritmo de animación (bullets/hero/table/etc.) -> siempre no animation, nunca crashea", () => {
    for (const visualType of ["bullets", "hero", "code", "quote", "image", "none", "table"] as const) {
      const scene = withVisual(baseScene, visualType, ["SRC-002"]);
      expect(buildAnimationSequence(scene)).toEqual({ mode: "none", steps: [] });
    }
  });

  it("datos inesperados: nodes/edges vacíos en cada visual_type animado -> fallback seguro, nunca crashea", () => {
    for (const visualType of ["process", "hierarchy", "architecture", "concept_map"] as const) {
      const scene = withVisual(baseScene, visualType, ["SRC-002"], {
        process_steps: [],
        nodes: [],
        edges: [],
      });
      const emptyKeyPoints = { ...scene, key_points: [] };
      expect(() => buildAnimationSequence(emptyKeyPoints)).not.toThrow();
    }
  });
});
