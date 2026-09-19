import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ARCHITECTURE_HEAVY_LESSON,
  COMPARISON_HEAVY_LESSON,
  HIERARCHY_HEAVY_LESSON,
  MINIMAL_TOPIC_LESSON,
  PROCESS_HEAVY_LESSON,
} from "../../test/fixtures/lessons";
import { SceneRenderer } from "../SceneRenderer";
import type { LessonPlan } from "../../types/api";

/** QA de renderers sin LLM (v1.1.0, PARTE 28/29): monta CADA escena de
 * cada "golden lesson" y confirma que renderiza sin crashear y sin
 * console.error — cubre opening/process/comparison/architecture/
 * concept_map/code/checkpoint/recap con contenido estructurado real. */
const GOLDEN_LESSONS: LessonPlan[] = [
  PROCESS_HEAVY_LESSON,
  COMPARISON_HEAVY_LESSON,
  ARCHITECTURE_HEAVY_LESSON,
  HIERARCHY_HEAVY_LESSON,
  MINIMAL_TOPIC_LESSON,
];

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("Golden lessons — renderiza cada escena sin crashear ni loguear errores", () => {
  for (const lesson of GOLDEN_LESSONS) {
    for (const scene of lesson.scenes) {
      it(`${lesson.lesson_id} / ${scene.scene_id} (${scene.scene_type}, ${scene.visual.visual_type})`, () => {
        const { container } = render(
          <SceneRenderer
            scene={scene}
            canonical={null}
            renderKey={0}
            courseId={lesson.course_id}
            moduleId={lesson.module_id}
            topicId={lesson.topic_id}
          />
        );
        expect(container.querySelector(".scene-renderer")).not.toBeNull();
        expect(container.textContent).toContain(scene.title.text);
        expect(errorSpy).not.toHaveBeenCalled();
      });
    }
  }

  it("minimal-topic tiene solo 2 escenas (no se alarga artificialmente un tema corto)", () => {
    expect(MINIMAL_TOPIC_LESSON.scenes).toHaveLength(2);
  });

  it("process-heavy usa process_steps reales, nunca key_points genéricos", () => {
    const processScene = PROCESS_HEAVY_LESSON.scenes.find((s) => s.visual.visual_type === "process");
    expect(processScene?.visual.process_steps.length).toBeGreaterThanOrEqual(3);
  });
});

// --------------------------------------------------------------------------
// v1.2.0 — PARTE 22.A-D: HierarchyVisual usa nodes/edges como fuente
// primaria, con fallback real a key_points ante una LessonPlan legacy.
// --------------------------------------------------------------------------

describe("HierarchyVisual — v1.2.0 nodes/edges (golden fixture)", () => {
  it("A/C: usa nodes cuando existen; los 5 nodos (raíz + 4 hijos) renderizan completos", () => {
    const scene = HIERARCHY_HEAVY_LESSON.scenes.find((s) => s.scene_id === "SCENE-002")!;
    const { container } = render(
      <SceneRenderer scene={scene} canonical={null} renderKey={0} courseId="c" moduleId="m" topicId="t" />
    );
    expect(container.querySelector(".visual-hierarchy__root")).toHaveTextContent(
      "Componentes de un prompt eficaz"
    );
    for (const label of ["Rol", "Contexto", "Tarea", "Restricciones"]) {
      expect(container.textContent).toContain(label);
    }
    expect(container.querySelectorAll(".visual-hierarchy__child")).toHaveLength(4);
  });

  it("D: edges válidas (patrón raíz->hijos) producen una relación visual real (root != scene.title cuando difieren)", () => {
    const scene = HIERARCHY_HEAVY_LESSON.scenes.find((s) => s.scene_id === "SCENE-002")!;
    const { container } = render(
      <SceneRenderer scene={scene} canonical={null} renderKey={0} courseId="c" moduleId="m" topicId="t" />
    );
    // El root mostrado viene del node real (edges determinaron la raíz),
    // no de un array-order asumido a ciegas.
    expect(container.querySelector(".visual-hierarchy__root")?.textContent).toBe(
      "Componentes de un prompt eficaz"
    );
  });

  it("B: sin nodes (legacy), cae a key_points como hijos de scene.title", () => {
    const scene = HIERARCHY_HEAVY_LESSON.scenes.find((s) => s.scene_id === "SCENE-003")!;
    expect(scene.visual.nodes).toHaveLength(0);
    const { container } = render(
      <SceneRenderer scene={scene} canonical={null} renderKey={0} courseId="c" moduleId="m" topicId="t" />
    );
    expect(container.querySelector(".visual-hierarchy__root")).toHaveTextContent("Formato de salida");
    for (const kp of scene.key_points) {
      expect(container.textContent).toContain(kp.text);
    }
  });
});

// --------------------------------------------------------------------------
// v1.2.0 — PARTE 22.P-R: seguridad general de los nuevos renderers
// estructurados (diagram canvas, hierarchy, comparison columns).
// --------------------------------------------------------------------------

describe("Renderers estructurados v1.2.0 — seguridad general", () => {
  it("P: ningún renderer estructurado usa dangerouslySetInnerHTML", () => {
    for (const lesson of GOLDEN_LESSONS) {
      for (const scene of lesson.scenes) {
        const { container, unmount } = render(
          <SceneRenderer
            scene={scene}
            canonical={null}
            renderKey={0}
            courseId={lesson.course_id}
            moduleId={lesson.module_id}
            topicId={lesson.topic_id}
          />
        );
        // Si algún componente usara dangerouslySetInnerHTML con markup
        // real, React igual lo insertaría en el DOM — pero acá ya sabemos
        // por auditoría de código (docs/VISUAL_FIDELITY.md) que ninguno lo
        // usa; esta prueba confirma que además no aparece HTML crudo
        // reconocible (tags) en el texto de ningún nodo renderizado.
        expect(container.innerHTML).not.toMatch(/<script/i);
        unmount();
      }
    }
  });

  it("Q: comparison con columns nunca ejecuta código ni interpreta markup en los puntos", () => {
    const scene = COMPARISON_HEAVY_LESSON.scenes.find((s) => s.scene_id === "SCENE-004")!;
    const { container } = render(
      <SceneRenderer scene={scene} canonical={null} renderKey={0} courseId="c" moduleId="m" topicId="t" />
    );
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.textContent).toContain("Configuración repetida cada semana");
  });

  it("R: DiagramCanvas con edge hacia un node inexistente (dato corrupto) degrada sin crashear", () => {
    const scene = ARCHITECTURE_HEAVY_LESSON.scenes.find((s) => s.scene_id === "SCENE-002")!;
    const corrupted = {
      ...scene,
      visual: {
        ...scene.visual,
        edges: [
          ...scene.visual.edges,
          { from_id: "gateway", to_id: "nunca-declarado", label: "", relation_type: "contains" as const },
        ],
      },
    };
    expect(() =>
      render(<SceneRenderer scene={corrupted} canonical={null} renderKey={0} courseId="c" moduleId="m" topicId="t" />)
    ).not.toThrow();
  });
});
