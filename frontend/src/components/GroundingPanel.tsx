import { useState } from "react";
import type { CanonicalInfo } from "../types/api";

/**
 * Panel de inspección visible SOLO en modo desarrollo (import.meta.env.DEV,
 * provisto por Vite: true en `npm run dev`, false en un build de
 * producción). Permite verificar el modelo canónico determinístico de
 * Fase 2 (SourceBlocks, hash de contenido) sin exponer el Grounding
 * Packet completo de forma permanente en la UI.
 */
export function GroundingPanel({ canonical }: { canonical: CanonicalInfo }) {
  const [showBlocks, setShowBlocks] = useState(false);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <details className="grounding-panel">
      <summary>
        <span className="grounding-panel__badge">DEV</span>
        Información de grounding — SHA-256 {canonical.content_sha256.slice(0, 8)}… ·{" "}
        {canonical.source_block_count} SourceBlocks
      </summary>
      <div className="grounding-panel__body">
        <p className="grounding-panel__hint">
          Modelo canónico determinístico derivado del Markdown de este tópico
          (Fase 2). No proviene de ningún LLM.
        </p>
        <button type="button" onClick={() => setShowBlocks((v) => !v)}>
          {showBlocks ? "Ocultar SourceBlocks" : "Ver SourceBlocks (SRC-XXX)"}
        </button>
        {showBlocks && (
          <ul className="grounding-panel__blocks">
            {canonical.source_blocks.map((block) => (
              <li key={block.source_ref}>
                <code>{block.source_ref}</code>
                <span className="grounding-panel__block-type">{block.block_type}</span>
                <span className="grounding-panel__block-lines">
                  líneas {block.start_line}–{block.end_line}
                </span>
                {block.heading_path.length > 0 && (
                  <span className="grounding-panel__block-path">
                    {block.heading_path.join(" › ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
