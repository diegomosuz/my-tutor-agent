// Tipos espejo de los modelos Pydantic del backend (ver backend/app/models/schemas.py)

export interface TopicSummary {
  id: string;
  title: string;
  order: number;
}

export interface ModuleSummary {
  id: string;
  title: string;
  order: number;
  topics: TopicSummary[];
}

export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  order: number;
  module_count: number;
  topic_count: number;
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string;
  order: number;
  modules: ModuleSummary[];
}

export interface TopicMetadata {
  title: string;
  order: number;
  description: string;
}

export interface SourceBlock {
  source_ref: string;
  block_type: string;
  markdown: string;
  plain_text: string;
  heading_path: string[];
  start_line: number;
  end_line: number;
}

export interface CanonicalInfo {
  content_sha256: string;
  source_block_count: number;
  source_blocks: SourceBlock[];
}

export interface TopicResponse {
  course: CourseSummary;
  module: ModuleSummary;
  topic: TopicSummary;
  metadata: TopicMetadata;
  content_markdown: string;
  canonical: CanonicalInfo;
}

export interface GroundingResponse {
  content_sha256: string;
  source_block_count: number;
  grounding_packet: string;
}

// ---------------------------------------------------------------------
// Fase 3 — LessonPlan generada por IA
// ---------------------------------------------------------------------

export interface GroundedText {
  text: string;
  source_refs: string[];
}

export type VisualType =
  | "none"
  | "hero"
  | "bullets"
  | "process"
  | "comparison"
  | "hierarchy"
  | "architecture"
  | "concept_map"
  | "table"
  | "code"
  | "quote";

export type LayoutHint =
  | "default"
  | "left_to_right"
  | "top_down"
  | "two_column"
  | "centered";

export interface VisualPlan {
  visual_type: VisualType;
  layout_hint: LayoutHint;
  source_refs: string[];
  description: string;
}

export type InteractionType = "comprehension_check" | "reflection";

export interface InteractionPlan {
  interaction_type: InteractionType;
  question: GroundedText;
  expected_answer: GroundedText | null;
}

export type SceneType =
  | "introduction"
  | "explanation"
  | "visual_explanation"
  | "checkpoint"
  | "recap";

export interface LessonScene {
  scene_id: string;
  scene_type: SceneType;
  title: GroundedText;
  key_points: GroundedText[];
  narration: GroundedText[];
  visual: VisualPlan;
  interaction: InteractionPlan | null;
}

export interface LessonPlan {
  lesson_id: string;
  course_id: string;
  module_id: string;
  topic_id: string;
  content_sha256: string;
  prompt_version: string;
  provider: string;
  model: string;
  lesson_title: GroundedText;
  learning_objectives: GroundedText[];
  scenes: LessonScene[];
  recap: GroundedText[];
  cached: boolean;
  generated_at: string;
}

export interface AiStatusResponse {
  provider: string;
  model: string;
  configured: boolean;
  prompt_version: string;
}

// ---------------------------------------------------------------------
// Fase 5 — Tutor interactivo grounded + Checkpoints
// ---------------------------------------------------------------------

export type TutorRole = "user" | "assistant";

export interface TutorMessage {
  role: TutorRole;
  content: string;
}

export interface TutorRequest {
  message: string;
  scene_id: string | null;
  recent_history: TutorMessage[];
}

export type TutorResponseType = "answer" | "not_covered" | "clarification";

export interface TutorReplyBody {
  response_type: TutorResponseType;
  answer_chunks: GroundedText[];
  clarification_question: string | null;
}

export interface CheckpointRequest {
  scene_id: string;
  answer: string;
}

export type CheckpointVerdict = "correct" | "partially_correct" | "incorrect" | "not_assessable";

export interface CheckpointEvaluationBody {
  verdict: CheckpointVerdict;
  feedback: GroundedText[];
  ideal_answer: GroundedText | null;
}
