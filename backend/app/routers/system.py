"""Endpoints de estado/diagnóstico del sistema (Fase 7). Ninguno de estos
endpoints puede exponer API keys, headers de Authorization, prompts,
Grounding Packets ni rutas de filesystem del host completas."""
from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.models.system import (
    CoursesStatus,
    CourseDiagnosticsResponse,
    LlmStatus,
    SystemStatusResponse,
    VoiceStatus,
)
from app.services import course_diagnostics
from app.services.llm_provider import LLMConfigurationError, get_llm_provider
from app.services.speech_service import is_speech_configured

router = APIRouter(prefix="/api/system", tags=["system"])


def _llm_status(settings: Settings) -> LlmStatus:
    try:
        provider = get_llm_provider(settings)
        provider_name, model, configured = provider.name, provider.model, provider.is_configured()
    except LLMConfigurationError:
        provider_name, model, configured = settings.llm_provider, "", False
    return LlmStatus(
        provider=provider_name,
        model=model,
        configured=configured,
        prompt_version=settings.lesson_prompt_version,
        certification_prompt_version=settings.certification_prompt_version,
    )


def _voice_status(settings: Settings) -> VoiceStatus:
    return VoiceStatus(
        provider=settings.voice_provider,
        neural_configured=is_speech_configured(settings),
        tts_model=settings.openai_tts_model,
    )


@router.get("/status", response_model=SystemStatusResponse)
def get_system_status(settings: Settings = Depends(get_settings)) -> SystemStatusResponse:
    course_count, overall_status, _reports = course_diagnostics.run_course_diagnostics(
        settings.content_path
    )
    cache_writable = True
    try:
        settings.data_path.mkdir(parents=True, exist_ok=True)
        probe = settings.data_path / ".write-check"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError:
        cache_writable = False

    return SystemStatusResponse(
        app_version=settings.app_version,
        backend="ok",
        courses=CoursesStatus(count=course_count, diagnostics=overall_status),
        llm=_llm_status(settings),
        voice=_voice_status(settings),
        cache_writable=cache_writable,
    )


@router.get("/course-diagnostics", response_model=CourseDiagnosticsResponse)
def get_course_diagnostics(settings: Settings = Depends(get_settings)) -> CourseDiagnosticsResponse:
    """Diagnóstico read-only del filesystem de cursos (sección 10). Nunca
    modifica nada; un curso roto nunca tira abajo el diagnóstico de los
    demás ni el catálogo."""
    course_count, overall_status, reports = course_diagnostics.run_course_diagnostics(
        settings.content_path
    )
    return CourseDiagnosticsResponse(course_count=course_count, status=overall_status, reports=reports)
