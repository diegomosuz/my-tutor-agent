"""Abstracción de proveedor de identidad (v1.7.0, Bloque 1).

```
Identity Provider -> Principal -> Application User Resolver -> app_user.id
```

`IdentityProvider` es la ÚNICA capa que convierte una request HTTP en un
`Principal` confiable. Ningún servicio funcional debe leer el header
`X-Dev-User` (ni, a futuro, un JWT de Entra) directamente -- ver
`app/dependencies.py::get_current_app_user`, el único punto de entrada que
el resto de la aplicación debe usar.

`AUTH_MODE` (config del backend, nunca un valor enviado desde un request):
- "dev": `DevIdentityProvider`, soportado hoy.
- "entra": reservado para Microsoft Entra ID (PwC SSO). NO implementado en
  esta versión -- seleccionarlo produce `IdentityConfigurationError`
  explícito, nunca una implementación falsa que acepte un JWT sin validar.
- cualquier otro valor: `IdentityConfigurationError` (nunca un fallback
  silencioso, mismo criterio que `LLM_PROVIDER` en
  `app/services/llm_provider.py`).

Postgres/`app_users`/`user_identities` NUNCA son el proveedor de identidad:
son mapeos funcionales a una identidad externa que este módulo ya validó
(hoy, trivialmente, en modo dev; a futuro, validando un JWT de Entra).
"""
from __future__ import annotations

import re
from abc import ABC, abstractmethod

from fastapi import Request
from pydantic import BaseModel

_SUPPORTED_AUTH_MODES = ("dev",)
_DEV_ISSUER = "pwc-ai-tutor-local"
_DEV_DEFAULT_SUBJECT = "dev-user-default"
_DEV_HEADER_NAME = "X-Dev-User"
# Protección básica de DoS (PASO 60) + nunca usado como path/SQL/HTML: solo
# caracteres alfanuméricos + guion/guion bajo, largo acotado.
_DEV_SUBJECT_MAX_LENGTH = 128
_DEV_SUBJECT_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


class IdentityProviderError(Exception):
    """Error controlado de la capa de identidad."""


class IdentityConfigurationError(IdentityProviderError):
    """AUTH_MODE inválido o no implementado. No debe reintentarse ni caer
    en un fallback silencioso."""


class IdentityHeaderInvalidError(IdentityProviderError):
    """El header `X-Dev-User` está presente pero no pasa la validación
    (vacío, demasiado largo, caracteres no permitidos)."""


class Principal(BaseModel):
    """Identidad normalizada y EFÍMERA (nunca persistida tal cual -- ver
    `app/services/identity_resolver.py`, que la traduce a un `AppUser`
    persistido). No es el registro funcional: es la salida de un
    `IdentityProvider` para UNA request."""

    provider: str
    subject: str
    issuer: str | None = None
    tenant_id: str | None = None
    external_object_id: str | None = None
    display_name: str | None = None
    email: str | None = None


class IdentityProvider(ABC):
    @abstractmethod
    def resolve(self, request: Request) -> Principal:
        """Convierte una request HTTP en un `Principal` confiable."""


class DevIdentityProvider(IdentityProvider):
    """Identidad de desarrollo/test (AUTH_MODE=dev, ver PASO 22-26).

    Sin header `X-Dev-User`: identidad estable `dev-user-default` (la app
    sigue funcionando sin ningún cambio de frontend). Con el header: permite
    simular múltiples alumnos en desarrollo sin ningún sistema de login
    real. Nunca hardcodea un nombre personal como dependencia de dominio.
    """

    def resolve(self, request: Request) -> Principal:
        raw_subject = request.headers.get(_DEV_HEADER_NAME)
        if raw_subject is None:
            subject = _DEV_DEFAULT_SUBJECT
        else:
            subject = raw_subject.strip()
            if not subject:
                raise IdentityHeaderInvalidError(f"Header {_DEV_HEADER_NAME} no puede estar vacío.")
            if len(subject) > _DEV_SUBJECT_MAX_LENGTH:
                raise IdentityHeaderInvalidError(
                    f"Header {_DEV_HEADER_NAME} excede el largo máximo permitido "
                    f"({_DEV_SUBJECT_MAX_LENGTH} caracteres)."
                )
            if not _DEV_SUBJECT_PATTERN.match(subject):
                raise IdentityHeaderInvalidError(
                    f"Header {_DEV_HEADER_NAME} contiene caracteres no permitidos "
                    "(solo letras, números, '-' y '_')."
                )

        return Principal(provider="dev", subject=subject, issuer=_DEV_ISSUER)


def get_identity_provider(auth_mode: str) -> IdentityProvider:
    """Factory análoga a `get_llm_provider` (mismo criterio: la selección es
    SIEMPRE configuración del backend, nunca un valor enviado desde HTTP)."""
    mode = (auth_mode or "").strip().lower()
    if mode == "dev":
        return DevIdentityProvider()
    if mode == "entra":
        raise IdentityConfigurationError(
            "AUTH_MODE='entra' todavía no está implementado en esta versión "
            "(reservado para una fase futura de Microsoft Entra ID)."
        )
    raise IdentityConfigurationError(
        f"AUTH_MODE='{auth_mode}' no es válido. Valores soportados: {', '.join(_SUPPORTED_AUTH_MODES)}."
    )
