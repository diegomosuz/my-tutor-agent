import type { VisualComponentProps } from "./types";

/** visual_type = "concept_map": scene.title como concepto central,
 * `visual.nodes` como conceptos relacionados radiando alrededor (v1.1.0:
 * antes eran `key_points` genéricos). Si además hay `edges` ENTRE dos
 * conceptos relacionados (no hacia el centro), se listan aparte como
 * relaciones explícitas — nunca se inventa una relación que `edges` no
 * declare. Visualmente distinto de `architecture` (radial vs. grid) para
 * remarcar que es un mapa conceptual, no un diagrama técnico. Si `nodes`
 * no viene poblado (robustez ante cache vieja), cae a `key_points`. */
export function ConceptMapVisual({ scene }: VisualComponentProps) {
  const { nodes, edges } = scene.visual;
  const related = nodes.length > 0 ? nodes : scene.key_points.map((kp, i) => ({ id: `kp-${i}`, label: kp.text, description: "", role: null }));
  const labelById = new Map(related.map((n) => [n.id, n.label]));

  return (
    <div className="visual visual--concept-map">
      <div className="visual-concept-map__center">{scene.title.text}</div>
      {related.length > 0 && (
        <div className="visual-concept-map__related">
          {related.map((node, i) => (
            <div
              key={node.id}
              className="visual-concept-map__node classroom-stagger-item"
              style={{ animationDelay: `${0.1 * i}s` }}
            >
              <span className="visual-concept-map__stem" aria-hidden="true" />
              {node.label}
            </div>
          ))}
        </div>
      )}
      {edges.length > 0 && (
        <ul className="visual-graph__edges visual-concept-map__edges">
          {edges.map((edge, i) => (
            <li key={i} className="classroom-stagger-item" style={{ animationDelay: `${0.1 * (related.length + i)}s` }}>
              <span className="visual-graph__edge-from">{labelById.get(edge.from_id) ?? edge.from_id}</span>
              <span className="visual-graph__edge-arrow" aria-hidden="true">
                →
              </span>
              <span className="visual-graph__edge-to">{labelById.get(edge.to_id) ?? edge.to_id}</span>
              {edge.label && <span className="visual-graph__edge-label">{edge.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
