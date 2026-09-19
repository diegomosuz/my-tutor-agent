import type { CanonicalInfo, LessonPlan, LessonScene, SourceBlock, VisualPlan } from "../../types/api";

function groundedText(text: string, refs: string[] = ["SRC-001"]) {
  return { text, source_refs: refs };
}

export const SOURCE_BLOCKS: SourceBlock[] = [
  {
    source_ref: "SRC-001",
    block_type: "heading",
    markdown: "# Kubernetes",
    plain_text: "Kubernetes",
    heading_path: ["Kubernetes"],
    start_line: 1,
    end_line: 1,
  },
  {
    source_ref: "SRC-002",
    block_type: "paragraph",
    markdown: "Kubernetes orquesta contenedores.",
    plain_text: "Kubernetes orquesta contenedores.",
    heading_path: ["Kubernetes"],
    start_line: 3,
    end_line: 3,
  },
  {
    source_ref: "SRC-003",
    block_type: "table",
    markdown: "| A | B |\n| --- | --- |\n| 1 | 2 |",
    plain_text: "A B 1 2",
    heading_path: ["Kubernetes"],
    start_line: 5,
    end_line: 7,
  },
  {
    source_ref: "SRC-004",
    block_type: "code",
    markdown: "```yaml\nkey: value\n```",
    plain_text: "key: value",
    heading_path: ["Kubernetes"],
    start_line: 9,
    end_line: 11,
  },
  {
    source_ref: "SRC-005",
    block_type: "blockquote",
    markdown: "> Una cita relevante.",
    plain_text: "Una cita relevante.",
    heading_path: ["Kubernetes"],
    start_line: 13,
    end_line: 13,
  },
  {
    source_ref: "SRC-006",
    block_type: "image",
    markdown: "![Diagrama de arquitectura](images/architecture.png)",
    plain_text: "Diagrama de arquitectura",
    heading_path: ["Kubernetes"],
    start_line: 15,
    end_line: 15,
  },
];

export const CANONICAL_INFO: CanonicalInfo = {
  content_sha256: "abc123",
  source_block_count: SOURCE_BLOCKS.length,
  source_blocks: SOURCE_BLOCKS,
};

function baseVisual(overrides: Partial<VisualPlan> = {}): VisualPlan {
  return {
    visual_type: "bullets",
    layout_hint: "default",
    source_refs: ["SRC-002"],
    description: "",
    emphasis: "neutral",
    process_steps: [],
    comparison: null,
    nodes: [],
    edges: [],
    ...overrides,
  };
}

function makeScene(overrides: Partial<LessonScene>): LessonScene {
  return {
    scene_id: "SCENE-001",
    scene_type: "opening",
    title: groundedText("Título de escena"),
    key_points: [groundedText("Primer punto clave", ["SRC-002"])],
    narration: [
      groundedText("Primera narración.", ["SRC-002"]),
      groundedText("Segunda narración.", ["SRC-002"]),
    ],
    visual: baseVisual(),
    interaction: null,
    ...overrides,
  };
}

export const SAMPLE_LESSON: LessonPlan = {
  lesson_id: "lesson-course-module-topic-abc123",
  course_id: "curso-demo",
  module_id: "modulo-demo",
  topic_id: "topico-demo",
  content_sha256: "abc123",
  prompt_version: "lesson-v2",
  provider: "fake",
  model: "fake-model",
  lesson_title: groundedText("Introducción a Kubernetes"),
  learning_objectives: [groundedText("Comprender Kubernetes", ["SRC-002"])],
  scenes: [
    makeScene({
      scene_id: "SCENE-001",
      scene_type: "opening",
      title: groundedText("Introducción"),
      visual: baseVisual({ visual_type: "hero", layout_hint: "centered", description: "hint" }),
    }),
    makeScene({
      scene_id: "SCENE-002",
      scene_type: "explanation",
      title: groundedText("Componentes"),
      key_points: [
        groundedText("Un Pod es la unidad mínima.", ["SRC-002"]),
        groundedText("Un Service expone Pods.", ["SRC-002"]),
      ],
      visual: baseVisual(),
    }),
    makeScene({
      scene_id: "SCENE-003",
      scene_type: "recap",
      title: groundedText("Resumen"),
      visual: baseVisual({ visual_type: "none", source_refs: [] }),
    }),
  ],
  recap: [groundedText("Kubernetes orquesta contenedores.", ["SRC-002"])],
  cached: false,
  generated_at: "2026-01-01T00:00:00Z",
};

export function withVisual(
  scene: LessonScene,
  visualType: LessonScene["visual"]["visual_type"],
  refs: string[] = ["SRC-002"],
  overrides: Partial<VisualPlan> = {}
): LessonScene {
  return {
    ...scene,
    visual: baseVisual({
      visual_type: visualType,
      source_refs: refs,
      description: "irrelevant description",
      ...overrides,
    }),
  };
}
