"""Tests de app/services/course_diagnostics.py (Fase 7, sección 10):
read-only, nunca modifica cursos, aísla errores por curso."""
from __future__ import annotations

from pathlib import Path

from app.services import course_diagnostics


def test_healthy_course_reports_ok(tmp_path):
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-topico.md").write_text("# Tema\n\nContenido real.\n", encoding="utf-8")

    count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    assert count == 1
    assert status == "ok"
    assert reports[0].status == "ok"
    assert reports[0].issues == []


def test_course_without_modules_is_warning(tmp_path):
    content_dir = tmp_path / "content"
    (content_dir / "curso-vacio").mkdir(parents=True)

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    assert status == "warning"
    assert reports[0].issues[0].code == "empty_course"


def test_module_without_topics_is_warning(tmp_path):
    content_dir = tmp_path / "content"
    (content_dir / "curso" / "01-modulo-vacio").mkdir(parents=True)

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    issue_codes = [i.code for i in reports[0].issues]
    assert "empty_module" in issue_codes
    assert status == "warning"


def test_empty_markdown_topic_is_warning(tmp_path):
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-topico.md").write_text("---\ntitle: Vacío\n---\n", encoding="utf-8")

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    issue_codes = [i.code for i in reports[0].issues]
    assert "empty_markdown" in issue_codes
    assert status == "warning"


def test_invalid_frontmatter_is_error(tmp_path):
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-topico.md").write_text(
        "---\ntitle: [unclosed\n---\nContenido.\n", encoding="utf-8"
    )

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    issue_codes = [i.code for i in reports[0].issues]
    assert "invalid_frontmatter" in issue_codes
    assert status == "error"


def test_invalid_utf8_is_error(tmp_path):
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-topico.md").write_bytes(b"\xff\xfe# Titulo invalido\xff")

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    issue_codes = [i.code for i in reports[0].issues]
    assert "invalid_utf8" in issue_codes
    assert status == "error"


def test_missing_relative_asset_is_warning(tmp_path):
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-topico.md").write_text(
        "# Tema\n\n![Diagrama](images/no-existe.png)\n", encoding="utf-8"
    )

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    issue_codes = [i.code for i in reports[0].issues]
    assert "missing_asset" in issue_codes
    assert status == "warning"


def test_unsupported_asset_type_is_warning(tmp_path):
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    images = module / "images"
    images.mkdir(parents=True)
    (module / "01-topico.md").write_text(
        "# Tema\n\n![Diagrama](images/diagram.svg)\n", encoding="utf-8"
    )
    (images / "diagram.svg").write_text("<svg></svg>", encoding="utf-8")

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    issue_codes = [i.code for i in reports[0].issues]
    assert "unsupported_asset_type" in issue_codes


def test_existing_supported_asset_has_no_issue(tmp_path):
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    images = module / "images"
    images.mkdir(parents=True)
    (module / "01-topico.md").write_text(
        "# Tema\n\n![Diagrama](images/diagram.png)\n", encoding="utf-8"
    )
    (images / "diagram.png").write_bytes(b"\x89PNG\r\n")

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    assert reports[0].issues == []
    assert status == "ok"


def test_external_http_image_ref_is_never_flagged(tmp_path):
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-topico.md").write_text(
        "# Tema\n\n![Externa](https://example.com/img.png)\n", encoding="utf-8"
    )

    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    assert reports[0].issues == []


def test_one_broken_course_does_not_affect_other_courses(tmp_path):
    content_dir = tmp_path / "content"
    broken_module = content_dir / "curso-roto" / "01-modulo"
    broken_module.mkdir(parents=True)
    (broken_module / "01-topico.md").write_bytes(b"\xff\xfe\xff")

    healthy_module = content_dir / "curso-sano" / "01-modulo"
    healthy_module.mkdir(parents=True)
    (healthy_module / "01-topico.md").write_text("# Tema\n\nContenido.\n", encoding="utf-8")

    count, overall_status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    assert count == 2
    assert overall_status == "error"
    by_id = {r.course_id: r for r in reports}
    assert by_id["curso-roto"].status == "error"
    assert by_id["curso-sano"].status == "ok"


def test_duplicate_topic_slug_is_warning(tmp_path):
    """v1.0.1 — bug real corregido: `duplicate_slug` bajó de `error` a
    `warning`. Causa raíz de un falso "diagnostico: error" reportado sobre
    un curso real ("Claude Foundations Certification") que funcionaba
    perfectamente de punta a punta (catálogo, aula, TTS, certificación) —
    `_resolve_by_slug` siempre toma el primer match determinísticamente,
    así que una colisión de slugs nunca rompe la app, solo "sombrea" el
    segundo archivo (mismo tipo de situación que un asset no soportado,
    que ya era `warning`). `error` queda reservado para tópicos
    literalmente ilegibles (UTF-8/frontmatter inválido)."""
    content_dir = tmp_path / "content"
    module = content_dir / "curso" / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-tema.md").write_text("# Tema A\n\nContenido.\n", encoding="utf-8")
    (module / "02-tema.md").write_text("# Tema B\n\nContenido.\n", encoding="utf-8")
    # Ambos archivos producen el mismo slug "tema" (el prefijo numérico se
    # descarta al generar el slug) — duplicado real.
    _count, status, reports = course_diagnostics.run_course_diagnostics(content_dir)
    issue_codes = [i.code for i in reports[0].issues]
    assert "duplicate_slug" in issue_codes
    assert status == "warning"
