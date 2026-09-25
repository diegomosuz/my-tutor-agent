"""Tests del ciclo de vida de sesión/engine de `app/db/session.py`
(v1.7.0, Bloque 1)."""
from __future__ import annotations

from sqlalchemy import text

from app.db.session import check_db_reachable, get_engine
from tests.conftest import TEST_DATABASE_URL


def test_get_engine_is_cached_per_url():
    e1 = get_engine(TEST_DATABASE_URL)
    e2 = get_engine(TEST_DATABASE_URL)
    assert e1 is e2


def test_get_db_session_yields_working_session():
    from app.config import Settings
    from app.db.session import get_db_session

    settings = Settings(database_url=TEST_DATABASE_URL)
    gen = get_db_session(settings)
    session = next(gen)
    try:
        result = session.execute(text("SELECT 1")).scalar()
        assert result == 1
    finally:
        gen.close()


def test_check_db_reachable_true_for_real_database():
    assert check_db_reachable(TEST_DATABASE_URL) is True


def test_check_db_reachable_false_for_unreachable_host():
    assert (
        check_db_reachable("postgresql+psycopg://baduser:badpass@nonexistent-host-pwc-tutor:5432/nodb")
        is False
    )
