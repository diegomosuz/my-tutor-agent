"""Endpoint de diagnóstico/desarrollo de identidad (v1.7.0, PASO 32).

Se evaluó reusar `/api/system/status` y se descartó: ese endpoint es
información del SISTEMA (sin usuario), mientras que `/api/me` es
inherentemente por-usuario (varía según `X-Dev-User`) -- mezclarlos
hubiera confundido el contrato de un endpoint que hoy es explícitamente
"sin autenticación" con uno nuevo que sí depende de la identidad
resuelta."""
from fastapi import APIRouter, Depends

from app.db.models import AppUser
from app.dependencies import get_current_app_user
from app.models.identity import MeResponse

router = APIRouter(prefix="/api/me", tags=["identity"])


@router.get("", response_model=MeResponse)
def get_me(user: AppUser = Depends(get_current_app_user)) -> MeResponse:
    """Info NO sensible del usuario funcional actual: nunca expone
    columnas internas de `user_identities` (tenant_id/external_object_id/
    issuer/subject), timestamps, ni ningún detalle de DB."""
    provider = user.identities[0].provider if user.identities else "unknown"
    return MeResponse(
        id=str(user.id),
        display_name=user.display_name,
        email=user.email,
        provider=provider,
    )
