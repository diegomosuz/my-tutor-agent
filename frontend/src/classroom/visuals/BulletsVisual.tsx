import type { VisualComponentProps } from "./types";

/** visual_type = "bullets": título + todos los key_points, con aparición
 * progresiva. Nunca trunca contenido silenciosamente. */
export function BulletsVisual({ scene }: VisualComponentProps) {
  const points = scene.key_points;
  return (
    <div className="visual visual--bullets">
      <h3 className="visual__title">{scene.title.text}</h3>
      <ul className="visual-bullets__list">
        {points.length > 0 ? (
          points.map((kp, i) => (
            <li
              key={i}
              className="visual-bullets__item classroom-stagger-item"
              style={{ animationDelay: `${0.1 * i}s` }}
            >
              <span className="visual-bullets__marker" aria-hidden="true" />
              {kp.text}
            </li>
          ))
        ) : (
          <li className="visual-bullets__item classroom-stagger-item">{scene.title.text}</li>
        )}
      </ul>
    </div>
  );
}
