// Parser mínimo y seguro de tablas Markdown ya canonizadas (el texto viene
// de SourceBlock.markdown, Fase 2 — nunca de HTML/JS del LLM). Se usa en
// TableVisual para mostrar una tabla real sin `dangerouslySetInnerHTML`:
// el resultado son strings planos que React renderiza como texto.
export interface ParsedMarkdownTable {
  headers: string[];
  rows: string[][];
}

const SEPARATOR_ROW_RE = /^[\s|:-]+$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseMarkdownTable(markdown: string): ParsedMarkdownTable | null {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;

  const headers = splitRow(lines[0]);
  const bodyLines = lines.slice(1).filter((line) => !SEPARATOR_ROW_RE.test(line));
  const rows = bodyLines.map(splitRow);

  if (headers.length === 0) return null;
  return { headers, rows };
}
