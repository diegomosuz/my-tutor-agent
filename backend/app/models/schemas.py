"""Modelos Pydantic (contratos de la API REST)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class TopicSummary(BaseModel):
    id: str
    title: str
    order: int


class ModuleSummary(BaseModel):
    id: str
    title: str
    order: int
    topics: list[TopicSummary] = Field(default_factory=list)


class CourseSummary(BaseModel):
    id: str
    title: str
    description: str = ""
    order: int
    module_count: int
    topic_count: int


class CourseDetail(BaseModel):
    id: str
    title: str
    description: str = ""
    order: int
    modules: list[ModuleSummary] = Field(default_factory=list)


class TopicMetadata(BaseModel):
    title: str
    order: int
    description: str = ""


class SourceBlock(BaseModel):
    """Unidad canónica y determinística de contenido dentro de un tópico.

    Cada bloque semántico del Markdown (heading, párrafo, lista, código,
    tabla, blockquote, imagen, etc.) se convierte en un SourceBlock con una
    referencia estable (SRC-001, SRC-002, ...) asignada según el orden real
    del documento. El campo `markdown` preserva literalmente el texto fuente
    de ese bloque (mismas líneas del archivo original); `plain_text` es una
    representación auxiliar sin sintaxis Markdown, derivada del mismo texto,
    nunca reformulada ni resumida.
    """

    source_ref: str
    block_type: str
    markdown: str
    plain_text: str
    heading_path: list[str] = Field(default_factory=list)
    start_line: int
    end_line: int


class CanonicalTopicContent(BaseModel):
    """Representación canónica completa de un tópico.

    Se construye de forma 100% determinística a partir del Markdown del
    tópico (sin frontmatter), sin ninguna intervención de un LLM. Es la base
    para el futuro Grounding Packet que se enviará a un proveedor LLM.
    """

    course_id: str
    module_id: str
    topic_id: str
    metadata: TopicMetadata
    raw_markdown: str
    content_sha256: str
    source_blocks: list[SourceBlock] = Field(default_factory=list)
    source_block_count: int


class CanonicalInfo(BaseModel):
    """Subconjunto de `CanonicalTopicContent` expuesto en la API de tópico.

    Omite campos ya presentes en el nivel superior de `TopicResponse`
    (course/module/topic/metadata/content_markdown) para evitar
    redundancia en la respuesta HTTP.
    """

    content_sha256: str
    source_block_count: int
    source_blocks: list[SourceBlock] = Field(default_factory=list)


class GroundingResponse(BaseModel):
    """Respuesta del endpoint de inspección /grounding (herramienta de
    desarrollo, no contiene secretos)."""

    content_sha256: str
    source_block_count: int
    grounding_packet: str


class SourceRefValidationResult(BaseModel):
    valid_refs: list[str] = Field(default_factory=list)
    invalid_refs: list[str] = Field(default_factory=list)


class TopicResponse(BaseModel):
    course: CourseSummary
    module: ModuleSummary
    topic: TopicSummary
    metadata: TopicMetadata
    content_markdown: str
    canonical: CanonicalInfo


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "pwc-tutor-agent-backend"
