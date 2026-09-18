"""Tests de robustez del discovery de cursos (Fase 7, sección 11): archivos
y directorios "basura" del sistema operativo/herramientas de compresión
nunca deben aparecer como curso/módulo/tópico, y un curso/módulo vacío
nunca debe romper el catálogo."""
from __future__ import annotations

from pathlib import Path

from app.services import courses as course_service


def _make_content_dir(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    course = content_dir / "curso-demo"
    module = course / "01-modulo"
    module.mkdir(parents=True)
    (module / "01-topico.md").write_text("# Tema\n\nContenido.\n", encoding="utf-8")
    return content_dir


def test_ds_store_ignored_as_course(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    (content_dir / ".DS_Store").write_text("basura", encoding="utf-8")
    courses = course_service.list_courses(content_dir)
    assert [c.id for c in courses] == ["curso-demo"]


def test_hidden_directory_ignored(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    (content_dir / ".hidden").mkdir()
    courses = course_service.list_courses(content_dir)
    assert [c.id for c in courses] == ["curso-demo"]


def test_macosx_directory_ignored(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    (content_dir / "__MACOSX").mkdir()
    courses = course_service.list_courses(content_dir)
    assert [c.id for c in courses] == ["curso-demo"]


def test_thumbs_db_ignored_as_topic(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    module_dir = content_dir / "curso-demo" / "01-modulo"
    (module_dir / "Thumbs.db").write_text("basura binaria", encoding="utf-8")
    detail = course_service.get_course_detail(content_dir, "curso-demo")
    topic_ids = [t.id for t in detail.modules[0].topics]
    assert topic_ids == ["topico"]


def test_non_markdown_file_never_becomes_a_topic(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    module_dir = content_dir / "curso-demo" / "01-modulo"
    (module_dir / "notes.txt").write_text("no es un tópico", encoding="utf-8")
    (module_dir / "images").mkdir()
    (module_dir / "images" / "diagram.png").write_bytes(b"\x89PNG\r\n")
    detail = course_service.get_course_detail(content_dir, "curso-demo")
    topic_ids = [t.id for t in detail.modules[0].topics]
    assert topic_ids == ["topico"]


def test_empty_course_does_not_crash_catalog(tmp_path):
    content_dir = tmp_path / "content"
    (content_dir / "curso-vacio").mkdir(parents=True)
    courses = course_service.list_courses(content_dir)
    assert courses[0].id == "curso-vacio"
    assert courses[0].module_count == 0


def test_empty_module_does_not_crash_course_detail(tmp_path):
    content_dir = tmp_path / "content"
    (content_dir / "curso-demo" / "01-modulo-vacio").mkdir(parents=True)
    detail = course_service.get_course_detail(content_dir, "curso-demo")
    assert detail.modules[0].topics == []
