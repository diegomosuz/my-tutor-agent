"""Endpoint de síntesis de voz neural opcional (Fase 7, sección 24). El
frontend nunca envía API key/model/voice/instructions — son configuración
exclusiva del backend."""
from fastapi import APIRouter, Depends, HTTPException, Response

from app.config import Settings, get_settings
from app.models.speech import SpeechRequest
from app.services.speech_service import (
    SpeechAuthError,
    SpeechConfigurationError,
    SpeechUpstreamError,
    synthesize_speech,
)

router = APIRouter(prefix="/api", tags=["speech"])


@router.post("/speech")
def create_speech(body: SpeechRequest, settings: Settings = Depends(get_settings)) -> Response:
    try:
        audio_bytes = synthesize_speech(settings=settings, text=body.text, speed=body.speed)
    except SpeechConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except SpeechAuthError:
        raise HTTPException(
            status_code=502,
            detail="El proveedor de voz neural rechazó la credencial configurada.",
        )
    except SpeechUpstreamError:
        raise HTTPException(
            status_code=502,
            detail="El proveedor de voz neural no respondió correctamente. Intentá nuevamente más tarde.",
        )
    return Response(content=audio_bytes, media_type="audio/mpeg")
