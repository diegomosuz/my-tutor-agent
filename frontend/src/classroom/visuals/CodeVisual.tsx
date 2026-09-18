import { findBlockOfType } from "../sourceBlockLookup";
import type { VisualComponentProps } from "./types";

/** visual_type = "code": SourceBlock citado con block_type="code" (Fase 2,
 * ya viene con el texto sin las líneas de fence ``` ), mostrado en
 * monoespaciado, sin ningún tipo de ejecución (nada de eval, iframe, ni
 * `new Function`). Si no hay un bloque de código citado, cae a los
 * key_points en formato de lista. */
export function CodeVisual({ scene, lookupSourceBlock }: VisualComponentProps) {
  const codeBlock = findBlockOfType(scene.visual.source_refs, "code", lookupSourceBlock);

  return (
    <div className="visual visual--code">
      <h3 className="visual__title">{scene.title.text}</h3>
      {codeBlock ? (
        <pre className="visual-code__block">
          <code>{codeBlock.plain_text}</code>
        </pre>
      ) : (
        <ul className="visual-bullets__list">
          {scene.key_points.map((kp, i) => (
            <li key={i} className="visual-bullets__item classroom-stagger-item" style={{ animationDelay: `${0.1 * i}s` }}>
              <span className="visual-bullets__marker" aria-hidden="true" />
              {kp.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
