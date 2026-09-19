// Detección de una jerarquía real (root + children) a partir de
// nodes/edges (v1.2.0, bloque "Visual Fidelity", PARTE 2/3). Determinístico,
// sin graph engine general: solo reconoce el patrón más común y útil
// pedagógicamente — un nodo raíz con edges saliendo hacia el resto — y
// degrada de forma segura a "lista plana de hijos" en cualquier otro caso
// (edges ausentes, múltiples candidatos a raíz, ciclos, edges que no
// cubren todos los nodos). Nunca inventa una edge que no exista.
import type { GraphEdge, GraphNode } from "../../types/api";

export interface HierarchyTree {
  /** Nodo raíz real (con label/description propios) cuando las edges
   * forman un patrón "estrella" claro; `null` si se degradó a lista
   * plana (el llamador usa `scene.title` como encabezado en ese caso). */
  root: GraphNode | null;
  children: GraphNode[];
}

export function deriveHierarchyTree(nodes: GraphNode[], edges: GraphEdge[]): HierarchyTree {
  if (nodes.length === 0) {
    return { root: null, children: [] };
  }
  if (edges.length === 0) {
    // Sin edges: todos los nodes son hijos de un encabezado genérico
    // (scene.title) — ya es una mejora real sobre bullets: usa
    // label/description/role de cada node en vez de key_points.
    return { root: null, children: nodes };
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, number>();
  for (const id of nodeIds) incoming.set(id, 0);
  for (const edge of edges) {
    if (!nodeIds.has(edge.from_id) || !nodeIds.has(edge.to_id)) continue;
    incoming.set(edge.to_id, (incoming.get(edge.to_id) ?? 0) + 1);
  }

  const candidateRoots = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  if (candidateRoots.length !== 1) {
    // Ambiguo (ninguna raíz clara, o varias): degradar de forma segura.
    return { root: null, children: nodes };
  }
  const root = candidateRoots[0];
  const rest = nodes.filter((n) => n.id !== root.id);

  // Patrón "estrella": TODAS las edges deben salir directamente de la
  // raíz hacia el resto (nunca asumimos más de un nivel a partir de una
  // estructura de datos plana — ver limitaciones en docs/VISUAL_FIDELITY.md).
  const isStarFromRoot = edges.every((edge) => edge.from_id === root.id && nodeIds.has(edge.to_id));
  if (!isStarFromRoot) {
    return { root: null, children: nodes };
  }

  return { root, children: rest };
}
