// Pedagogical Animations v1 (v1.2.0, bloque "Pedagogical Animations").
//
// PRINCIPIO ARQUITECTÓNICO (ver docs/PEDAGOGICAL_ANIMATIONS.md): la
// animación se DERIVA determinísticamente de un VisualPlan ya validado por
// el backend -- nunca la genera el LLM. `buildAnimationSequence` es una
// función pura (sin React, sin timers, sin efectos secundarios,
// testeable sin browser): mismo `LessonScene` -> mismo `AnimationSequence`,
// siempre. El LLM decide QUÉ contenido/nodes/edges/steps existen; esta
// función decide únicamente CÓMO revelarlos en el tiempo.
import type { GraphEdge, GraphNode, LessonScene, VisualType } from "../types/api";
import { deriveHierarchyTree } from "./visuals/hierarchyTree";

/** Acciones cerradas -- nunca CSS arbitrario, nunca nombres de clase
 * generados externamente. "reveal": el elemento pasa de oculto a visible.
 * "highlight": un elemento ya visible recibe énfasis transitorio (no usado
 * en v1, reservado para casos futuros -- ver limitaciones). "connect":
 * un edge y su nodo destino aparecen juntos (el origen ya era visible). */
export type AnimationAction = "reveal" | "highlight" | "connect";

/** A qué se refiere un elemento animable. "step"/"connector" son de
 * `process`; "node"/"edge" son de los diagramas (architecture/concept_map/
 * hierarchy); "group" es un conjunto de elementos de comparison/hierarchy
 * que deben aparecer simultáneamente (ver PARTE 10/7 de la especificación:
 * nunca revelar un lado de una comparación mucho después que el otro, y
 * nunca implicar causalidad entre siblings de una hierarchy). */
export interface AnimationElementRef {
  kind: "step" | "connector" | "node" | "edge" | "group";
  /** Id estable: `node.id` real para nodes/edges de diagramas,
   * `step-{i}`/`connector-{i}` para process, `row-{i}`/`columns` para
   * comparison. Nunca un índice puro sin prefijo (evita colisiones entre
   * kinds distintos que compartan el mismo índice numérico). */
  id: string;
}

export interface AnimationStep {
  elements: AnimationElementRef[];
  action: AnimationAction;
}

/** Metadata informativa sobre el tipo de secuencia -- el controller
 * procesa `steps` igual sin importar `mode` (nunca cambia el
 * comportamiento del hook); existe para documentación/QA/tests, para
 * dejar explícito cuándo una secuencia implica progresión real
 * (`progressive`) vs. un agrupamiento sin orden semántico
 * (`neutral`/`simultaneous`) vs. ausencia de animación (`none`). */
export type AnimationMode = "progressive" | "neutral" | "simultaneous" | "none";

export interface AnimationSequence {
  mode: AnimationMode;
  steps: AnimationStep[];
}

const NONE_SEQUENCE: AnimationSequence = { mode: "none", steps: [] };

/** visual_type con algoritmo de animación pedagógica en v1 -- exactamente
 * el foco de la especificación (PARTE 12): process, hierarchy,
 * architecture, concept_map, comparison. Todo lo demás (bullets, hero,
 * code, quote, image, none, table) devuelve `NONE_SEQUENCE`: la transición
 * CSS existente (`classroom-stagger-item`/`classroom-scene-enter`) sigue
 * aplicando sin cambios -- eso es transición visual, no la animación
 * pedagógica nueva (ver PARTE 2). `table` queda deliberadamente fuera:
 * no está en el foco de la especificación y depende del SourceBlock
 * resuelto vía `lookupSourceBlock`, que rompería la pureza de esta
 * función (LessonScene -> AnimationSequence, sin dependencias externas). */
const ANIMATED_VISUAL_TYPES: ReadonlySet<VisualType> = new Set([
  "process",
  "hierarchy",
  "architecture",
  "concept_map",
  "comparison",
]);

export function buildAnimationSequence(scene: LessonScene): AnimationSequence {
  const visualType = scene.visual.visual_type;
  if (!ANIMATED_VISUAL_TYPES.has(visualType)) return NONE_SEQUENCE;

  switch (visualType) {
    case "process":
      return buildProcessSequence(scene);
    case "hierarchy":
      return buildHierarchySequence(scene);
    case "architecture":
      return buildArchitectureSequence(scene);
    case "concept_map":
      return buildConceptMapSequence(scene);
    case "comparison":
      return buildComparisonSequence(scene);
    default:
      return NONE_SEQUENCE;
  }
}

// ---------------------------------------------------------------------
// PROCESS (PARTE 5): step 1 -> connector 1 -> step 2 -> connector 2 -> ...
// Nunca muestra todos los pasos de golpe. Con 0 o 1 paso, secuenciar no
// aporta nada real (no hay progresión que mostrar) -- se devuelve
// NONE_SEQUENCE, un fallback seguro (PARTE 30, test #2).
// ---------------------------------------------------------------------
function buildProcessSequence(scene: LessonScene): AnimationSequence {
  const stepCount =
    scene.visual.process_steps.length > 0
      ? scene.visual.process_steps.length
      : (scene.key_points.length > 0 ? scene.key_points.length : 1);
  if (stepCount <= 1) return NONE_SEQUENCE;

  const steps: AnimationStep[] = [];
  for (let i = 0; i < stepCount; i++) {
    steps.push({ elements: [{ kind: "step", id: `step-${i}` }], action: "reveal" });
    if (i < stepCount - 1) {
      steps.push({ elements: [{ kind: "connector", id: `connector-${i}` }], action: "reveal" });
    }
  }
  return { mode: "progressive", steps };
}

// ---------------------------------------------------------------------
// HIERARCHY (PARTE 6/7): root -> children, SIEMPRE como un único grupo
// simultáneo para los children (nunca child A -> child B -> child C, que
// implicaría causalidad entre siblings que la fuente no establece). Si no
// hay una raíz estructural clara (deuda conocida, ver PARTE 7 y
// docs/VISUAL_SELECTION.md sección 15.11: nodes pares con 0 edges es
// indistinguible de una jerarquía plana legítima), se degrada a un reveal
// neutro de TODOS los nodes como un solo grupo -- nunca se infiere semántica
// nueva, nunca se inventa una relación padre/hijo que el VisualPlan no
// estableció.
// ---------------------------------------------------------------------
function buildHierarchySequence(scene: LessonScene): AnimationSequence {
  const { nodes, edges } = scene.visual;
  if (nodes.length === 0) return NONE_SEQUENCE;

  const tree = deriveHierarchyTree(nodes, edges);

  if (!tree.root) {
    // Ambiguo: reveal neutro/simultáneo de todos los nodes (PARTE 7).
    return {
      mode: "neutral",
      steps: [
        {
          elements: nodes.map((n) => ({ kind: "node", id: n.id })),
          action: "reveal",
        },
      ],
    };
  }

  const children = tree.children.length > 0 ? tree.children : [];
  const steps: AnimationStep[] = [{ elements: [{ kind: "node", id: tree.root.id }], action: "reveal" }];
  if (children.length > 0) {
    steps.push({
      elements: children.map((n) => ({ kind: "node", id: n.id })),
      action: "reveal",
    });
  }
  return { mode: "progressive", steps };
}

// ---------------------------------------------------------------------
// ARCHITECTURE (PARTE 8): BFS/topological reveal SOLO si el grafo tiene
// una raíz inequívoca (indegree 0, única) y esa raíz alcanza a TODOS los
// nodes -- un criterio de seguridad computable sin ambigüedad: si algún
// node queda inalcanzado, el "traversal" dejaría de ser determinísticamente
// justificable por la propia estructura y se cae al fallback. Nunca se
// convierte el orden del array en causalidad (PARTE 8, última línea).
// ---------------------------------------------------------------------
function buildArchitectureSequence(scene: LessonScene): AnimationSequence {
  const { nodes, edges } = scene.visual;
  if (nodes.length === 0) return NONE_SEQUENCE;
  if (edges.length === 0) {
    return { mode: "neutral", steps: [{ elements: nodes.map((n) => ({ kind: "node", id: n.id })), action: "reveal" }] };
  }

  const traversal = safeBfsTraversal(nodes, edges);
  if (!traversal) {
    // Sin raíz inequívoca o no alcanza a todos los nodes: revelar todos
    // los nodes primero, después todas las edges (PARTE 8, fallback).
    return {
      mode: "neutral",
      steps: [
        { elements: nodes.map((n) => ({ kind: "node", id: n.id })), action: "reveal" },
        { elements: edges.map((_, i) => ({ kind: "edge", id: edgeElementId(i) })), action: "reveal" },
      ],
    };
  }

  const steps: AnimationStep[] = [{ elements: [{ kind: "node", id: traversal.rootId }], action: "reveal" }];
  for (const hop of traversal.hops) {
    // "connect": edge + nodo destino aparecen juntos (PARTE 24) -- el
    // origen ya es visible por una etapa anterior del propio traversal.
    steps.push({
      elements: [
        { kind: "edge", id: edgeElementId(hop.edgeIndex) },
        { kind: "node", id: hop.toId },
      ],
      action: "connect",
    });
  }
  return { mode: "progressive", steps };
}

interface BfsHop {
  edgeIndex: number;
  toId: string;
}

interface BfsTraversal {
  rootId: string;
  hops: BfsHop[];
}

/** Devuelve `null` si no hay una raíz inequívoca (indegree 0, única) o si
 * el BFS desde esa raíz no alcanza a todos los nodes -- ambos son señales
 * de que "convertir el array en un traversal" ya no sería seguro/honesto. */
function safeBfsTraversal(nodes: GraphNode[], edges: GraphEdge[]): BfsTraversal | null {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const indegree = new Map<string, number>();
  for (const id of nodeIds) indegree.set(id, 0);
  for (const edge of edges) {
    if (!nodeIds.has(edge.from_id) || !nodeIds.has(edge.to_id)) continue;
    indegree.set(edge.to_id, (indegree.get(edge.to_id) ?? 0) + 1);
  }
  const roots = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0);
  if (roots.length !== 1) return null;
  const rootId = roots[0].id;

  // Adyacencia en el orden ORIGINAL de `edges` -- determinístico, nunca
  // reordena por peso/alfabético/heurística alguna.
  const adjacency = new Map<string, Array<{ edgeIndex: number; toId: string }>>();
  edges.forEach((edge, i) => {
    if (!nodeIds.has(edge.from_id) || !nodeIds.has(edge.to_id)) return;
    const list = adjacency.get(edge.from_id) ?? [];
    list.push({ edgeIndex: i, toId: edge.to_id });
    adjacency.set(edge.from_id, list);
  });

  const visited = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  const hops: BfsHop[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) ?? [];
    for (const { edgeIndex, toId } of neighbors) {
      if (visited.has(toId)) continue;
      visited.add(toId);
      hops.push({ edgeIndex, toId });
      queue.push(toId);
    }
  }

  if (visited.size !== nodes.length) return null; // no alcanza a todos: fallback
  return { rootId, hops };
}

function edgeElementId(index: number): string {
  return `edge-${index}`;
}

// ---------------------------------------------------------------------
// CONCEPT MAP (PARTE 9): centro (scene.title) siempre visible de
// inmediato -- no forma parte de la secuencia, igual que DiagramCanvas ya
// lo trata como un elemento fijo, no un GraphNode. Nodos relacionados se
// revelan como grupo (stagger corto de PRESENTACIÓN, nunca implica
// "paso 1/2/3"), luego las conexiones. Nunca se anima como flujo
// direccional salvo pedido explícito futuro (fuera de alcance v1 -- ver
// limitaciones).
// ---------------------------------------------------------------------
function buildConceptMapSequence(scene: LessonScene): AnimationSequence {
  const { nodes, edges } = scene.visual;
  if (nodes.length === 0) return NONE_SEQUENCE;

  const steps: AnimationStep[] = [
    { elements: nodes.map((n) => ({ kind: "node", id: n.id })), action: "reveal" },
  ];
  if (edges.length > 0) {
    steps.push({
      elements: edges.map((_, i) => ({ kind: "edge", id: edgeElementId(i) })),
      action: "reveal",
    });
  }
  return { mode: "neutral", steps };
}

// ---------------------------------------------------------------------
// COMPARISON (PARTE 10): simultaneidad, nunca "A y mucho después B".
// - Tabla real (`rows`): header primero, luego cada fila como UN solo
//   paso (todas sus columnas juntas) -- progresión válida es entre FILAS,
//   nunca entre columnas de una misma fila.
// - Cards (`columns` o legacy): todas las columnas/cards en un único paso
//   simultáneo -- no existe un concepto de "fila" en este modo, así que no
//   hay nada que secuenciar sin inventar un orden que la fuente no da.
// ---------------------------------------------------------------------
function buildComparisonSequence(scene: LessonScene): AnimationSequence {
  const comparison = scene.visual.comparison;
  if (!comparison) return NONE_SEQUENCE;

  if (comparison.rows.length > 0) {
    const steps: AnimationStep[] = [
      { elements: [{ kind: "group", id: "comparison-header" }], action: "reveal" },
    ];
    comparison.rows.forEach((_, i) => {
      steps.push({ elements: [{ kind: "group", id: `row-${i}` }], action: "reveal" });
    });
    return { mode: "progressive", steps };
  }

  // Cards: columnas reales o legacy (ambas sin dato de fila) -- un solo
  // paso simultáneo.
  return {
    mode: "simultaneous",
    steps: [{ elements: [{ kind: "group", id: "comparison-columns" }], action: "reveal" }],
  };
}
