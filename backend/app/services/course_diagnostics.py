"""Diagnóstico read-only del filesystem de cursos (Fase 7, sección 10).

Nunca modifica ningún curso. Nunca rechaza el catálogo completo porque un
curso individual tenga un problema: cada curso se diagnostica de forma
aislada, y un error en uno no afecta el reporte de los demás (ver
`app/routers/system.py`, que sigue exponiendo `GET /api/courses` con
normalidad incluso si el diagnóstico marca error en algún curso).
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

import frontmatter

from app.models.system import CourseDiagnosticIssue, CourseDiagnosticReport, DiagnosticSeverity
from app.services.courses import ASSET_MIME_TYPES, _list_subdirs, _list_topic_files
from app.services.naming import slugify
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.courses")

_IMAGE_REF_PATTERN = re.compile(r"!\[[^\]]*\]\(([^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\)")


def _severity_rank(severity: DiagnosticSeverity) -> int:
    return {"ok": 0, "warning": 1, "error": 2}[severity.value]


def _worst(a: DiagnosticSeverity, b: DiagnosticSeverity) -> DiagnosticSeverity:
    return a if _severity_rank(a) >= _severity_rank(b) else b


def _extract_relative_image_refs(markdown: str) -> list[str]:
    refs = []
    for match in _IMAGE_REF_PATTERN.finditer(markdown):
        ref = match.group(1).strip()
        if ref.startswith(("http://", "https://", "data:", "/")):
            continue  # externo o absoluto: fuera del alcance de este chequeo
        refs.append(ref)
    return refs


def _diagnose_topic(
    module_dir: Path, topic_file: Path, module_id: str
) -> tuple[str | None, list[CourseDiagnosticIssue]]:
    issues: list[CourseDiagnosticIssue] = []
    topic_id = slugify(topic_file.stem)

    try:
        raw_bytes = topic_file.read_bytes()
        raw_text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        issues.append(
            CourseDiagnosticIssue(
                code="invalid_utf8",
                severity=DiagnosticSeverity.error,
                message="El archivo no es UTF-8 válido.",
                module_id=module_id,
                topic_id=topic_id,
            )
        )
        return topic_id, issues

    try:
        post = frontmatter.loads(raw_text)
    except Exception as exc:  # frontmatter/yaml puede lanzar varios tipos
        issues.append(
            CourseDiagnosticIssue(
                code="invalid_frontmatter",
                severity=DiagnosticSeverity.error,
                message=f"Frontmatter YAML inválido: {exc}",
                module_id=module_id,
                topic_id=topic_id,
            )
        )
        return topic_id, issues

    if not post.content.strip():
        issues.append(
            CourseDiagnosticIssue(
                code="empty_markdown",
                severity=DiagnosticSeverity.warning,
                message="El tópico no tiene contenido Markdown (después del frontmatter).",
                module_id=module_id,
                topic_id=topic_id,
            )
        )

    module_root = module_dir.resolve()
    for ref in _extract_relative_image_refs(post.content):
        candidate = (module_dir / ref).resolve()
        traversal_or_missing = (
            not candidate.is_relative_to(module_root) or not candidate.is_file()
        )
        if traversal_or_missing:
            issues.append(
                CourseDiagnosticIssue(
                    code="missing_asset",
                    severity=DiagnosticSeverity.warning,
                    message=f"Asset relativo inexistente: {ref}",
                    module_id=module_id,
                    topic_id=topic_id,
                )
            )
        elif candidate.suffix.lower() not in ASSET_MIME_TYPES:
            issues.append(
                CourseDiagnosticIssue(
                    code="unsupported_asset_type",
                    severity=DiagnosticSeverity.warning,
                    message=f"Tipo de asset no soportado: {ref}",
                    module_id=module_id,
                    topic_id=topic_id,
                )
            )

    return topic_id, issues


def _diagnose_course(course_dir: Path) -> CourseDiagnosticReport:
    course_id = slugify(course_dir.name)
    issues: list[CourseDiagnosticIssue] = []

    modules = _list_subdirs(course_dir)
    if not modules:
        issues.append(
            CourseDiagnosticIssue(
                code="empty_course",
                severity=DiagnosticSeverity.warning,
                message="El curso no tiene módulos.",
            )
        )

    seen_module_slugs: dict[str, Path] = {}
    for module_dir in modules:
        module_id = slugify(module_dir.name)
        if module_id in seen_module_slugs:
            issues.append(
                CourseDiagnosticIssue(
                    code="duplicate_slug",
                    severity=DiagnosticSeverity.error,
                    message=f"Slug de módulo duplicado: '{module_id}'.",
                    module_id=module_id,
                )
            )
        seen_module_slugs[module_id] = module_dir

        topics = _list_topic_files(module_dir)
        if not topics:
            issues.append(
                CourseDiagnosticIssue(
                    code="empty_module",
                    severity=DiagnosticSeverity.warning,
                    message="El módulo no tiene tópicos.",
                    module_id=module_id,
                )
            )

        seen_topic_slugs: dict[str, Path] = {}
        for topic_file in topics:
            topic_id, topic_issues = _diagnose_topic(module_dir, topic_file, module_id)
            if topic_id in seen_topic_slugs:
                issues.append(
                    CourseDiagnosticIssue(
                        code="duplicate_slug",
                        severity=DiagnosticSeverity.error,
                        message=f"Slug de tópico duplicado: '{topic_id}'.",
                        module_id=module_id,
                        topic_id=topic_id,
                    )
                )
            seen_topic_slugs[topic_id] = topic_file
            issues.extend(topic_issues)

    status = DiagnosticSeverity.ok
    for issue in issues:
        status = _worst(status, issue.severity)

    return CourseDiagnosticReport(course_id=course_id, status=status, issues=issues)


def run_course_diagnostics(content_path: Path) -> tuple[int, DiagnosticSeverity, list[CourseDiagnosticReport]]:
    """Diagnostica TODOS los cursos reales bajo `content_path`, de forma
    aislada por curso (un curso roto nunca tira abajo el diagnóstico de los
    demás). Nunca modifica nada; solo lectura."""
    course_dirs = _list_subdirs(content_path)
    reports = [_diagnose_course(course_dir) for course_dir in course_dirs]

    overall = DiagnosticSeverity.ok
    for report in reports:
        overall = _worst(overall, report.status)

    if overall == DiagnosticSeverity.ok:
        log_event(logger, "course_scan_completed", course_count=len(course_dirs), status=overall.value)
    else:
        issue_count = sum(len(r.issues) for r in reports)
        log_event(
            logger,
            "course_scan_warning",
            course_count=len(course_dirs),
            status=overall.value,
            issue_count=issue_count,
        )

    return len(course_dirs), overall, reports
