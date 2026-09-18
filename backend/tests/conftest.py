from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


@pytest.fixture
def content_dir(tmp_path: Path) -> Path:
    """Crea una estructura de cursos de prueba en un directorio temporal."""
    course = tmp_path / "01-curso-de-prueba"
    course.mkdir()

    module1 = course / "01-fundamentos"
    module1.mkdir()
    (module1 / "01-introduccion.md").write_text(
        "---\n"
        "title: Introducción\n"
        "order: 1\n"
        "description: Un tema de prueba\n"
        "---\n"
        "# Introducción\n\n"
        "Contenido de prueba para el tema de introducción.\n",
        encoding="utf-8",
    )
    (module1 / "02-componentes.md").write_text(
        "# Componentes\n\nContenido sin frontmatter.\n",
        encoding="utf-8",
    )

    module2 = course / "02-arquitecturas"
    module2.mkdir()
    (module2 / "01-arquitectura-empresarial.md").write_text(
        "# Arquitectura empresarial\n\nOtro contenido de prueba.\n",
        encoding="utf-8",
    )

    return tmp_path


@pytest.fixture
def client(content_dir: Path) -> TestClient:
    def _override_settings() -> Settings:
        return Settings(content_dir=str(content_dir))

    app.dependency_overrides[get_settings] = _override_settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
