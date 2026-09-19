import type { VisualComponentProps } from "./types";
import { deriveHierarchyTree } from "./hierarchyTree";

/** visual_type = "hierarchy" (v1.2.0, bloque "Visual Fidelity" — bug real
 * corregido: antes este componente ignoraba completamente `visual.nodes`/
 * `visual.edges` y usaba siempre `key_points`, incluso cuando el LLM ya
 * había producido nodos bien estructurados con label/description/role).
 *
 * Ahora `nodes` es la fuente PRIMARIA cuando viene poblado:
 * - si las `edges` forman un patrón "raíz -> hijos" claro (ver
 *   `hierarchyTree.ts`), se muestra esa raíz real + sus hijos;
 * - si no hay edges, o son ambiguas, se degrada de forma segura a una
 *   lista plana de `nodes` bajo `scene.title` como encabezado — sigue
 *   siendo una mejora real sobre el key_points genérico de antes;
 * - si `nodes` viene vacío (LessonPlan vieja en cache, anterior a este
 *   bloque), cae exactamente al comportamiento legacy: `key_points` como
 *   hijos de `scene.title`. Compatibilidad hacia atrás total. */
export function HierarchyVisual({ scene }: VisualComponentProps) {
  const { nodes, edges } = scene.visual;
  const hasStructuredNodes = nodes.length > 0;
  const tree = hasStructuredNodes ? deriveHierarchyTree(nodes, edges) : null;

  const rootLabel = tree?.root ? tree.root.label : scene.title.text;
  const children = hasStructuredNodes
    ? (tree!.children.length > 0 ? tree!.children : nodes)
    : null;

  return (
    <div className="visual visual--hierarchy">
      <div className="visual-hierarchy__root">{rootLabel}</div>
      {hasStructuredNodes ? (
        children!.length > 0 && (
          <>
            <div className="visual-hierarchy__trunk" aria-hidden="true" />
            <div className="visual-hierarchy__children">
              {children!.map((node, i) => (
                <div
                  key={node.id}
                  className="visual-hierarchy__child classroom-stagger-item"
                  style={{ animationDelay: `${0.1 * i}s` }}
                >
                  <span className="visual-hierarchy__connector" aria-hidden="true" />
                  <span className="visual-hierarchy__child-text">
                    {node.role && <span className="visual-graph__node-role">{node.role}</span>}
                    <span className="visual-graph__node-label">{node.label}</span>
                    {node.description && (
                      <span className="visual-graph__node-desc">{node.description}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )
      ) : (
        scene.key_points.length > 0 && (
          <>
            <div className="visual-hierarchy__trunk" aria-hidden="true" />
            <div className="visual-hierarchy__children">
              {scene.key_points.map((kp, i) => (
                <div
                  key={i}
                  className="visual-hierarchy__child classroom-stagger-item"
                  style={{ animationDelay: `${0.1 * i}s` }}
                >
                  <span className="visual-hierarchy__connector" aria-hidden="true" />
                  {kp.text}
                </div>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
