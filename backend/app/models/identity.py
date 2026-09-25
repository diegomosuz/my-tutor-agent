"""Esquemas Pydantic del contrato público de identidad (v1.7.0).

Ningún modelo de este archivo puede exponer secretos, claims crudos de un
futuro JWT, ni columnas internas de `app_users`/`user_identities` más allá
de lo estrictamente necesario para que el frontend sepa "quién soy" (ver
`app/routers/me.py`)."""
from pydantic import BaseModel


class MeResponse(BaseModel):
    id: str
    display_name: str | None = None
    email: str | None = None
    provider: str
