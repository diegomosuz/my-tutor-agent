import { useMemo } from "react";
import type { VisualComponentProps } from "./types";
import { DiagramCanvas } from "./DiagramCanvas";
import { buildAnimationSequence } from "../pedagogicalAnimation";
import { usePedagogicalAnimation } from "../usePedagogicalAnimation";

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
 * (comportamiento anterior a v1.1.0).
 *
 * Animación pedagógica (v1.2.0, bloque "Pedagogical Animations"): el
 * centro (`scene.title`) está SIEMPRE visible de inmediato — nunca forma
 * parte de la secuencia, igual que `DiagramCanvas` ya lo trata como
 * elemento fijo, no un GraphNode. Los nodos relacionados se revelan como
 * un grupo (PARTE 9: un concept_map no representa temporalidad, así que
 * nunca debe parecer "paso 1/2/3"), y las conexiones después. */
export function ConceptMapVisual({ scene, isPaused }: VisualComponentProps) {
  const { nodes, edges } = scene.visual;
  const sequence = useMemo(() => buildAnimationSequence(scene), [scene]);
  const anim = usePedagogicalAnimation(sequence, isPaused);

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
        isNodeVisible={(id) => anim.elementStatus(id) !== "hidden"}
        isNodeActive={(id) => anim.elementStatus(id) === "active"}
        isEdgeVisible={(i) => anim.elementStatus(`edge-${i}`) !== "hidden"}
        isEdgeActive={(i) => anim.elementStatus(`edge-${i}`) === "active"}
        renderNode={(node) => <div className="visual-concept-map__node">{node.label}</div>}
      />
    </div>
  );
}
