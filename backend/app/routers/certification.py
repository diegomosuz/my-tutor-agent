"""Endpoints de práctica/simulacro de certificación grounded (Fase 6).

Ningún endpoint acepta una ruta de filesystem, un provider, un modelo, una
API key, el system prompt ni el Grounding Packet desde el request: todo
eso lo resuelve el backend a partir de `course_id` (+ scope) y la
configuración del servidor. `POST .../prepare` NUNCA devuelve
`correct_option_ids`/`explanation`/`derivation_refs` (ver
`ExamQuestionView`); esos campos solo aparecen en la respuesta de
`evaluate-question`/`evaluate`, después de que el alumno ya respondió.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.models.certification import (
    CertificationPracticeResult,
    CertificationPrepareRequest,
    CertificationPrepareResponse,
    EvaluateQuestionRequest,
    EvaluateSimulationRequest,
    QuestionEvaluation,
)
from app.services import certification_service
from app.services import courses as course_service
from app.services.llm_provider import LLMAuthError, LLMConfigurationError, LLMUpstreamError
from app.services.llm_retry import GenerationFailedError

router = APIRouter(prefix="/api/courses", tags=["certification"])
logger = logging.getLogger("pwc_tutor.certification")

_COURSE_NOT_FOUND = "Curso '{}' no encontrado"
_MODULE_NOT_FOUND = "Módulo '{}' no encontrado"
_TOPIC_NOT_FOUND = "Tópico '{}' no encontrado"
_LLM_AUTH_REJECTED = (
    "El proveedor LLM configurado rechazó la credencial. Verificá la configuración del backend."
)
_LLM_UPSTREAM_FAILED = (
    "El proveedor LLM externo no respondió correctamente. Intentá nuevamente más tarde."
)


@router.post("/{course_id}/certification/prepare", response_model=CertificationPrepareResponse)
def prepare_certification_exam(
    course_id: str,
    body: CertificationPrepareRequest,
    settings: Settings = Depends(get_settings),
) -> CertificationPrepareResponse:
    """Prepara una práctica o un simulacro (sección 20). Genera (o
    reutiliza de cache) un QuestionBank por cada tópico del scope
    resuelto, y ensambla el examen de forma determinística (round-robin,
    sin LLM). Si el scope no tiene suficientes preguntas disponibles,
    devuelve las que hay junto con `requested_count`/`actual_count` — eso
    NO es un error."""
    try:
        return certification_service.prepare_exam(
            settings=settings,
            course_id=course_id,
            mode=body.mode,
            scope=body.scope,
            question_count=body.question_count,
            shuffle=body.shuffle,
            seed=body.seed,
        )
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=_COURSE_NOT_FOUND.format(course_id))
    except course_service.ModuleNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_MODULE_NOT_FOUND.format(str(exc)))
    except course_service.TopicNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_TOPIC_NOT_FOUND.format(str(exc)))
    except certification_service.CertificationInvalidScopeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except LLMAuthError:
        raise HTTPException(status_code=503, detail=_LLM_AUTH_REJECTED)
    except LLMUpstreamError:
        raise HTTPException(status_code=502, detail=_LLM_UPSTREAM_FAILED)
    except GenerationFailedError as exc:
        logger.warning("certification_bank_rejected course_id=%s", course_id)
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar un banco de preguntas válido a partir del material de este curso.",
        ) from exc


@router.post(
    "/{course_id}/certification/evaluate-question", response_model=QuestionEvaluation
)
def evaluate_certification_question(
    course_id: str,
    body: EvaluateQuestionRequest,
    settings: Settings = Depends(get_settings),
) -> QuestionEvaluation:
    """Evalúa UNA pregunta (modo Practice, sección 27). Determinístico, sin
    LLM: el banco ya está cacheado desde `prepare`."""
    try:
        return certification_service.evaluate_question(
            settings=settings,
            course_id=course_id,
            bank_id=body.bank_id,
            question_id=body.question_id,
            selected_option_ids=body.selected_option_ids,
        )
    except certification_service.CertificationBankNotFoundError:
        raise HTTPException(status_code=404, detail=f"Banco de preguntas '{body.bank_id}' no encontrado")
    except certification_service.CertificationQuestionNotFoundError:
        raise HTTPException(status_code=404, detail=f"Pregunta '{body.question_id}' no encontrada")
    except certification_service.CertificationInvalidOptionError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/{course_id}/certification/evaluate", response_model=CertificationPracticeResult)
def evaluate_certification_simulation(
    course_id: str,
    body: EvaluateSimulationRequest,
    settings: Settings = Depends(get_settings),
) -> CertificationPracticeResult:
    """Evalúa todas las respuestas de un simulacro (modo Simulation,
    sección 29). Determinístico, sin LLM."""
    try:
        return certification_service.evaluate_simulation(
            settings=settings, course_id=course_id, answers=body.answers
        )
    except certification_service.CertificationBankNotFoundError:
        raise HTTPException(status_code=404, detail="Banco de preguntas no encontrado")
    except certification_service.CertificationQuestionNotFoundError:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    except certification_service.CertificationInvalidOptionError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
