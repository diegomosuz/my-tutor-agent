import type { VisualComponentProps } from "./types";

/** visual_type = "comparison": usa `visual.comparison` (v1.1.0, contenido
 * estructurado real) cuando viene poblado:
 * - con `rows` -> tabla de contraste real (una fila por aspecto, una
 *   columna por elemento comparado);
 * - sin `rows` (modo "cards") -> una card por columna, usando los
 *   `key_points` de la escena como contenido de cada card (no hay forma
 *   de saber determinísticamente qué key_point pertenece a qué columna,
 *   así que se listan todos en cada card — evita inventar una asignación).
 * Si `comparison` no viene poblado (robustez ante cache vieja), cae al
 * comportamiento anterior: 2 key_points -> pares A/B, si no, cards
 * neutrales sin etiqueta de grupo inventada. */
export function ComparisonVisual({ scene }: VisualComponentProps) {
  const comparison = scene.visual.comparison;

  if (comparison && comparison.rows.length > 0) {
    return (
      <div className="visual visual--comparison visual--comparison-table">
        <h3 className="visual__title">{scene.title.text}</h3>
        <div className="visual-comparison__table-wrap">
          <table className="visual-comparison__table">
            <thead>
              <tr>
                <th />
                {comparison.column_labels.map((label, i) => (
                  <th key={i}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row, ri) => (
                <tr key={ri} className="classroom-stagger-item" style={{ animationDelay: `${0.1 * ri}s` }}>
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, ci) => (
                    <td key={ci}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (comparison) {
    return (
      <div className="visual visual--comparison">
        <h3 className="visual__title">{scene.title.text}</h3>
        <div className="visual-comparison__grid">
          {comparison.column_labels.map((label, i) => (
            <div key={i} className="visual-comparison__card classroom-stagger-item" style={{ animationDelay: `${0.12 * i}s` }}>
              <span className="visual-comparison__side">{label}</span>
              <ul className="visual-comparison__card-points">
                {scene.key_points.map((kp, j) => (
                  <li key={j}>{kp.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback (sin contenido estructurado): comportamiento anterior.
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
