import { describe, expect, it } from "vitest";
import { buildSpeechSegments, clearReadAloudBlockAttrs, READ_ALOUD_BLOCK_ATTR } from "../readAloudSegments";

function makeContainer(html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

describe("readAloudSegments", () => {
  it("1. párrafo simple produce un solo segmento con el texto completo", () => {
    const root = makeContainer("<p>Kubernetes es un orquestador de contenedores.</p>");
    const segments = buildSpeechSegments(root);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("Kubernetes es un orquestador de contenedores.");
    expect(segments[0].kind).toBe("text");
  });

  it("2. múltiples oraciones en un párrafo se separan en segmentos distintos", () => {
    const root = makeContainer(
      "<p>Kubernetes orquesta contenedores. Permite escalar automáticamente. Funciona con Docker.</p>"
    );
    const segments = buildSpeechSegments(root);
    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(segments.map((s) => s.text).join(" ")).toContain("Kubernetes orquesta contenedores.");
  });

  it("3. heading produce su propio segmento", () => {
    const root = makeContainer("<h1>Introducción a Kubernetes</h1><p>Texto.</p>");
    const segments = buildSpeechSegments(root);
    expect(segments[0].text).toBe("Introducción a Kubernetes");
  });

  it("4. list items producen un segmento cada uno, en orden", () => {
    const root = makeContainer("<ul><li>Primer item.</li><li>Segundo item.</li></ul>");
    const segments = buildSpeechSegments(root);
    expect(segments.map((s) => s.text)).toEqual(["Primer item.", "Segundo item."]);
  });

  it("5. blockquote (li > p implícito) nunca duplica la lectura", () => {
    const root = makeContainer("<blockquote><p>La observabilidad es clave.</p></blockquote>");
    const segments = buildSpeechSegments(root);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("La observabilidad es clave.");
  });

  it("6. inline bold dentro de un párrafo no se lee dos veces", () => {
    const root = makeContainer("<p>Un <strong>Deployment</strong> gestiona réplicas de Pods.</p>");
    const segments = buildSpeechSegments(root);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("Un Deployment gestiona réplicas de Pods.");
  });

  it("7. inline code preserva el identificador tal cual", () => {
    const root = makeContainer("<p>Ejecutá <code>kubectl get pods</code> para listar.</p>");
    const segments = buildSpeechSegments(root);
    expect(segments[0].text).toBe("Ejecutá kubectl get pods para listar.");
  });

  it("8. link dentro de un párrafo se lee como texto plano, sin duplicar", () => {
    const root = makeContainer('<p>Ver <a href="https://x.com">la documentación</a> oficial.</p>');
    const segments = buildSpeechSegments(root);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("Ver la documentación oficial.");
  });

  it("9. oración muy larga se parte en separadores seguros, nunca en medio de un token", () => {
    const longSentence =
      "Este es un ejemplo de oración deliberadamente larga que menciona OpenAPI 3.1.0, LangGraph, y https://example.com/path?query=1, además de TDD y BDD, para forzar la partición secundaria del segmentador determinístico que evita cortar identifiers, version numbers o URLs de forma arbitraria en medio del token.";
    const root = makeContainer(`<p>${longSentence}</p>`);
    const segments = buildSpeechSegments(root);
    expect(segments.length).toBeGreaterThan(1);
    // Ningún segmento corta un token: cada token completo (URL con query
    // string incluido -- el caso real que reveló el bug del ?, ver
    // segmentIntoSentences) aparece INTACTO dentro de UN ÚNICO segmento,
    // nunca partido entre dos.
    const allText = segments.map((s) => s.text);
    expect(allText.some((t) => t.includes("OpenAPI 3.1.0"))).toBe(true);
    expect(allText.some((t) => t.includes("https://example.com/path?query=1"))).toBe(true);
    expect(allText.some((t) => t.includes("LangGraph"))).toBe(true);
    // Reconstruir todos los segmentos por sus propios offsets reales
    // (nunca insertando espacios que el segmentador no puso) reproduce
    // el texto original sin pérdida de caracteres.
    const block = root.querySelector(`[${READ_ALOUD_BLOCK_ATTR}="0"]`)!;
    const fullText = (block.textContent ?? "").replace(/\s+/g, " ").trim();
    const reconstructed = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    expect(reconstructed).toBe(fullText);
  });

  it("10. español acentuado se preserva sin alteración", () => {
    const root = makeContainer("<p>La configuración técnica requiere revisión periódica.</p>");
    const segments = buildSpeechSegments(root);
    expect(segments[0].text).toBe("La configuración técnica requiere revisión periódica.");
  });

  it("11. identificadores técnicos se preservan sin normalizar", () => {
    const root = makeContainer(
      "<p>Usá LLM, API, OpenAPI, Python, Claude Code, TDD, BDD, JSON, Docker y LangGraph.</p>"
    );
    const segments = buildSpeechSegments(root);
    expect(segments[0].text).toBe(
      "Usá LLM, API, OpenAPI, Python, Claude Code, TDD, BDD, JSON, Docker y LangGraph."
    );
  });

  it("12. código: se lee como texto literal, un segmento por bloque (bloque corto)", () => {
    const root = makeContainer("<pre><code>kubectl get pods</code></pre>");
    const segments = buildSpeechSegments(root);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("code");
    expect(segments[0].text).toBe("kubectl get pods");
  });

  it("13. tablas: se leen celda por celda, en orden de fila, sin duplicar", () => {
    const root = makeContainer(
      "<table><tr><td>Celda A1</td><td>Celda B1</td></tr><tr><td>Celda A2</td><td>Celda B2</td></tr></table>"
    );
    const segments = buildSpeechSegments(root);
    expect(segments.map((s) => s.text)).toEqual(["Celda A1", "Celda B1", "Celda A2", "Celda B2"]);
  });

  it("14. imágenes: alt text real se lee, nunca la URL/filename", () => {
    const root = makeContainer('<img src="diagrama-interno-v2.png" alt="Diagrama de arquitectura" />');
    const segments = buildSpeechSegments(root);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("image-alt");
    expect(segments[0].text).toBe("Diagrama de arquitectura");
    expect(segments[0].text).not.toContain("diagrama-interno-v2.png");
  });

  it("15. imagen sin alt text no produce ningún segmento", () => {
    const root = makeContainer('<img src="x.png" alt="" />');
    const segments = buildSpeechSegments(root);
    expect(segments).toHaveLength(0);
  });

  it("16. tópico vacío (sin bloques legibles) produce lista vacía", () => {
    const root = makeContainer("<div></div>");
    const segments = buildSpeechSegments(root);
    expect(segments).toEqual([]);
  });

  it("17. orden pedagógico: H1 + párrafo + lista + tabla + código + quote se mantiene en orden visual", () => {
    const root = makeContainer(`
      <h1>Título</h1>
      <p>Párrafo introductorio.</p>
      <ul><li>Item de lista.</li></ul>
      <table><tr><td>Celda.</td></tr></table>
      <pre><code>print(1)</code></pre>
      <blockquote><p>Cita textual.</p></blockquote>
    `);
    const segments = buildSpeechSegments(root);
    expect(segments.map((s) => s.text)).toEqual([
      "Título",
      "Párrafo introductorio.",
      "Item de lista.",
      "Celda.",
      "print(1)",
      "Cita textual.",
    ]);
  });

  it("18. cada bloque hoja queda tageado con data-read-aloud-block, en orden", () => {
    const root = makeContainer("<h1>A</h1><p>B.</p>");
    buildSpeechSegments(root);
    const tagged = Array.from(root.querySelectorAll(`[${READ_ALOUD_BLOCK_ATTR}]`));
    expect(tagged.map((el) => el.getAttribute(READ_ALOUD_BLOCK_ATTR))).toEqual(["0", "1"]);
  });

  it("19. clearReadAloudBlockAttrs limpia todos los atributos agregados", () => {
    const root = makeContainer("<h1>A</h1><p>B.</p>");
    buildSpeechSegments(root);
    clearReadAloudBlockAttrs(root);
    expect(root.querySelectorAll(`[${READ_ALOUD_BLOCK_ATTR}]`)).toHaveLength(0);
  });

  it("20. segmentación es determinística (mismo DOM -> mismos segmentos)", () => {
    const root1 = makeContainer("<p>Primera oración. Segunda oración.</p>");
    const root2 = makeContainer("<p>Primera oración. Segunda oración.</p>");
    const s1 = buildSpeechSegments(root1);
    const s2 = buildSpeechSegments(root2);
    expect(s1.map((s) => s.text)).toEqual(s2.map((s) => s.text));
  });

  it("21. offsets de cada segmento son válidos dentro del textContent del bloque", () => {
    const root = makeContainer("<p>Primera oración. Segunda oración larga aquí.</p>");
    const segments = buildSpeechSegments(root);
    const block = root.querySelector(`[${READ_ALOUD_BLOCK_ATTR}="0"]`)!;
    const fullText = block.textContent ?? "";
    for (const seg of segments) {
      const extracted = fullText.slice(seg.startOffset, seg.endOffset);
      expect(extracted).toBe(seg.text);
    }
  });

  it("22. nunca lee botones/UI ajena al Markdown (elementos BUTTON se saltean)", () => {
    const root = makeContainer('<p>Texto real.</p><button type="button">Leer tema</button>');
    const segments = buildSpeechSegments(root);
    expect(segments.map((s) => s.text)).toEqual(["Texto real."]);
  });
});
