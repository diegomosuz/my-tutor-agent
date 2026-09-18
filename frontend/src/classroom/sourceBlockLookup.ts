// Utilidad para resolver SRC-XXX -> SourceBlock a partir del
// CanonicalInfo ya incluido en la respuesta de tópico (Fase 2). No
// duplica ninguna lógica del backend: solo indexa lo que el backend ya
// calculó de forma determinística.
import type { CanonicalInfo, SourceBlock } from "../types/api";

export type SourceBlockLookup = (ref: string) => SourceBlock | undefined;

export function buildSourceBlockLookup(
  canonical: CanonicalInfo | null | undefined
): SourceBlockLookup {
  const map = new Map<string, SourceBlock>();
  canonical?.source_blocks.forEach((block) => map.set(block.source_ref, block));
  return (ref: string) => map.get(ref);
}

export function resolveSourceBlocks(refs: string[], lookup: SourceBlockLookup): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  for (const ref of refs) {
    const block = lookup(ref);
    if (block) blocks.push(block);
  }
  return blocks;
}

/** Encuentra, entre los SourceBlock citados por `refs`, el primero cuyo
 * `block_type` coincida (ej: "table", "code", "blockquote"). Usado por los
 * visual renderers especializados (TableVisual, CodeVisual, QuoteVisual)
 * para priorizar contenido fuente real sobre una representación genérica. */
export function findBlockOfType(
  refs: string[],
  blockType: string,
  lookup: SourceBlockLookup
): SourceBlock | undefined {
  return resolveSourceBlocks(refs, lookup).find((block) => block.block_type === blockType);
}
