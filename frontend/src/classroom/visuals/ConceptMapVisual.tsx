import type { VisualComponentProps } from "./types";
import { DiagramCanvas } from "./DiagramCanvas";

/** visual_type = "concept_map" (v1.2.0, bloque "Visual Fidelity" — antes
 * las relaciones entre conceptos se mostraban como una lista de texto
 * "A -> B", y la única "conexión" real era un `__stem` decorativo fijo de
 * 2px que no representaba ninguna relación real). Ahora usa
 * `DiagramCanvas` (layout "radial"): `scene.title` sigue siendo el
 * concepto central FIJO (igual que antes de v1.2.0 — nunca se asume que
 * "el primer node" es el centro, el LLM no recibe esa instrucción), todos
 * los `nodes` se distribuyen alrededor en círculo (ángulos uniformes, sin
 * física ni force-layout), y cualquier `edge` declarada ENTRE dos nodos
 * relacionados se dibuja como un conector SVG real. Si `nodes` no viene
 * poblado (robustez ante cache vieja), cae a usar `key_points` como
 * conceptos relacionados alrededor de `scene.title`, sin edges
 * (comportamiento anterior a v1.1.0). */
export function ConceptMapVisual({ scene }: VisualComponentProps) {
  const { nodes, edges } = scene.visual;

  if (nodes.length === 0) {
    const related = scene.key_points;
    return (
      <div className="visual visual--concept-map">
        <div className="visual-concept-map__center">{scene.title.text}</div>
        {related.length > 0 && (
          <div className="visual-concept-map__related">
            {related.map((kp, i) => (
              <div
                key={i}
                className="visual-concept-map__node classroom-stagger-item"
                style={{ animationDelay: `${0.1 * i}s` }}
              >
                {kp.text}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="visual visual--concept-map">
      <DiagramCanvas
        nodes={nodes}
        edges={edges}
        layout="radial"
        centerLabel={scene.title.text}
        renderNode={(node) => <div className="visual-concept-map__node">{node.label}</div>}
      />
    </div>
  );
}
