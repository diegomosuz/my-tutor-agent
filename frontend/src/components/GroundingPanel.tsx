import { useState } from "react";
import type { CanonicalInfo } from "../types/api";

/**
 * Panel de inspección visible SOLO en modo desarrollo (import.meta.env.DEV,
 * provisto por Vite: true en `npm run dev`, false en un build de
 * producción). Permite verificar el modelo canónico determinístico de
 * Fase 2 (SourceBlocks, hash de contenido) y, desde Fase 3, las
 * source_refs realmente usadas por la escena activa de una LessonPlan.
 * Nunca muestra el Grounding Packet completo de forma permanente.
 */
export function GroundingPanel({
  canonical,
  activeSceneId,
  activeSceneRefs,
  activeSceneType,
  activeVisualType,
}: {
  canonical: CanonicalInfo;
  activeSceneId?: string | null;
  activeSceneRefs?: string[];
  /** v1.1.0: rol pedagógico y visual_type de la escena activa — solo
   * informativo, solo DEV, nunca visible al alumno. */
  activeSceneType?: string | null;
  activeVisualType?: string | null;
}) {
  const [showBlocks, setShowBlocks] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  if (!import.meta.env.DEV) {
    return null;
  }

  const selectedBlock = selectedRef
    ? canonical.source_blocks.find((b) => b.source_ref === selectedRef) ?? null
    : null;

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

        {(activeSceneType || activeVisualType) && (
          <p className="grounding-panel__hint">
            {activeSceneType && (
              <>
                scene_type: <code>{activeSceneType}</code>
              </>
            )}
            {activeSceneType && activeVisualType && " · "}
            {activeVisualType && (
              <>
                visual_type: <code>{activeVisualType}</code>
              </>
            )}
          </p>
        )}

        {activeSceneRefs && activeSceneRefs.length > 0 && (
          <div className="grounding-panel__scene-refs">
            <p className="grounding-panel__hint">
              Referencias usadas por la escena activa
              {activeSceneId ? ` (${activeSceneId})` : ""}: hacé click para inspeccionar.
            </p>
            <div className="grounding-panel__chip-row">
              {activeSceneRefs.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  className={
                    "grounding-panel__ref-chip" + (selectedRef === ref ? " active" : "")
                  }
                  onClick={() => setSelectedRef((current) => (current === ref ? null : ref))}
                >
                  {ref}
                </button>
              ))}
            </div>
            {selectedBlock && (
              <div className="grounding-panel__block-preview">
                <strong>
                  {selectedBlock.source_ref} · {selectedBlock.block_type}
                </strong>
                <p>{selectedBlock.plain_text}</p>
              </div>
            )}
            {selectedRef && !selectedBlock && (
              <p className="grounding-panel__block-preview grounding-panel__block-preview--missing">
                {selectedRef} no existe en los SourceBlocks del tópico.
              </p>
            )}
          </div>
        )}

        <button type="button" onClick={() => setShowBlocks((v) => !v)}>
          {showBlocks ? "Ocultar SourceBlocks" : "Ver SourceBlocks (SRC-XXX)"}
        </button>
        {showBlocks && (
          <ul className="grounding-panel__blocks">
            {canonical.source_blocks.map((block) => (
              <li
                key={block.source_ref}
                className={
                  activeSceneRefs?.includes(block.source_ref)
                    ? "grounding-panel__block-row--active"
                    : undefined
                }
              >
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
