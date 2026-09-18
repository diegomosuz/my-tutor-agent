import type { VisualComponentProps } from "./types";

/** visual_type = "hero": slide corporativa con título grande + hasta 2
 * ideas clave (scene.key_points), sobre una composición geométrica
 * editorial inspirada en PwC (gradiente naranja/rojo/amarillo, sin logo
 * descargado de internet). */
export function HeroVisual({ scene }: VisualComponentProps) {
  const ideas = scene.key_points.slice(0, 2);
  return (
    <div className="visual visual--hero">
      <div className="visual-hero__shapes" aria-hidden="true">
        <span className="visual-hero__shape visual-hero__shape--a" />
        <span className="visual-hero__shape visual-hero__shape--b" />
        <span className="visual-hero__shape visual-hero__shape--c" />
      </div>
      <div className="visual-hero__content">
        <h3 className="visual-hero__title">{scene.title.text}</h3>
        {ideas.length > 0 && (
          <ul className="visual-hero__ideas">
            {ideas.map((idea, i) => (
              <li key={i} className="classroom-stagger-item" style={{ animationDelay: `${0.15 * (i + 1)}s` }}>
                {idea.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
