import { describe, expect, it } from "vitest";
import { buildSpeechSegments } from "../readAloudSegments";
import {
  applyReadAloudHighlight,
  clearReadAloudHighlight,
  isHighlightApiSupported,
  resolveSegmentRange,
} from "../readAloudHighlight";

function makeContainer(html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

describe("readAloudHighlight", () => {
  it("resolveSegmentRange encuentra el texto exacto de un segmento simple", () => {
    const root = makeContainer("<p>Kubernetes orquesta contenedores.</p>");
    const segments = buildSpeechSegments(root);
    const seg = segments[0];
    const range = resolveSegmentRange(root, seg.blockKey, seg.startOffset, seg.endOffset);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe(seg.text);
  });

  it("resolveSegmentRange atraviesa elementos inline (bold) sin romper el Range", () => {
    const root = makeContainer("<p>Un <strong>Deployment</strong> gestiona réplicas de Pods.</p>");
    const segments = buildSpeechSegments(root);
    const seg = segments[0];
    const range = resolveSegmentRange(root, seg.blockKey, seg.startOffset, seg.endOffset);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("Un Deployment gestiona réplicas de Pods.");
    // El <strong> sigue existiendo intacto en el DOM -- el Range nunca lo
    // reemplazó ni lo movió (PARTE 19).
    expect(root.querySelector("strong")?.textContent).toBe("Deployment");
  });

  it("resolveSegmentRange devuelve null para un segmento de un segundo segmento dentro del mismo párrafo (offset correcto)", () => {
    const root = makeContainer("<p>Primera oración. Segunda oración más larga aquí.</p>");
    const segments = buildSpeechSegments(root);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    const second = segments[1];
    const range = resolveSegmentRange(root, second.blockKey, second.startOffset, second.endOffset);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe(second.text);
  });

  it("resolveSegmentRange devuelve null si el bloque ya no existe (tópico cambió)", () => {
    const root = makeContainer("<p>Texto.</p>");
    const range = resolveSegmentRange(root, "99", 0, 5);
    expect(range).toBeNull();
  });

  it("resolveSegmentRange nunca lanza con offsets fuera de rango", () => {
    const root = makeContainer("<p>Texto corto.</p>");
    const segments = buildSpeechSegments(root);
    const seg = segments[0];
    expect(() => resolveSegmentRange(root, seg.blockKey, 0, 9999)).not.toThrow();
  });

  it("applyReadAloudHighlight/clearReadAloudHighlight nunca lanzan aunque la API no esté soportada", () => {
    const root = makeContainer("<p>Texto.</p>");
    const segments = buildSpeechSegments(root);
    const seg = segments[0];
    const range = resolveSegmentRange(root, seg.blockKey, seg.startOffset, seg.endOffset);
    expect(() => applyReadAloudHighlight(range)).not.toThrow();
    expect(() => applyReadAloudHighlight(null)).not.toThrow();
    expect(() => clearReadAloudHighlight()).not.toThrow();
  });

  it("isHighlightApiSupported nunca lanza (feature detection segura)", () => {
    expect(() => isHighlightApiSupported()).not.toThrow();
    expect(typeof isHighlightApiSupported()).toBe("boolean");
  });
});
