"""Tests de `app/services/identity_resolver.py` (v1.7.0, Bloque 1) contra
Postgres REAL (ver `tests/conftest.py::TEST_DATABASE_URL` -- nunca SQLite:
la constraint UNIQUE de `(provider, issuer, subject)` y la carrera de
`IntegrityError` son comportamiento real de Postgres)."""
from __future__ import annotations

import threading

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.services.identity_provider import Principal
from app.services.identity_resolver import resolve_application_user
from tests.conftest import TEST_DATABASE_URL


def _session() -> Session:
    return Session(get_engine(TEST_DATABASE_URL))


def _principal(subject: str, **kwargs) -> Principal:
    return Principal(provider="dev", issuer="pwc-ai-tutor-local", subject=subject, **kwargs)


def test_first_seen_creates_app_user():
    session = _session()
    try:
        user = resolve_application_user(session, _principal("student-a"))
        session.commit()
        assert user.id is not None
    finally:
        session.close()


def test_repeated_principal_returns_same_app_user():
    session = _session()
    try:
        principal = _principal("student-a")
        first = resolve_application_user(session, principal)
        session.commit()
        second = resolve_application_user(session, principal)
        session.commit()
        assert first.id == second.id
    finally:
        session.close()


def test_different_subjects_create_different_app_users():
    session = _session()
    try:
        a = resolve_application_user(session, _principal("student-a"))
        session.commit()
        b = resolve_application_user(session, _principal("student-b"))
        session.commit()
        assert a.id != b.id
    finally:
        session.close()


def test_profile_attributes_update_without_changing_identity():
    session = _session()
    try:
        principal = _principal("student-a", display_name="Ana", email="ana@example.com")
        user = resolve_application_user(session, principal)
        session.commit()
        assert user.display_name == "Ana"
        assert user.email == "ana@example.com"
        original_id = user.id

        updated = _principal("student-a", display_name="Ana Roig", email="ana@example.com")
        user2 = resolve_application_user(session, updated)
        session.commit()
        assert user2.id == original_id
        assert user2.display_name == "Ana Roig"
    finally:
        session.close()


def test_missing_profile_attributes_never_erase_previously_stored_values():
    session = _session()
    try:
        principal = _principal("student-a", display_name="Ana")
        resolve_application_user(session, principal)
        session.commit()

        no_display_name = _principal("student-a")
        user = resolve_application_user(session, no_display_name)
        session.commit()
        assert user.display_name == "Ana"
    finally:
        session.close()


def test_concurrent_first_seen_never_creates_two_app_users():
    """PASO 29: dos requests concurrentes para el mismo Principal nunca
    deben crear dos AppUser -- prueba real con threads + Postgres real,
    no un mock de IntegrityError."""
    principal = _principal("student-concurrent")
    engine = get_engine(TEST_DATABASE_URL)
    results: list[str] = []
    errors: list[Exception] = []
    barrier = threading.Barrier(5)

    def _worker() -> None:
        session = Session(engine)
        try:
            barrier.wait()
            user = resolve_application_user(session, principal)
            session.commit()
            results.append(str(user.id))
        except Exception as exc:  # pragma: no cover - solo si algo real falla
            errors.append(exc)
        finally:
            session.close()

    threads = [threading.Thread(target=_worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"Errores inesperados en la resolución concurrente: {errors}"
    assert len(set(results)) == 1, "La carrera produjo más de un AppUser distinto"

    verify_session = Session(engine)
    try:
        count = verify_session.execute(
            text("SELECT COUNT(*) FROM user_identities WHERE subject = :subject"),
            {"subject": "student-concurrent"},
        ).scalar()
    finally:
        verify_session.close()
    assert count == 1
