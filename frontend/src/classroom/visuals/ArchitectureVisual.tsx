import type { VisualComponentProps } from "./types";
import { DiagramCanvas } from "./DiagramCanvas";

/** visual_type = "architecture" (v1.2.0, bloque "Visual Fidelity" — antes
 * las `edges` se mostraban como una lista de texto "A -> B" separada de
 * los nodos, nunca como un diagrama real). Ahora usa `DiagramCanvas`
 * (layout "grid"): los nodos se ubican en una grilla CSS responsiva y las
 * relaciones declaradas en `edges` se dibujan como conectores SVG REALES,
 * calculados por React a partir de las posiciones medidas de los nodos ya
 * renderizados — nunca coordenadas, SVG, ni markup entregado por el LLM.
 * Las relaciones mostradas son EXACTAMENTE las declaradas en `edges` (ya
 * validadas estructuralmente contra `nodes` por el backend, ver
 * `VisualPlan._graph_edges_reference_declared_nodes`): nunca se infiere ni
 * se inventa una conexión adicional. Si `nodes` no viene poblado
 * (robustez ante cache vieja), cae a mostrar `key_points` como componentes
 * sueltos, sin conexiones — comportamiento anterior a v1.1.0. */
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

  return (
    <div className="visual visual--architecture">
      <h3 className="visual__title">{scene.title.text}</h3>
      <DiagramCanvas
        nodes={nodes}
        edges={edges}
        layout="grid"
        nodesClassName="visual-architecture__frame"
        renderNode={(node) => (
          <div className="visual-architecture__node">
            {node.role && <span className="visual-graph__node-role">{node.role}</span>}
            <span className="visual-graph__node-label">{node.label}</span>
            {node.description && <span className="visual-graph__node-desc">{node.description}</span>}
          </div>
        )}
      />
    </div>
  );
}
