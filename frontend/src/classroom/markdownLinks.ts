// Extrae únicamente los enlaces http(s) presentes literalmente en el
// Markdown original del tópico, para la pestaña "Recursos" de la columna
// derecha. Nunca inventa recursos: si el Markdown no tiene enlaces, la
// lista queda vacía. Solo se aceptan esquemas http/https (descarta
// automáticamente cualquier `javascript:`, `data:` u otro esquema inseguro
// que pudiera aparecer en el texto).
export interface MarkdownLink {
  text: string;
  url: string;
}

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function extractMarkdownLinks(markdown: string): MarkdownLink[] {
  const seen = new Set<string>();
  const links: MarkdownLink[] = [];
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(markdown))) {
    const [, text, url] = match;
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ text, url });
    }
  }
  return links;
}
