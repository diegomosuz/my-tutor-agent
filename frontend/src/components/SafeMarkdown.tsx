import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTopicAssetUrl } from "../api/client";

export interface SafeMarkdownProps {
  markdown: string;
  courseId: string;
  moduleId: string;
  topicId: string;
}

const SAFE_LINK_SCHEMES = ["http://", "https://", "mailto:"];

function isSafeLinkHref(href: string): boolean {
  const lowered = href.trim().toLowerCase();
  return SAFE_LINK_SCHEMES.some((scheme) => lowered.startsWith(scheme));
}

function isExternalImageSrc(src: string): boolean {
  const lowered = src.trim().toLowerCase();
  return lowered.startsWith("http://") || lowered.startsWith("https://") || lowered.startsWith("data:");
}

/** Renderiza el Markdown fuente de un tópico como texto React (nunca HTML
 * crudo interpretado: sin `rehype-raw`, sin `dangerouslySetInnerHTML`).
 * Fase 7, secciones 14-15:
 * - imágenes relativas -> se resuelven contra el endpoint seguro de
 *   assets del backend (nunca `file://`, nunca un path de Windows leído
 *   por el browser);
 * - imágenes externas (http/https/data:) -> NO se cargan automáticamente
 *   (la app debe poder funcionar offline salvo llamadas LLM/TTS); se
 *   muestra un placeholder con el link;
 * - links http/https/mailto -> `target="_blank" rel="noopener noreferrer"`;
 * - cualquier otro esquema (`javascript:`, `data:`, `file:`, etc.) ->
 *   nunca se renderiza como link clicable, solo como texto plano.
 */
export function SafeMarkdown({ markdown, courseId, moduleId, topicId }: SafeMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        img({ src, alt }) {
          if (!src) return null;
          if (isExternalImageSrc(src)) {
            // El placeholder solo es clickeable para http/https reales:
            // un `src="data:..."` cae en esta rama (es "externo", nunca se
            // carga automático) pero jamás debe terminar como href de un
            // link — mismo criterio que isSafeLinkHref para <a> (sección
            // 16 de la Fase 8).
            return (
              <span className="safe-markdown__external-image">
                🖼 Imagen externa no cargada automáticamente
                {isSafeLinkHref(src) ? (
                  <>
                    {" — "}
                    <a href={src} target="_blank" rel="noopener noreferrer">
                      {alt || "ver imagen"}
                    </a>
                  </>
                ) : null}
              </span>
            );
          }
          const assetUrl = getTopicAssetUrl(courseId, moduleId, topicId, src);
          return <img src={assetUrl} alt={alt ?? ""} loading="lazy" />;
        },
        a({ href, children }) {
          if (!href || !isSafeLinkHref(href)) {
            return <span className="safe-markdown__blocked-link">{children}</span>;
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
