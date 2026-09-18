"""Modelos de diagnóstico y estado del sistema (Fase 7). Ningún modelo de
este archivo puede exponer secretos: API keys, Authorization headers,
prompts, Grounding Packets ni rutas de filesystem del host completas."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class DiagnosticSeverity(str, Enum):
    ok = "ok"
    warning = "warning"
    error = "error"


class CourseDiagnosticIssue(BaseModel):
    code: str
    severity: DiagnosticSeverity
    message: str
    module_id: str | None = None
    topic_id: str | None = None


class CourseDiagnosticReport(BaseModel):
    course_id: str
    status: DiagnosticSeverity
    issues: list[CourseDiagnosticIssue] = Field(default_factory=list)


class CourseDiagnosticsResponse(BaseModel):
    course_count: int
    status: DiagnosticSeverity
    reports: list[CourseDiagnosticReport] = Field(default_factory=list)


class LlmStatus(BaseModel):
    provider: str
    model: str
    configured: bool
    prompt_version: str
    certification_prompt_version: str


class VoiceStatus(BaseModel):
    provider: str
    neural_configured: bool
    tts_model: str


class CoursesStatus(BaseModel):
    count: int
    diagnostics: DiagnosticSeverity


class SystemStatusResponse(BaseModel):
    app_version: str
    backend: str
    courses: CoursesStatus
    llm: LlmStatus
    voice: VoiceStatus
    cache_writable: bool


class ReadyResponse(BaseModel):
    status: str
    content_readable: bool
    data_writable: bool
