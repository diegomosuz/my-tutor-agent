import type { VisualComponentProps } from "./types";

/** visual_type = "hierarchy": scene.title como raíz, key_points como un
 * único nivel de hijos. No se inventan sub-niveles ni relaciones
 * parent-child que los datos no expresan explícitamente. */
export function HierarchyVisual({ scene }: VisualComponentProps) {
  const children = scene.key_points;
  return (
    <div className="visual visual--hierarchy">
      <div className="visual-hierarchy__root">{scene.title.text}</div>
      {children.length > 0 && (
        <>
          <div className="visual-hierarchy__trunk" aria-hidden="true" />
          <div className="visual-hierarchy__children">
            {children.map((kp, i) => (
              <div
                key={i}
                className="visual-hierarchy__child classroom-stagger-item"
                style={{ animationDelay: `${0.1 * i}s` }}
              >
                <span className="visual-hierarchy__connector" aria-hidden="true" />
                {kp.text}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
