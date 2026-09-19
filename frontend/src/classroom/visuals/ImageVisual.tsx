import { SafeMarkdown } from "../../components/SafeMarkdown";
import { findBlockOfType } from "../sourceBlockLookup";
import type { VisualComponentProps } from "./types";

/** visual_type = "image": SourceBlock citado con block_type="image" (Fase
 * 2), nunca una URL inventada por el LLM — no existe ningún campo de URL
 * en el contrato, solo `source_refs` (ver VisualPlan.image en
 * app/models/lesson.py). Reusa `SafeMarkdown` (mismo componente del panel
 * de contenido) para resolver el asset relativo de forma segura y para
 * heredar automáticamente todas sus protecciones: nunca carga imágenes
 * externas, nunca un esquema `javascript:`/`data:`/`file:`. Si no hay un
 * bloque de imagen citado (fallback de robustez — no debería ocurrir
 * porque `lesson_validation.py` ya lo exige), cae a los key_points como
 * lista de texto: nunca muestra un ícono de imagen rota. */
export function ImageVisual({ scene, lookupSourceBlock, courseId, moduleId, topicId }: VisualComponentProps) {
  const imageBlock = findBlockOfType(scene.visual.source_refs, "image", lookupSourceBlock);

  if (!imageBlock) {
    return (
      <div className="visual visual--image visual--image-fallback">
        <h3 className="visual__title">{scene.title.text}</h3>
        <ul className="visual-bullets__list">
          {scene.key_points.map((kp, i) => (
            <li key={i} className="visual-bullets__item classroom-stagger-item" style={{ animationDelay: `${0.1 * i}s` }}>
              <span className="visual-bullets__marker" aria-hidden="true" />
              {kp.text}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="visual visual--image">
      <h3 className="visual__title">{scene.title.text}</h3>
      <div className="visual-image__frame">
        <SafeMarkdown markdown={imageBlock.markdown} courseId={courseId} moduleId={moduleId} topicId={topicId} />
      </div>
      {scene.key_points.length > 0 && (
        <ul className="visual-image__points">
          {scene.key_points.map((kp, i) => (
            <li key={i} className="classroom-stagger-item" style={{ animationDelay: `${0.1 * i}s` }}>
              {kp.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
