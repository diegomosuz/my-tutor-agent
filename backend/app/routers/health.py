import os

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.models.schemas import HealthResponse
from app.models.system import ReadyResponse

router = APIRouter(tags=["health"])


@router.get("/api/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse()


@router.get("/api/ready", response_model=ReadyResponse)
def get_ready(settings: Settings = Depends(get_settings)) -> ReadyResponse:
    """Readiness LOCAL únicamente (Fase 7, sección 42): nunca hace una
    llamada externa (a un LLM o a OpenAI TTS) para decidir si la app está
    lista. La app funciona sin ninguna credencial de IA configurada — eso
    nunca debe considerarse "not ready"."""
    content_readable = settings.content_path.is_dir() and os.access(settings.content_path, os.R_OK)

    data_writable = True
    try:
        settings.data_path.mkdir(parents=True, exist_ok=True)
        probe = settings.data_path / ".write-check"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError:
        data_writable = False

    status = "ready" if (content_readable and data_writable) else "not_ready"
    return ReadyResponse(status=status, content_readable=content_readable, data_writable=data_writable)
