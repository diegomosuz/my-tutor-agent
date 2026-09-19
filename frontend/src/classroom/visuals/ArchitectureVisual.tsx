import type { VisualComponentProps } from "./types";

/** visual_type = "architecture": usa `visual.nodes`/`visual.edges` (v1.1.0,
 * contenido estructurado real) cuando vienen poblados. React decide el
 * layout (grid de nodos + lista de relaciones) — nunca coordenadas, SVG ni
 * CSS del LLM. Las relaciones mostradas son EXACTAMENTE las declaradas en
 * `edges` (ya validadas estructuralmente contra `nodes` por el backend,
 * ver VisualPlan._graph_edges_reference_declared_nodes): nunca se infiere
 * ni se inventa una conexión adicional. Si `nodes` no viene poblado
 * (robustez ante cache vieja), cae a mostrar `key_points` como componentes
 * sueltos, sin conexiones — comportamiento anterior. */
export function ArchitectureVisual({ scene }: VisualComponentProps) {
  const { nodes, edges } = scene.visual;

  if (nodes.length === 0) {
    const boxes = scene.key_points.length > 0 ? scene.key_points : [scene.title];
    return (
      <div className="visual visual--architecture">
        <h3 className="visual__title">{scene.title.text}</h3>
        <div className="visual-architecture__frame">
          {boxes.map((n, i) => (
            <div key={i} className="visual-architecture__node classroom-stagger-item" style={{ animationDelay: `${0.1 * i}s` }}>
              {n.text}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const labelById = new Map(nodes.map((n) => [n.id, n.label]));

  return (
    <div className="visual visual--architecture">
      <h3 className="visual__title">{scene.title.text}</h3>
      <div className="visual-architecture__frame">
        {nodes.map((node, i) => (
          <div
            key={node.id}
            className="visual-architecture__node classroom-stagger-item"
            style={{ animationDelay: `${0.1 * i}s` }}
          >
            {node.role && <span className="visual-graph__node-role">{node.role}</span>}
            <span className="visual-graph__node-label">{node.label}</span>
            {node.description && <span className="visual-graph__node-desc">{node.description}</span>}
          </div>
        ))}
      </div>
      {edges.length > 0 && (
        <ul className="visual-graph__edges">
          {edges.map((edge, i) => (
            <li key={i} className="classroom-stagger-item" style={{ animationDelay: `${0.1 * (nodes.length + i)}s` }}>
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
