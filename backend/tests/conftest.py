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
def client(content_dir: Path, tmp_path: Path) -> TestClient:
    def _override_settings() -> Settings:
        return Settings(
            content_dir=str(content_dir),
            # Aísla la cache de LessonPlans (Fase 3) y de QuestionBanks de
            # certificación (Fase 6) de los volúmenes reales
            # ./data/lesson-cache y ./data/certification-cache: cada test
            # usa su propio tmp_path, nunca toca el filesystem del host ni
            # deja estado entre tests.
            lesson_cache_dir=str(tmp_path / "lesson-cache"),
            certification_cache_dir=str(tmp_path / "certification-cache"),
            speech_cache_dir=str(tmp_path / "speech-cache"),
            # v1.0.1: fija explícitamente provider + toda credencial. Sin
            # esto, un .env local de desarrollo (gitignored, nunca
            # commiteado, pero posible en la máquina de cualquier dev, con
            # LLM_PROVIDER/una API key real de una sesión de trabajo
            # anterior) se filtra vía docker-compose hacia el container de
            # test y rompe la hermeticidad de los tests "sin credencial"
            # (el provider por default deja de ser "pwc" y/o empiezan a
            # hacer una llamada real en vez de ejercitar el path 503). Los
            # tests nunca deben depender de qué tenga configurado el
            # entorno del desarrollador.
            llm_provider="pwc",
            openai_api_key="",
            pwc_genai_api_key="",
            gen_ai_api_key="",
        )

    app.dependency_overrides[get_settings] = _override_settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
