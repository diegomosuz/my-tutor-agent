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


class TopicResponse(BaseModel):
    course: CourseSummary
    module: ModuleSummary
    topic: TopicSummary
    metadata: TopicMetadata
    content_markdown: str


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "pwc-tutor-agent-backend"
