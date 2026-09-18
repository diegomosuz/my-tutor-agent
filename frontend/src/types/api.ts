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
