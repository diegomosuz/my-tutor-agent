"""Dependencies de FastAPI compartidas entre routers (v1.7.0).

`get_current_app_user` es el ÚNICO punto de entrada que un router funcional
debe usar para saber "quién es el usuario actual" -- nunca debe leer
`X-Dev-User` (ni, a futuro, un JWT de Entra) directamente:

    Request -> IdentityProvider -> Principal -> Application User Resolver -> AppUser
"""
from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.models import AppUser
from app.db.session import get_db_session
from app.services.identity_provider import (
    IdentityConfigurationError,
    IdentityHeaderInvalidError,
    get_identity_provider,
)
from app.services.identity_resolver import resolve_application_user
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.identity")


def get_current_app_user(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
) -> AppUser:
    try:
        provider = get_identity_provider(settings.auth_mode)
        principal = provider.resolve(request)
    except IdentityConfigurationError as exc:
        # Config de backend inválida (nunca un dato enviado por el
        # cliente): 503, mismo criterio que LLMConfigurationError.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except IdentityHeaderInvalidError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        return resolve_application_user(session, principal)
    except SQLAlchemyError as exc:
        # Postgres inalcanzable/caído en este momento puntual (bug real de
        # QA, v1.7.0: sin este catch, un Postgres caído producía un 500
        # crudo en vez de un error claro y esperable -- mismo criterio que
        # LLMUpstreamError -> 502 para un proveedor externo caído). Nunca
        # se filtra el detalle crudo de SQLAlchemy (podría incluir la
        # cadena de conexión).
        log_event(logger, "identity_resolution_db_error", error_type=type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="La base de datos no está disponible en este momento. Intentá nuevamente más tarde.",
        ) from exc
