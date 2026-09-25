import os

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.db.session import check_db_reachable
from app.models.schemas import HealthResponse
from app.models.system import ReadyResponse

router = APIRouter(tags=["health"])


@router.get("/api/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse()


@router.get("/api/ready", response_model=ReadyResponse)
def get_ready(settings: Settings = Depends(get_settings)) -> ReadyResponse:
    """Readiness (Fase 7, sección 42, extendida v1.7.0): nunca hace una
    llamada externa (a un LLM o a OpenAI TTS) para decidir si la app está
    lista -- esas credenciales son opcionales, su ausencia nunca es
    "not ready". Postgres es distinto: es una dependencia INTERNA requerida
    desde este bloque, así que su falta de disponibilidad sí se refleja
    acá."""
    content_readable = settings.content_path.is_dir() and os.access(settings.content_path, os.R_OK)

    data_writable = True
    try:
        settings.data_path.mkdir(parents=True, exist_ok=True)
        probe = settings.data_path / ".write-check"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError:
        data_writable = False

    db_reachable = check_db_reachable(settings.database_url)

    status = "ready" if (content_readable and data_writable and db_reachable) else "not_ready"
    return ReadyResponse(
        status=status,
        content_readable=content_readable,
        data_writable=data_writable,
        db_reachable=db_reachable,
    )
