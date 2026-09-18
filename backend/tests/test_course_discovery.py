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


def test_symlinked_module_never_listed_or_resolved(tmp_path):
    """Fase 8, sección 7: un módulo entero puede ser, técnicamente, un
    symlink apuntando fuera de /content (ej. un curso descargado como zip
    que contenía un symlink sin que el usuario lo supiera). Antes del fix
    de esta fase, `Path.resolve()` seguía el symlink de forma transparente
    y el chequeo de contención de `resolve_topic_asset` terminaba
    comparando contra la raíz YA escapada, no contra /content real —
    permitiendo servir contenido de fuera del árbol autorizado. Un módulo
    symlinkeado debe comportarse como si no existiera."""
    content_dir = tmp_path / "content"
    outside_dir = tmp_path / "outside-secret"
    outside_dir.mkdir(parents=True)
    (outside_dir / "01-topico.md").write_text("# Secreto\n\nfuera de /content.\n", encoding="utf-8")

    course_dir = content_dir / "curso-x"
    course_dir.mkdir(parents=True)
    evil_module = course_dir / "02-evil"
    evil_module.symlink_to(outside_dir, target_is_directory=True)

    detail = course_service.get_course_detail(content_dir, "curso-x")
    assert detail.modules == []

    from app.services.courses import ModuleNotFoundError

    try:
        course_service.get_topic(content_dir, "curso-x", "evil", "topico")
        assert False, "se esperaba ModuleNotFoundError"
    except ModuleNotFoundError:
        pass


def test_symlinked_topic_file_never_resolved(tmp_path):
    """Un .md individual symlinkeado fuera de /content tampoco debe
    aparecer como tópico válido, incluso dentro de un módulo legítimo."""
    content_dir = tmp_path / "content"
    outside_dir = tmp_path / "outside-secret"
    outside_dir.mkdir(parents=True)
    (outside_dir / "secret.md").write_text("# Secreto\n", encoding="utf-8")

    module_dir = content_dir / "curso-y" / "01-modulo"
    module_dir.mkdir(parents=True)
    (module_dir / "01-real.md").write_text("# Real\n\nContenido legitimo.\n", encoding="utf-8")
    (module_dir / "02-evil-topic.md").symlink_to(outside_dir / "secret.md")

    detail = course_service.get_course_detail(content_dir, "curso-y")
    topic_ids = [t.id for t in detail.modules[0].topics]
    assert topic_ids == ["real"]

    from app.services.courses import TopicNotFoundError

    try:
        course_service.get_topic(content_dir, "curso-y", "modulo", "evil-topic")
        assert False, "se esperaba TopicNotFoundError"
    except TopicNotFoundError:
        pass


def test_symlinked_asset_file_never_served(tmp_path):
    """Un asset individual symlinkeado dentro de un módulo legítimo
    tampoco debe poder servir contenido de fuera de /content."""
    content_dir = tmp_path / "content"
    outside_dir = tmp_path / "outside-secret"
    outside_dir.mkdir(parents=True)
    (outside_dir / "secret.png").write_bytes(b"\x89PNG\r\n\x1a\nSECRETDATA")

    module_dir = content_dir / "curso-z" / "01-modulo"
    images_dir = module_dir / "images"
    images_dir.mkdir(parents=True)
    (module_dir / "01-real.md").write_text("# Real\n", encoding="utf-8")
    (images_dir / "evil.png").symlink_to(outside_dir / "secret.png")

    from app.services.courses import AssetNotFoundError

    try:
        course_service.resolve_topic_asset(
            content_dir, "curso-z", "modulo", "real", "images/evil.png"
        )
        assert False, "se esperaba AssetNotFoundError"
    except AssetNotFoundError:
        pass
