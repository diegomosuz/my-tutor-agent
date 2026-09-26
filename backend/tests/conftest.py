from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import Settings, get_settings
from app.main import app

# v1.7.0: los tests de identidad usan Postgres REAL (PASO 53 -- nunca se
# reemplaza esta validación por SQLite: UUID/constraints/migraciones reales
# de Postgres no se pueden validar contra otro motor). Se deriva de la
# misma DATABASE_URL que ya usa el container (nunca se hardcodea una
# credencial nueva), apuntando a una base de datos DISTINTA ("..._test")
# para no tocar nunca los datos de desarrollo.
_APP_DATABASE_URL = make_url(
    os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://pwc_tutor:pwc_tutor_dev_password@postgres:5432/pwc_tutor",
    )
)
_TEST_DB_NAME = f"{_APP_DATABASE_URL.database}_test"
# `str(URL)`/`repr(URL)` enmascaran la password como "***" (pensado para
# logs, nunca para uso real) -- `render_as_string(hide_password=False)` es
# la única forma correcta de obtener la cadena de conexión REAL acá.
TEST_DATABASE_URL = _APP_DATABASE_URL.set(database=_TEST_DB_NAME).render_as_string(hide_password=False)
_ALEMBIC_INI_PATH = Path(__file__).resolve().parent.parent / "alembic.ini"


@pytest.fixture(scope="session", autouse=True)
def _test_database() -> None:
    """Crea (si falta) la base de datos Postgres dedicada a tests y aplica
    las migraciones reales de Alembic una vez por sesión de tests."""
    # Se pasa el objeto URL directamente (nunca su str()/repr(), que
    # enmascara la password) -- create_engine acepta un sqlalchemy.URL.
    maintenance_engine = create_engine(_APP_DATABASE_URL, isolation_level="AUTOCOMMIT")
    try:
        with maintenance_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": _TEST_DB_NAME}
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{_TEST_DB_NAME}"'))
    finally:
        maintenance_engine.dispose()

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_ALEMBIC_INI_PATH))
    cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def _clean_identity_tables() -> None:
    """Aísla cada test de identidad/progreso: trunca las tablas de
    aplicación antes de cada test (CASCADE cubre las FK: truncar
    `app_users` arrastra `user_identities`/`topic_progress`, pero se listan
    las tres explícitamente por claridad). Nunca corre contra la base de
    datos de desarrollo (siempre TEST_DATABASE_URL)."""
    engine = create_engine(TEST_DATABASE_URL)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "TRUNCATE TABLE certification_topic_results, certification_attempts, "
                    "topic_progress, user_identities, app_users RESTART IDENTITY CASCADE"
                )
            )
    finally:
        engine.dispose()
    yield


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
            # v1.7.0: aísla la identidad de tests de la DB de desarrollo
            # real (nunca ./data ni el Postgres "pwc_tutor" real) y fija
            # AUTH_MODE explícitamente (mismo criterio de hermeticidad que
            # el resto de esta función, ver v1.0.1 en CLAUDE.md).
            database_url=TEST_DATABASE_URL,
            auth_mode="dev",
        )

    app.dependency_overrides[get_settings] = _override_settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
