import type { VisualComponentProps } from "./types";

/** visual_type = "none": nunca se muestra una pantalla vacía. Se presenta
 * igual una slide editorial simple con título + key_points. */
export function NoVisual({ scene }: VisualComponentProps) {
  return (
    <div className="visual visual--none">
      <h3 className="visual__title">{scene.title.text}</h3>
      {scene.key_points.length > 0 ? (
        <ul className="visual-bullets__list visual-bullets__list--centered">
          {scene.key_points.map((kp, i) => (
            <li key={i} className="visual-bullets__item classroom-stagger-item" style={{ animationDelay: `${0.1 * i}s` }}>
              {kp.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="visual-none__empty">
          Contenido disponible en la narración y en el contenido completo del tema.
        </p>
      )}
    </div>
  );
}
