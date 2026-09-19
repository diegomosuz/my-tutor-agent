import type { VisualComponentProps } from "./types";

/** visual_type = "process": usa `visual.process_steps` (label + detail
 * opcional por paso) cuando viene poblado — v1.1.0, contenido estructurado
 * real en vez de tratar `key_points` como pasos genéricos. Si no viene
 * poblado (robustez ante una LessonPlan vieja en cache o un caso límite),
 * cae a `key_points` como antes, sin detail. left_to_right -> horizontal,
 * top_down -> vertical, default -> se decide según la cantidad de pasos y
 * el espacio disponible. Los conectores son CSS propio del componente,
 * nunca contenido generado por el LLM. */
export function ProcessVisual({ scene }: VisualComponentProps) {
  const steps =
    scene.visual.process_steps.length > 0
      ? scene.visual.process_steps
      : (scene.key_points.length > 0 ? scene.key_points : [scene.title]).map((gt) => ({
          label: gt.text,
          detail: "",
        }));
  const hint = scene.visual.layout_hint;
  const direction =
    hint === "top_down"
      ? "vertical"
      : hint === "left_to_right"
        ? "horizontal"
        : steps.length > 4
          ? "vertical"
          : "horizontal";

  return (
    <div className={`visual visual--process visual-process--${direction}`}>
      <h3 className="visual__title">{scene.title.text}</h3>
      <ol className="visual-process__steps">
        {steps.map((step, i) => (
          <li
            key={i}
            className="visual-process__step classroom-stagger-item"
            style={{ animationDelay: `${0.15 * i}s` }}
          >
            <span className="visual-process__index">{i + 1}</span>
            <span className="visual-process__label-group">
              <span className="visual-process__label">{step.label}</span>
              {step.detail && <span className="visual-process__detail">{step.detail}</span>}
            </span>
            {i < steps.length - 1 && <span className="visual-process__connector" aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </div>
  );
}
