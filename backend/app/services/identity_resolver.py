"""Application User Resolver (v1.7.0, Bloque 1).

Traduce un `Principal` (efímero, ver `app/services/identity_provider.py`) a
un `AppUser` persistido en Postgres, creándolo en el primer contacto
("first-seen provisioning" -- nunca "registro": la identidad ya viene
autenticada por el `IdentityProvider`, la app solo crea acá el perfil
funcional interno).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import AppUser, UserIdentity
from app.services.identity_provider import Principal
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.identity")


def _find_identity(session: Session, principal: Principal) -> UserIdentity | None:
    stmt = select(UserIdentity).where(
        UserIdentity.provider == principal.provider,
        UserIdentity.issuer == principal.issuer,
        UserIdentity.subject == principal.subject,
    )
    return session.execute(stmt).scalar_one_or_none()


def _sync_profile_attributes(user: AppUser, principal: Principal) -> None:
    # Actualiza las copias informativas si la identidad trae un valor nuevo;
    # nunca cambia la identidad externa (provider/issuer/subject) ni borra
    # un valor ya guardado por uno ausente en esta request puntual.
    if principal.display_name is not None:
        user.display_name = principal.display_name
    if principal.email is not None:
        user.email = principal.email


def resolve_application_user(session: Session, principal: Principal) -> AppUser:
    """Busca el `AppUser` de esta identidad externa; si es la primera vez
    que se la ve, lo crea de forma atómica y a prueba de carreras (dos
    requests concurrentes para el mismo `Principal` nunca crean dos
    `AppUser` -- ver `uq_user_identities_provider_issuer_subject`)."""
    now = datetime.now(timezone.utc)

    identity = _find_identity(session, principal)
    if identity is not None:
        identity.last_seen_at = now
        _sync_profile_attributes(identity.user, principal)
        session.flush()
        log_event(logger, "identity_resolved", user_id=str(identity.user.id), provider=principal.provider, created=False)
        return identity.user

    user = AppUser(display_name=principal.display_name, email=principal.email)
    identity = UserIdentity(
        user=user,
        provider=principal.provider,
        issuer=principal.issuer,
        subject=principal.subject,
        tenant_id=principal.tenant_id,
        external_object_id=principal.external_object_id,
        last_seen_at=now,
    )
    session.add(user)
    session.add(identity)
    try:
        session.flush()
    except IntegrityError:
        # Otra request concurrente ganó la carrera de creación: descarta
        # este intento y reutiliza el AppUser que sí quedó persistido.
        session.rollback()
        existing = _find_identity(session, principal)
        if existing is None:
            raise
        existing.last_seen_at = now
        _sync_profile_attributes(existing.user, principal)
        session.flush()
        log_event(
            logger, "identity_resolved", user_id=str(existing.user.id), provider=principal.provider,
            created=False, race_lost=True,
        )
        return existing.user

    log_event(logger, "identity_resolved", user_id=str(user.id), provider=principal.provider, created=True)
    return user
