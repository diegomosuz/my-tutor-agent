// v1.5.0 ("Guided Markdown Read Aloud"): resaltado de la frase activa sin
// tocar el DOM que React administra (PARTE 18 de la especificación --
// decisión documentada en docs/GUIDED_READ_ALOUD_V1_5.md).
//
// Se usa la CSS Custom Highlight API (`CSS.highlights` + `Highlight`):
// una capa de pintado puramente visual sobre un `Range` ya existente,
// aplicada vía `::highlight(read-aloud-segment)` en CSS -- nunca inserta
// `<mark>`/`<span>` nuevos, nunca reemplaza nodos, nunca interfiere con
// `contenteditable`, selección de texto o los `<a>`/`<strong>`/`<code>`
// que ya rindió `SafeMarkdown`. Feature-detectada (Chrome/Edge recientes;
// sin soporte en Firefox al momento de escribir esto): si no está
// disponible, el Reader simplemente no resalta nada -- sigue funcionando
// igual (audio, controles, velocidad), degradación segura, mismo patrón
// que `isSpeechSupported()`.
import { READ_ALOUD_BLOCK_ATTR } from "./readAloudSegments";

const HIGHLIGHT_NAME = "read-aloud-segment";

interface HighlightApi {
  new (...ranges: Range[]): unknown;
}

function getHighlightRegistry(): { set: (name: string, h: unknown) => void; delete: (name: string) => void } | null {
  if (typeof CSS === "undefined") return null;
  const withHighlights = CSS as unknown as { highlights?: { set: (name: string, h: unknown) => void; delete: (name: string) => void } };
  return withHighlights.highlights ?? null;
}

export function isHighlightApiSupported(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof CSS !== "undefined" &&
      "highlights" in CSS &&
      typeof (window as unknown as { Highlight?: HighlightApi }).Highlight === "function"
    );
  } catch {
    return false;
  }
}

/** Encuentra el bloque taggeado por `buildSpeechSegments` y construye un
 * `Range` que cubre exactamente [startOffset, endOffset) de su
 * `textContent`, recorriendo únicamente los nodos de texto (preserva
 * intacto cualquier elemento inline -- bold/italic/code/link -- que quede
 * dentro del rango, nunca se toca su estructura, PARTE 19). Devuelve
 * `null` si el bloque ya no existe (tópico cambió) o los offsets quedaron
 * fuera de rango -- nunca lanza. */
export function resolveSegmentRange(
  root: Element,
  blockKey: string,
  startOffset: number,
  endOffset: number
): Range | null {
  const block = root.querySelector(`[${READ_ALOUD_BLOCK_ATTR}="${blockKey}"]`);
  if (!block) return null;

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;

  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.data.length;
    const nodeStart = consumed;
    const nodeEnd = consumed + length;

    if (startNode === null && startOffset >= nodeStart && startOffset <= nodeEnd) {
      startNode = node;
      startNodeOffset = startOffset - nodeStart;
    }
    if (endOffset >= nodeStart && endOffset <= nodeEnd) {
      endNode = node;
      endNodeOffset = endOffset - nodeStart;
      break;
    }
    consumed = nodeEnd;
    node = walker.nextNode() as Text | null;
  }

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    return range;
  } catch {
    return null;
  }
}

/** Aplica el highlight sobre exactamente un `Range` (reemplaza cualquier
 * highlight previo de este módulo -- nunca acumula). No-op segura si la
 * API no está soportada. */
export function applyReadAloudHighlight(range: Range | null): void {
  const registry = getHighlightRegistry();
  if (!registry) return;
  if (!range) {
    registry.delete(HIGHLIGHT_NAME);
    return;
  }
  const HighlightCtor = (window as unknown as { Highlight: HighlightApi }).Highlight;
  registry.set(HIGHLIGHT_NAME, new HighlightCtor(range));
}

/** Limpia el highlight activo -- se llama en Stop/Completed/cambio de
 * tópico/unmount. Siempre segura de llamar aunque no haya nada resaltado. */
export function clearReadAloudHighlight(): void {
  const registry = getHighlightRegistry();
  registry?.delete(HIGHLIGHT_NAME);
}
