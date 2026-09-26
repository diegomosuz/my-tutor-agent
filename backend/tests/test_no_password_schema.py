"""Auditoría permanente (v1.7.0, PASO 33/CLAUDE.md sección 2/10 no
negociable): ninguna tabla/columna del esquema de identidad puede
representar una credencial de autenticación propia -- la identidad viene
siempre de un IdentityProvider externo ya confiable (hoy DevIdentityProvider;
a futuro Entra ID). Se introspecciona el metadata REAL de SQLAlchemy (no el
texto de un archivo), así que cualquier columna futura queda cubierta
automáticamente."""
from __future__ import annotations

from app.db.models import Base

_FORBIDDEN_SUBSTRINGS = ("password", "passwd", "pwd", "salt", "reset_token", "secret", "credential")


def test_schema_never_contains_credential_columns():
    offending: list[str] = []
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            lowered = column.name.lower()
            if any(forbidden in lowered for forbidden in _FORBIDDEN_SUBSTRINGS):
                offending.append(f"{table.name}.{column.name}")
    assert not offending, f"Columnas de credencial encontradas (prohibido): {offending}"


def test_expected_tables_exist_and_nothing_else_in_block_3():
    """v1.7.0 Bloque 3: agrega `certification_attempts`/
    `certification_topic_results`. Guided Review/VerificationContext/
    LearningState siguen sin persistirse -- LearningState nunca se
    persiste, punto (queda siempre derivado)."""
    assert set(Base.metadata.tables.keys()) == {
        "app_users",
        "user_identities",
        "topic_progress",
        "certification_attempts",
        "certification_topic_results",
    }
