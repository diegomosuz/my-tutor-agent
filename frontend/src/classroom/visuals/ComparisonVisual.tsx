import type { VisualComponentProps } from "./types";

/** visual_type = "comparison": dos columnas SOLO cuando hay exactamente 2
 * key_points (una comparación de a pares es lo único que los datos
 * permiten identificar sin inventar una clasificación). En cualquier otro
 * caso se usa una presentación neutral en cards paralelas, sin etiquetas
 * de grupo inventadas. */
export function ComparisonVisual({ scene }: VisualComponentProps) {
  const points = scene.key_points;
  const isPairwise = points.length === 2;

  return (
    <div className="visual visual--comparison">
      <h3 className="visual__title">{scene.title.text}</h3>
      <div className={`visual-comparison__grid${isPairwise ? " visual-comparison__grid--pair" : ""}`}>
        {points.length > 0 ? (
          points.map((p, i) => (
            <div
              key={i}
              className="visual-comparison__card classroom-stagger-item"
              style={{ animationDelay: `${0.12 * i}s` }}
            >
              {isPairwise && (
                <span className="visual-comparison__side" aria-hidden="true">
                  {i === 0 ? "A" : "B"}
                </span>
              )}
              <p>{p.text}</p>
            </div>
          ))
        ) : (
          <div className="visual-comparison__card classroom-stagger-item">
            <p>{scene.title.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
