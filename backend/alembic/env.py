"""Entorno de Alembic (v1.7.0). `DATABASE_URL` se resuelve SIEMPRE vía la
`Settings` central del backend (nunca se duplica la construcción de la
cadena de conexión acá) -- salvo que el caller de Alembic ya haya fijado
`sqlalchemy.url` explícitamente en el `Config` (usado por
`backend/tests/conftest.py` para apuntar las migraciones a la base de
datos de test, real Postgres, nunca SQLite)."""
from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.db.models import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    # disable_existing_loggers=False (bug real encontrado en QA, v1.7.0):
    # el default de fileConfig es True, lo que DESHABILITA cualquier logger
    # ya existente que no esté declarado en alembic.ini (ej.
    # "pwc_tutor.tutor"/"pwc_tutor.lesson", ver app/services/service_logging.py)
    # -- como las migraciones corren dentro del mismo proceso de pytest
    # (tests/conftest.py::_test_database), esto silenciaba esos loggers
    # para el resto de la sesión de tests completa (caplog dejaba de
    # capturar nada), sin afectar nunca al comportamiento real en runtime.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def get_url() -> str:
    explicit_url = config.get_main_option("sqlalchemy.url")
    if explicit_url:
        return explicit_url
    return get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(configuration, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
