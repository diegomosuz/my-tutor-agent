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

export interface TopicResponse {
  course: CourseSummary;
  module: ModuleSummary;
  topic: TopicSummary;
  metadata: TopicMetadata;
  content_markdown: string;
}
