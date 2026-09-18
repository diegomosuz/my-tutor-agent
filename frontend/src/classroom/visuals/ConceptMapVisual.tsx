import type { VisualComponentProps } from "./types";

/** visual_type = "concept_map": scene.title como concepto central,
 * key_points como conceptos relacionados. No se derivan relaciones
 * adicionales entre los conceptos relacionados entre sí. */
export function ConceptMapVisual({ scene }: VisualComponentProps) {
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
              <span className="visual-concept-map__stem" aria-hidden="true" />
              {kp.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
