import { describe, expect, it } from "vitest";
import { getTopicAssetUrl } from "../client";

// v1.6.1: bug real -- codificar segmento a segmento (preservando "/"
// literales) no alcanza: un browser real aplica remove_dot_segments
// (WHATWG URL Standard) sobre el PATH de la URL antes de enviar el
// request, y ese algoritmo reconoce un segmento "."/".." incluso con sus
// puntos percent-encoded (`%2E`) -- confirmado en runtime real con
// Chromium (`new URL(...)` colapsa `assets/%2E%2E/foo.png` igual que
// `assets/../foo.png`, perdiendo el segmento "assets"). La única
// codificación que sobrevive intacta es tratar TODO `assetPath`
// (incluidos los "/" internos) como un único segmento de URL vía
// `encodeURIComponent` sobre el string completo -- así nunca hay un "/"
// literal que delimite un segmento igual a "." o "..". El backend ya
// decodifica esto correctamente (Starlette hace `unquote()` del
// parámetro `{asset_path:path}`). Ver
// `docs/RICH_MARKDOWN_RENDERING_V1_6_1.md`.
describe("getTopicAssetUrl", () => {
  const IDS = { courseId: "curso-demo", moduleId: "modulo-demo", topicId: "topico-demo" } as const;

  it("codifica un path simple como un único segmento percent-encoded", () => {
    const url = getTopicAssetUrl(IDS.courseId, IDS.moduleId, IDS.topicId, "images/architecture.png");
    expect(url).toContain(
      "/api/courses/curso-demo/modules/modulo-demo/topics/topico-demo/assets/images%2Farchitecture.png"
    );
    // El browser real lo decodifica de vuelta a la ruta correcta -- lo
    // confirmamos acá con el mismo `URL`/`decodeURIComponent` que usaría
    // cualquier cliente HTTP real.
    const encoded = url.split("/assets/")[1];
    expect(decodeURIComponent(encoded)).toBe("images/architecture.png");
  });

  it("un path con '../' nunca aparece como segmento literal '..' en la URL (el browser lo colapsaría)", () => {
    const url = getTopicAssetUrl(IDS.courseId, IDS.moduleId, IDS.topicId, "../_recursos/diagrama.png");
    expect(url).not.toContain("/assets/../");
    expect(url).not.toContain("/assets/%2E%2E/");
    const encoded = url.split("/assets/")[1];
    expect(decodeURIComponent(encoded)).toBe("../_recursos/diagrama.png");
  });

  it("sobrevive a la normalización real de URL del browser (new URL) sin perder el path", () => {
    const url = getTopicAssetUrl(IDS.courseId, IDS.moduleId, IDS.topicId, "../_recursos/diagrama.png");
    const parsed = new URL(url);
    expect(parsed.pathname).toContain("/assets/");
    expect(decodeURIComponent(parsed.pathname.split("/assets/")[1])).toBe("../_recursos/diagrama.png");
  });

  it("varios niveles de '../' también sobreviven la normalización real de URL", () => {
    const url = getTopicAssetUrl(IDS.courseId, IDS.moduleId, IDS.topicId, "../../otro/foo.png");
    const parsed = new URL(url);
    expect(decodeURIComponent(parsed.pathname.split("/assets/")[1])).toBe("../../otro/foo.png");
  });

  it("un nombre de archivo con puntos reales (no un segmento '..') se preserva igual", () => {
    const url = getTopicAssetUrl(IDS.courseId, IDS.moduleId, IDS.topicId, "images/v1.2.3.png");
    const encoded = url.split("/assets/")[1];
    expect(decodeURIComponent(encoded)).toBe("images/v1.2.3.png");
  });
});
