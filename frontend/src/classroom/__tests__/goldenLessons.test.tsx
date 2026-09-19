import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ARCHITECTURE_HEAVY_LESSON,
  COMPARISON_HEAVY_LESSON,
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
