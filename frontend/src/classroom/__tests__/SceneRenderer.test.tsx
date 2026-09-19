import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SceneRenderer } from "../SceneRenderer";
import { CANONICAL_INFO, SAMPLE_LESSON, withVisual } from "./fixtures";
import type { VisualType } from "../../types/api";

const baseScene = SAMPLE_LESSON.scenes[1]; // tiene key_points con varias refs

function renderScene(visualType: VisualType, refs: string[] = ["SRC-002"]) {
  const scene = withVisual(baseScene, visualType, refs);
  return render(
    <SceneRenderer
      scene={scene}
      canonical={CANONICAL_INFO}
      renderKey={0}
      courseId="curso-demo"
      moduleId="modulo-demo"
      topicId="topico-demo"
    />
  );
}

describe("SceneRenderer", () => {
  it("12. selecciona el componente correcto según visual_type", () => {
    const cases: [VisualType, string, string[]?][] = [
      ["hero", "visual--hero"],
      ["bullets", "visual--bullets"],
      ["process", "visual--process"],
      ["comparison", "visual--comparison"],
      ["hierarchy", "visual--hierarchy"],
      ["architecture", "visual--architecture"],
      ["concept_map", "visual--concept-map"],
      ["table", "visual--table"],
      ["code", "visual--code"],
      ["quote", "visual--quote"],
      ["none", "visual--none"],
      ["image", "visual--image", ["SRC-006"]],
    ];

    for (const [visualType, expectedClass, refs] of cases) {
      const { container, unmount } = renderScene(visualType, refs);
      expect(container.querySelector(`.${expectedClass}`)).not.toBeNull();
      unmount();
    }
  });

  it("13. visual_type = none igual renderiza contenido (nunca una pantalla vacía)", () => {
    renderScene("none");
    expect(screen.getByText(baseScene.title.text)).toBeInTheDocument();
  });

  it("14. las source_refs nunca se muestran como texto al alumno", () => {
    const { container } = renderScene("bullets", ["SRC-002", "SRC-003"]);
    expect(container.textContent).not.toMatch(/SRC-\d{3}/);
  });

  it("TableVisual usa el SourceBlock de tabla citado en vez de inventar columnas", () => {
    const scene = withVisual(baseScene, "table", ["SRC-003"]);
    render(<SceneRenderer scene={scene} canonical={CANONICAL_INFO} renderKey={0} courseId="curso-demo" moduleId="modulo-demo" topicId="topico-demo" />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("CodeVisual muestra el SourceBlock de código citado sin ejecutar nada", () => {
    const scene = withVisual(baseScene, "code", ["SRC-004"]);
    const { container } = render(
      <SceneRenderer scene={scene} canonical={CANONICAL_INFO} renderKey={0} courseId="curso-demo" moduleId="modulo-demo" topicId="topico-demo" />
    );
    expect(container.querySelector("pre code")?.textContent).toBe("key: value");
  });

  it("visual.description nunca aparece como texto visible en ningún renderer", () => {
    const scene = withVisual(baseScene, "hero", ["SRC-002"]);
    const { container } = render(
      <SceneRenderer scene={scene} canonical={CANONICAL_INFO} renderKey={0} courseId="curso-demo" moduleId="modulo-demo" topicId="topico-demo" />
    );
    expect(container.textContent).not.toContain("irrelevant description");
  });
});
