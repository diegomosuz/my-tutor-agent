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

// ---------------------------------------------------------------------
// Fase 6 — Práctica / simulacro de certificación grounded
//
// IMPORTANTE: esto NO representa ni afirma reproducir un examen oficial
// de ninguna certificación externa. Es "práctica orientada a
// certificación basada exclusivamente en el material del curso".
// ---------------------------------------------------------------------

export type QuestionType = "single_choice" | "multiple_choice";
export type QuestionStyle = "conceptual" | "relationship" | "application";
export type CertificationMode = "practice" | "simulation";

export interface CertificationScope {
  module_ids: string[];
  topic_ids: string[];
}

export interface CertificationPrepareRequest {
  mode: CertificationMode;
  scope: CertificationScope;
  question_count: number;
  shuffle?: boolean;
  seed?: number | null;
}

export interface PublicOption {
  option_id: string;
  text: string;
}

/** Vista pública de una pregunta ANTES de responder. Nunca incluye
 * correct_option_ids, explanation, competency ni derivation_refs. */
export interface ExamQuestionView {
  bank_id: string;
  question_id: string;
  course_id: string;
  module_id: string;
  topic_id: string;
  question_type: QuestionType;
  question_style: QuestionStyle;
  stem: string;
  options: PublicOption[];
}

export interface CertificationPrepareResponse {
  practice_id: string;
  course_id: string;
  mode: CertificationMode;
  requested_count: number;
  actual_count: number;
  questions: ExamQuestionView[];
}

export interface AnswerSubmission {
  bank_id: string;
  question_id: string;
  selected_option_ids: string[];
}

export interface EvaluateSimulationRequest {
  answers: AnswerSubmission[];
}

export type QuestionVerdict = "correct" | "partially_correct" | "incorrect";

/** Solo se recibe DESPUÉS de responder: acá sí vienen correct_option_ids/
 * explanation/competency. */
export interface QuestionEvaluation {
  bank_id: string;
  question_id: string;
  module_id: string;
  topic_id: string;
  question_type: QuestionType;
  selected_option_ids: string[];
  verdict: QuestionVerdict;
  correct_option_ids: string[];
  explanation: GroundedText[];
  competency: GroundedText;
}

export interface TopicBreakdown {
  module_id: string;
  topic_id: string;
  attempted: number;
  correct: number;
  partially_correct: number;
  incorrect: number;
  unanswered: number;
  practice_score_percent: number;
}

export interface CompetencyBreakdown {
  competency: string;
  attempted: number;
  correct: number;
  partially_correct: number;
  incorrect: number;
  practice_score_percent: number;
}

/** practice_score_percent es EXCLUSIVAMENTE el desempeño de esta práctica
 * puntual — nunca una predicción de aprobación de una certificación
 * oficial. */
export interface CertificationPracticeResult {
  total_questions: number;
  correct: number;
  partially_correct: number;
  incorrect: number;
  unanswered: number;
  practice_score_percent: number;
  by_topic: TopicBreakdown[];
  by_competency: CompetencyBreakdown[];
  question_results: QuestionEvaluation[];
  topics_to_reinforce: TopicBreakdown[];
}

// ---------------------------------------------------------------------
// Fase 7 — Sistema, diagnóstico de cursos, voz neural opcional
// ---------------------------------------------------------------------

export type DiagnosticSeverity = "ok" | "warning" | "error";

export interface CourseDiagnosticIssue {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  module_id: string | null;
  topic_id: string | null;
}

export interface CourseDiagnosticReport {
  course_id: string;
  status: DiagnosticSeverity;
  issues: CourseDiagnosticIssue[];
}

export interface CourseDiagnosticsResponse {
  course_count: number;
  status: DiagnosticSeverity;
  reports: CourseDiagnosticReport[];
}

export interface LlmStatus {
  provider: string;
  model: string;
  configured: boolean;
  prompt_version: string;
  certification_prompt_version: string;
}

export interface VoiceStatus {
  provider: string;
  neural_configured: boolean;
  tts_model: string;
}

export interface CoursesStatus {
  count: number;
  diagnostics: DiagnosticSeverity;
}

/** Nunca incluye API keys, headers, prompts ni Grounding Packets. */
export interface SystemStatusResponse {
  app_version: string;
  backend: string;
  courses: CoursesStatus;
  llm: LlmStatus;
  voice: VoiceStatus;
  cache_writable: boolean;
}

export interface ReadyResponse {
  status: "ready" | "not_ready";
  content_readable: boolean;
  data_writable: boolean;
}
