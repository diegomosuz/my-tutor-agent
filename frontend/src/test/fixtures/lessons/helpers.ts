// Helpers compartidos para las "golden lessons" (v1.1.0, PARTE 28): fixtures
// de LessonPlan ESTÁTICOS para QA visual y tests de renderers, sin depender
// de ningún LLM real. No se usan en producción.
import type { GroundedText, LessonScene, VisualPlan } from "../../../types/api";

export function gt(text: string, refs: string[] = ["SRC-001"]): GroundedText {
  return { text, source_refs: refs };
}

export function visual(overrides: Partial<VisualPlan> & Pick<VisualPlan, "visual_type">): VisualPlan {
  return {
    layout_hint: "default",
    source_refs: ["SRC-001"],
    description: "",
    emphasis: "neutral",
    process_steps: [],
    comparison: null,
    nodes: [],
    edges: [],
    ...overrides,
  };
}

export function scene(overrides: Partial<LessonScene> & Pick<LessonScene, "scene_id" | "scene_type" | "title" | "visual">): LessonScene {
  return {
    key_points: [],
    narration: [],
    interaction: null,
    ...overrides,
  };
}
