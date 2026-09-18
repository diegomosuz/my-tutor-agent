from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.models.lesson import AiStatusResponse
from app.services.llm_provider import LLMConfigurationError, get_llm_provider

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/status", response_model=AiStatusResponse)
def get_ai_status(settings: Settings = Depends(get_settings)) -> AiStatusResponse:
    """Estado NO sensible del proveedor LLM configurado. Nunca incluye la
    API key ni ningún header de autenticación. Debe funcionar aunque no
    exista ninguna credencial configurada (la app arranca igual)."""
    try:
        provider = get_llm_provider(settings)
    except LLMConfigurationError:
        # LLM_PROVIDER inválido: igual respondemos algo útil en vez de
        # romper el endpoint (el catálogo/cursos deben seguir funcionando
        # sin depender de que la config de IA sea válida).
        return AiStatusResponse(
            provider=settings.llm_provider,
            model="",
            configured=False,
            prompt_version=settings.lesson_prompt_version,
        )

    return AiStatusResponse(
        provider=provider.name,
        model=provider.model,
        configured=provider.is_configured(),
        prompt_version=settings.lesson_prompt_version,
    )
