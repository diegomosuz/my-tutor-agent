import { findBlockOfType } from "../sourceBlockLookup";
import type { VisualComponentProps } from "./types";

/** visual_type = "quote": usa el SourceBlock blockquote citado si existe;
 * si no, cae al primer key_point (o al título) como texto destacado. Nunca
 * inventa un autor/atribución que no esté en la fuente. */
export function QuoteVisual({ scene, lookupSourceBlock }: VisualComponentProps) {
  const quoteBlock = findBlockOfType(scene.visual.source_refs, "blockquote", lookupSourceBlock);
  const text = quoteBlock?.plain_text ?? scene.key_points[0]?.text ?? scene.title.text;

  return (
    <div className="visual visual--quote">
      <span className="visual-quote__mark" aria-hidden="true">
        “
      </span>
      <blockquote className="visual-quote__text">{text}</blockquote>
      <span className="visual-quote__mark visual-quote__mark--end" aria-hidden="true">
        ”
      </span>
    </div>
  );
}
