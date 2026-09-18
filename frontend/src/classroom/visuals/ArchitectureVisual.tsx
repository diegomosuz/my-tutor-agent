import type { VisualComponentProps } from "./types";

/** visual_type = "architecture": los key_points como componentes dentro de
 * un marco de arquitectura. Objetivo: cero alucinación introducida por el
 * renderer. Como GroundedText no codifica relaciones explícitas entre
 * pares de conceptos, NO se dibujan flechas/conexiones inventadas: los
 * nodos se muestran como componentes del sistema, sin más. */
export function ArchitectureVisual({ scene }: VisualComponentProps) {
  const nodes = scene.key_points.length > 0 ? scene.key_points : [scene.title];
  return (
    <div className="visual visual--architecture">
      <h3 className="visual__title">{scene.title.text}</h3>
      <div className="visual-architecture__frame">
        {nodes.map((n, i) => (
          <div
            key={i}
            className="visual-architecture__node classroom-stagger-item"
            style={{ animationDelay: `${0.1 * i}s` }}
          >
            {n.text}
          </div>
        ))}
      </div>
    </div>
  );
}
