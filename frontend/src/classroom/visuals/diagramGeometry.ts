// Geometría de diagramas (v1.2.0, bloque "Visual Fidelity"): calcula
// posiciones REALES de conectores entre nodos midiendo el DOM ya
// renderizado por React (getBoundingClientRect), nunca coordenadas
// entregadas por el LLM. Compartido por ArchitectureVisual/ConceptMapVisual
// (y, indirectamente, por HierarchyVisual cuando arma un árbol real).
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { GraphEdge, RelationType } from "../../types/api";

export interface Point {
  x: number;
  y: number;
}

export interface EdgeLine {
  key: string;
  /** Índice ORIGINAL de esta edge en `edges` (v1.2.0, bloque "Pedagogical
   * Animations") — estable incluso si `lines` termina filtrando alguna
   * edge cuyos extremos no montaron; es lo que `buildAnimationSequence`
   * usa como id (`edge-{index}`) para referenciar esta misma edge. */
  edgeIndex: number;
  from: Point;
  to: Point;
  label: string;
  relationType: RelationType;
  directed: boolean;
}

/** relation_type -> ¿tiene dirección real que vale la pena flechar? "relates_to"
 * es simétrico por definición (sin dirección semántica) — el resto sí. */
const DIRECTED_RELATIONS = new Set<RelationType>([
  "depends_on",
  "flows_to",
  "contains",
  "part_of",
]);

/** Límite de presentación (PARTE 8): un label de edge largo no debe romper
 * el diagrama — se omite visualmente (el contenido completo sigue
 * disponible vía el texto accesible que arma cada visual). */
const MAX_INLINE_EDGE_LABEL_LENGTH = 24;

export function edgeLabelForDisplay(label: string): string | null {
  if (!label) return null;
  return label.length <= MAX_INLINE_EDGE_LABEL_LENGTH ? label : null;
}

/**
 * Mide, en cada render/resize, el centro real de cada nodo registrado
 * (vía `registerNode`) relativo al contenedor del diagrama, y arma las
 * líneas de las `edges` declaradas. Nunca inventa una edge: si un nodo
 * referenciado todavía no montó (no debería pasar — VisualPlan ya
 * garantiza que from_id/to_id existen en nodes), esa edge simplemente se
 * omite de forma segura en vez de romper el render.
 */
export function useDiagramEdgeGeometry(edges: GraphEdge[]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [lines, setLines] = useState<EdgeLine[]>([]);

  const registerNode = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodeElsRef.current.set(id, el);
      else nodeElsRef.current.delete(id);
    },
    []
  );

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const next: EdgeLine[] = [];
    edges.forEach((edge, i) => {
      const fromEl = nodeElsRef.current.get(edge.from_id);
      const toEl = nodeElsRef.current.get(edge.to_id);
      if (!fromEl || !toEl) return; // degradación segura: nunca crashea, nunca inventa
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      next.push({
        key: `${edge.from_id}->${edge.to_id}-${i}`,
        edgeIndex: i,
        from: {
          x: fromRect.left + fromRect.width / 2 - containerRect.left,
          y: fromRect.top + fromRect.height / 2 - containerRect.top,
        },
        to: {
          x: toRect.left + toRect.width / 2 - containerRect.left,
          y: toRect.top + toRect.height / 2 - containerRect.top,
        },
        label: edge.label,
        relationType: edge.relation_type,
        directed: DIRECTED_RELATIONS.has(edge.relation_type),
      });
    });
    setLines(next);
  }, [edges]);

  useLayoutEffect(() => {
    recompute();
    const container = containerRef.current;
    // jsdom (tests) no implementa ResizeObserver: se degrada a "solo
    // recalcula al montar", nunca rompe el render (PARTE 5: resize
    // recalcula en navegadores reales, donde sí existe).
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => recompute());
    observer.observe(container);
    return () => observer.disconnect();
  }, [recompute]);

  return { containerRef, registerNode, lines };
}

const RELATION_TEXT: Record<RelationType, string> = {
  connects_to: "se conecta con",
  depends_on: "depende de",
  contains: "contiene a",
  flows_to: "fluye hacia",
  relates_to: "se relaciona con",
  part_of: "es parte de",
};

/** Texto plano de una relación, para la representación accesible
 * (PARTE 29) — nunca reemplaza al diagrama visual, lo acompaña. */
export function relationText(relationType: RelationType): string {
  return RELATION_TEXT[relationType] ?? "se relaciona con";
}
