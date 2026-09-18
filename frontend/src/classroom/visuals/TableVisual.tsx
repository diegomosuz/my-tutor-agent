import { findBlockOfType } from "../sourceBlockLookup";
import { parseMarkdownTable } from "../markdownTable";
import type { VisualComponentProps } from "./types";

/** visual_type = "table": prioridad 1: SourceBlock citado con
 * block_type="table" (Fase 2), parseado de forma segura (nunca
 * dangerouslySetInnerHTML) y mostrado con estilo PwC. Si no hay una tabla
 * fuente citada, cae a una lista de key_points en una sola columna: nunca
 * inventa columnas ni datos adicionales. */
export function TableVisual({ scene, lookupSourceBlock }: VisualComponentProps) {
  const tableBlock = findBlockOfType(scene.visual.source_refs, "table", lookupSourceBlock);
  const parsed = tableBlock ? parseMarkdownTable(tableBlock.markdown) : null;

  if (parsed) {
    return (
      <div className="visual visual--table">
        <h3 className="visual__title">{scene.title.text}</h3>
        <div className="visual-table__wrap">
          <table className="visual-table__table">
            <thead>
              <tr>
                {parsed.headers.map((header, i) => (
                  <th key={i}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.map((row, ri) => (
                <tr key={ri} className="classroom-stagger-item" style={{ animationDelay: `${0.08 * ri}s` }}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="visual visual--table visual--table-fallback">
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
