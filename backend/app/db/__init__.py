"""Persistencia PostgreSQL (v1.7.0). Ver docs/SERVER_SIDE_PROFILE_V1_7.md.

Alcance de Bloque 1: exclusivamente `AppUser`/`UserIdentity` (identidad de
aplicación). Ninguna tabla de progreso/certificación/LearningState vive acá
todavía -- eso es de un bloque futuro.
"""
from app.db.session import get_db_session, get_engine

__all__ = ["get_db_session", "get_engine"]
