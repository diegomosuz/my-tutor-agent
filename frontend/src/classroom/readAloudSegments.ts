// v1.5.0 ("Guided Markdown Read Aloud"): segmentación pura del Markdown
// YA renderizado (nunca del Markdown fuente por separado -- evita que la
// lectura diverja de lo que el alumno realmente ve, ver
// docs/GUIDED_READ_ALOUD_V1_5.md sección "Por qué segmentar el DOM
// renderizado, no el Markdown fuente").
//
// Ningún acceso a red, ningún React, ninguna dependencia de voz acá --
// puramente funciones sobre un `Element` ya montado, testeables en jsdom
// sin mockear Web Speech API/Custom Highlight API.

/** Tags que representan un bloque legible "hoja": si un elemento con uno
 * de estos tags no contiene NINGÚN descendiente de bloque, es una unidad
 * de lectura completa por sí misma (nunca se lee dos veces junto con un
 * ancestro/descendiente de bloque, ver PARTE 15 -- "li > p" nunca produce
 * dos lecturas). */
const LEAF_CANDIDATE_TAGS = new Set([
  "P",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "TD",
  "TH",
]);

/** Tags de bloque: si CUALQUIERA de estos aparece dentro de un candidato a
 * hoja, ese candidato es en realidad un CONTENEDOR (nunca se lee
 * directamente, solo se recorre para encontrar las hojas reales
 * adentro). */
const BLOCK_TAGS = new Set([
  "P",
  "LI",
  "UL",
  "OL",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "BLOCKQUOTE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "PRE",
  "DIV",
]);

const UI_TAGS_TO_SKIP = new Set(["BUTTON", "NAV", "SCRIPT", "STYLE"]);

export type SpeechSegmentKind = "text" | "code" | "image-alt";

export interface SpeechSegment {
  id: number;
  /** Referencia al bloque de origen (ver readAloudHighlight.ts) -- nunca
   * el propio nodo DOM (evita retener referencias obsoletas entre
   * renders; se re-resuelve por atributo al momento de resaltar). */
  blockKey: string;
  kind: SpeechSegmentKind;
  text: string;
  /** Offsets de caracteres dentro del `textContent` del bloque de origen
   * -- suficientes para reconstruir un Range al resaltar (nunca se
   * necesita guardar un Range en sí, que quedaría stale entre renders). */
  startOffset: number;
  endOffset: number;
}

/** Atributo que este módulo agrega a cada bloque hoja detectado --
 * mutación de atributo pura (nunca reemplaza/mueve nodos), compatible con
 * React: nunca tocamos un atributo que React administre. */
export const READ_ALOUD_BLOCK_ATTR = "data-read-aloud-block";

const MAX_SEGMENT_LENGTH = 220;
// Límites "seguros" para partir una oración demasiado larga -- nunca
// dentro de URLs/acronyms/identifiers/version numbers, que no suelen usar
// estos caracteres como separador real de frase (PARTE 12).
const SECONDARY_SPLIT_CHARS = [";", ":", "—", ","];

function hasBlockDescendant(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (BLOCK_TAGS.has(child.tagName)) return true;
    if (hasBlockDescendant(child)) return true;
  }
  return false;
}

function isLeafBlock(el: Element): boolean {
  return LEAF_CANDIDATE_TAGS.has(el.tagName) && !hasBlockDescendant(el);
}

/** Recorre el árbol en orden de documento (== orden visual/pedagógico,
 * PARTE 49) y devuelve, en orden, los bloques hoja legibles + los
 * elementos especiales (PRE/code, IMG con alt). Nunca desciende dentro de
 * un elemento ya identificado como hoja (evita releer su propio
 * subárbol). */
function collectReadableBlocks(root: Element): Element[] {
  const blocks: Element[] = [];

  function walk(el: Element): void {
    if (UI_TAGS_TO_SKIP.has(el.tagName)) return;

    if (el.tagName === "PRE") {
      // Code block completo: unidad propia, nunca se desciende adentro
      // (evita segmentar símbolos de código como si fueran oraciones).
      blocks.push(el);
      return;
    }
    if (el.tagName === "IMG") {
      blocks.push(el);
      return;
    }
    if (isLeafBlock(el)) {
      blocks.push(el);
      return; // nunca desciende: ya es una unidad de lectura completa.
    }
    // Contenedor (o un elemento no reconocido): recorrer hijos en orden.
    for (const child of Array.from(el.children)) {
      walk(child);
    }
  }

  walk(root);
  return blocks;
}

/** `Intl.Segmenter` con granularidad de oración cuando el runtime lo
 * soporta (PARTE 11); si no, un fallback determinístico chico basado en
 * puntuación de cierre de oración seguida de espacio -- nunca una
 * librería NLP nueva.
 *
 * Hallazgo real de QA (test 9 de readAloudSegments.test.ts): un
 * `Intl.Segmenter` de propósito general interpreta cualquier "?"/"."
 * como posible cierre de oración, incluido uno que aparece DENTRO de una
 * URL con query string (`.../path?query=1`) -- sin ningún espacio real
 * de por medio. Partir ahí cortaría la URL en dos segmentos de audio con
 * una pausa audible en medio de un token que nunca la tuvo. Corrección
 * puramente ESTRUCTURAL (nunca vocabulario/regex de "esto es una URL",
 * PARTE 12): una oración real SIEMPRE está separada de la siguiente por
 * al menos un espacio/salto de línea en el texto original -- si dos
 * piezas consecutivas que devolvió el segmentador quedan pegadas sin
 * ningún separador entre ellas, eso nunca es un límite de oración real:
 * se vuelven a unir. */
function segmentIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  type SegmenterCtor = new (
    locale: string,
    options: { granularity: "sentence" }
  ) => { segment: (input: string) => Iterable<{ segment: string; index: number }> };
  const IntlWithSegmenter = Intl as unknown as { Segmenter?: SegmenterCtor };

  if (typeof IntlWithSegmenter.Segmenter === "function") {
    const segmenter = new IntlWithSegmenter.Segmenter("es", { granularity: "sentence" });
    const raw: { text: string; start: number; end: number }[] = [];
    for (const { segment, index } of segmenter.segment(trimmed)) {
      raw.push({ text: segment, start: index, end: index + segment.length });
    }

    // Fusiona piezas adyacentes sin ningún separador de espacio real
    // entre ellas -- nunca un límite de oración genuino.
    const merged: { text: string; start: number; end: number }[] = [];
    for (const piece of raw) {
      const prev = merged[merged.length - 1];
      const gap = prev ? trimmed.slice(prev.end, piece.start) : "";
      if (prev && gap.trim() === "" && !/\s/.test(trimmed[prev.end - 1] ?? "") && prev.end === piece.start) {
        prev.text += piece.text;
        prev.end = piece.end;
      } else {
        merged.push({ ...piece });
      }
    }

    const sentences = merged.map((p) => p.text.trim()).filter(Boolean);
    if (sentences.length > 0) return sentences;
  }

  // Fallback: partir tras ".", "!", "?" seguido de espacio/fin de texto --
  // determinístico, sin heurísticas de idioma adicionales.
  const matches = trimmed.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
  return (matches ?? [trimmed]).map((s) => s.trim()).filter(Boolean);
}

/** Si una oración supera `MAX_SEGMENT_LENGTH`, se parte en los separadores
 * "seguros" definidos arriba -- solo cuando hace falta, nunca arbitrario
 * (PARTE 12). Nunca parte dentro de un token sin espacios (URLs,
 * identifiers, version numbers no contienen estos separadores como parte
 * del propio token en la práctica). */
function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_SEGMENT_LENGTH) return [sentence];

  for (const sep of SECONDARY_SPLIT_CHARS) {
    // Solo parte en una ocurrencia de `sep` seguida de espacio real (o fin
    // de texto) -- un separador "pegado" al carácter siguiente (p.ej. el
    // ":" de "https://...", el ":" de una hora "3:00", una coma dentro de
    // un número) nunca es un límite de frase real, es parte del propio
    // token (mismo hallazgo estructural que la fusión de oraciones de
    // arriba, PARTE 12: nunca cortar en medio de un token sin espacios).
    const escaped = sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}(?=\\s|$)`, "g");
    if (pattern.test(sentence)) {
      pattern.lastIndex = 0;
      const parts: string[] = [];
      let cursor = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(sentence))) {
        parts.push(sentence.slice(cursor, match.index + sep.length));
        cursor = match.index + sep.length;
      }
      if (cursor < sentence.length) parts.push(sentence.slice(cursor));
      const trimmedParts = parts.map((p) => p.trim()).filter(Boolean);
      if (trimmedParts.length > 1) {
        return trimmedParts.flatMap((p) => (p.length > MAX_SEGMENT_LENGTH ? splitLongSentence(p) : [p]));
      }
    }
  }
  // Ningún separador seguro disponible: se deja como un único segmento
  // largo antes que cortar arbitrariamente en medio de una palabra/token.
  return [sentence];
}

function codeBlockSegments(text: string): string[] {
  const trimmed = text.replace(/\s+$/g, "");
  if (!trimmed) return [];
  if (trimmed.length <= MAX_SEGMENT_LENGTH * 2) return [trimmed];
  // Fallback para bloques de código largos: partir por línea, el único
  // separador que nunca cae en medio de un identifier/símbolo de código.
  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Construye la lista ordenada y determinística de `SpeechSegment` a
 * partir del DOM ya renderizado de un tópico (PARTE 10/49). Efecto
 * colateral intencional y documentado: tagea cada bloque hoja con
 * `data-read-aloud-block="N"` para que `readAloudHighlight.ts` pueda
 * volver a encontrarlo sin retener una referencia directa al nodo. */
export function buildSpeechSegments(root: Element): SpeechSegment[] {
  const blocks = collectReadableBlocks(root);
  const segments: SpeechSegment[] = [];
  let nextId = 0;
  let blockIndex = 0;

  for (const block of blocks) {
    if (block.tagName === "IMG") {
      const alt = (block as HTMLImageElement).alt?.trim();
      if (alt) {
        // Las imágenes no tienen texto propio para resaltar con offsets
        // de textContent -- se marcan igual (para que el highlight pueda
        // encontrar el <img> completo) pero sin bloque de texto normal.
        block.setAttribute(READ_ALOUD_BLOCK_ATTR, String(blockIndex));
        segments.push({
          id: nextId++,
          blockKey: String(blockIndex),
          kind: "image-alt",
          text: alt,
          startOffset: 0,
          endOffset: 0,
        });
        blockIndex += 1;
      }
      continue;
    }

    const text = (block.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    block.setAttribute(READ_ALOUD_BLOCK_ATTR, String(blockIndex));
    const rawText = block.textContent ?? "";

    if (block.tagName === "PRE") {
      for (const codeText of codeBlockSegments(text)) {
        // Los offsets de código se resuelven por búsqueda literal en
        // rawText (nunca contiene HTML, solo texto) -- suficiente porque
        // un bloque de código no repite líneas idénticas en la práctica
        // pedagógica típica; si lo hiciera, se resalta la primera
        // ocurrencia, degradación aceptable (nunca rompe la lectura).
        const start = rawText.indexOf(codeText);
        const startOffset = start >= 0 ? start : 0;
        segments.push({
          id: nextId++,
          blockKey: String(blockIndex),
          kind: "code",
          text: codeText,
          startOffset,
          endOffset: startOffset + codeText.length,
        });
      }
      blockIndex += 1;
      continue;
    }

    let cursor = 0;
    for (const sentence of segmentIntoSentences(rawText)) {
      for (const piece of splitLongSentence(sentence)) {
        const found = rawText.indexOf(piece, cursor);
        const startOffset = found >= 0 ? found : cursor;
        const endOffset = startOffset + piece.length;
        segments.push({
          id: nextId++,
          blockKey: String(blockIndex),
          kind: "text",
          text: piece,
          startOffset,
          endOffset,
        });
        cursor = endOffset;
      }
    }
    blockIndex += 1;
  }

  return segments;
}

/** Limpia los atributos `data-read-aloud-block` agregados por
 * `buildSpeechSegments` -- se llama al desmontar/recalcular (tópico
 * nuevo), nunca deja marcado stale en el DOM. */
export function clearReadAloudBlockAttrs(root: Element): void {
  root.querySelectorAll(`[${READ_ALOUD_BLOCK_ATTR}]`).forEach((el) => {
    el.removeAttribute(READ_ALOUD_BLOCK_ATTR);
  });
}
