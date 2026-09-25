"""Ciclo de vida de conexión/sesión Postgres (v1.7.0).

Decisión de simplicidad (audit PASO 12): SQLAlchemy SÍNCRONO, no async.
Todo el resto del backend es 100% sincrónico (endpoints `def`, no
`async def`; ningún servicio existente usa `await`) y las operaciones de
Bloque 1 son lecturas/escrituras de una sola fila -- no hay ninguna
justificación real para introducir un segundo modelo de concurrencia
(driver async + engine async) solo por el hábito de "FastAPI es async".
Uvicorn ejecuta los endpoints `def` en un threadpool, que es exactamente
donde una llamada de DB sincrónica corta debe vivir.

`get_engine` cachea por `database_url` (string, hashable) en vez de por la
instancia de `Settings` (no hasheable de forma estable, y los tests la
reemplazan vía `app.dependency_overrides`): esto permite que cada
`database_url` distinto (dev vs. test) tenga su propio engine/pool, sin
que el override de Settings en tests rompa el cacheo.
"""
from __future__ import annotations

import logging
from collections.abc import Generator
from functools import lru_cache

from fastapi import Depends
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.db")


@lru_cache
def get_engine(database_url: str) -> Engine:
    # pool_pre_ping evita devolver una conexión muerta de un pool viejo
    # (ej. Postgres reiniciado) como si estuviera sana -- sin esto, un
    # restart del container de Postgres podía dejar el pool del backend
    # sirviendo conexiones rotas hasta el próximo reciclado natural.
    return create_engine(database_url, pool_pre_ping=True)


def check_db_reachable(database_url: str) -> bool:
    """Usado por GET /api/ready (nunca por un request funcional normal):
    intenta un `SELECT 1` con un timeout de conexión corto y acotado, para
    que Postgres caído nunca deje la readiness colgada. Usa un engine
    efímero propio (no el cacheado por `get_engine`) para no imponerle este
    `connect_timeout` corto al pool normal de la aplicación."""
    try:
        probe_engine = create_engine(database_url, connect_args={"connect_timeout": 2})
        try:
            with probe_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        finally:
            probe_engine.dispose()
    except SQLAlchemyError as exc:
        # Nunca se loguea el mensaje crudo de la excepción (algunos
        # drivers incluyen host/usuario en el texto de error) ni
        # database_url -- solo el tipo de excepción, suficiente para
        # diagnosticar sin exponer nada sensible.
        log_event(logger, "db_reachability_check_failed", error_type=type(exc).__name__)
        return False


def get_db_session(settings: Settings = Depends(get_settings)) -> Generator[Session, None, None]:
    """Dependency de FastAPI: una Session por request, con commit/rollback
    explícito. Nunca una Session global mutable a nivel de módulo."""
    engine = get_engine(settings.database_url)
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
