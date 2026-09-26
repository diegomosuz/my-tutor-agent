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

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.models import AppUser
from app.db.session import get_db_session
from app.dependencies import get_current_app_user
from app.models.certification import (
    CertificationHistoryResponse,
    CertificationPracticeResult,
    CertificationPrepareRequest,
    CertificationPrepareResponse,
    EvaluateQuestionRequest,
    EvaluateSimulationRequest,
    LegacyCertificationImportRequest,
    QuestionEvaluation,
)
from app.services import certification_history_service, certification_service
from app.services import courses as course_service
from app.services.llm_provider import LLMAuthError, LLMConfigurationError, LLMUpstreamError
from app.services.llm_retry import GenerationFailedError

router = APIRouter(prefix="/api/courses", tags=["certification"])
logger = logging.getLogger("pwc_tutor.certification")


def _valid_topic_ids_by_module(course_id: str, settings: Settings) -> dict[str, set[str]]:
    """Curriculum real actual -- ver el mismo patrón en
    `app/routers/progress.py`. Duplicado deliberadamente (small, ~7 líneas,
    mismo criterio ya establecido de que cada router mantiene sus propios
    helpers/constantes de mensaje pequeños, ver `_COURSE_NOT_FOUND` abajo)
    en vez de acoplar dos routers entre sí por una función mínima."""
    try:
        detail = course_service.get_course_detail(settings.content_path, course_id)
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=_COURSE_NOT_FOUND.format(course_id))
    return {module.id: {topic.id for topic in module.topics} for module in detail.modules}

_COURSE_NOT_FOUND = "Curso '{}' no encontrado"
_MODULE_NOT_FOUND = "Módulo '{}' no encontrado"
_TOPIC_NOT_FOUND = "Tópico '{}' no encontrado"
_LLM_AUTH_REJECTED = (
    "El proveedor LLM configurado rechazó la credencial. Verificá la configuración del backend."
)
_LLM_UPSTREAM_FAILED = (
    "El proveedor de IA no está disponible temporalmente. Intentá nuevamente más tarde."
)
_INSUFFICIENT_QUESTIONS = (
    "No fue posible generar suficientes preguntas con el material seleccionado. "
    "Probá con otro alcance (más módulos/tópicos) o intentá nuevamente más tarde."
)


@router.post("/{course_id}/certification/prepare", response_model=CertificationPrepareResponse)
def prepare_certification_exam(
    course_id: str,
    body: CertificationPrepareRequest,
    settings: Settings = Depends(get_settings),
) -> CertificationPrepareResponse:
    """Prepara una práctica o un simulacro (sección 20; hardening v1.0.1).
    Genera/reutiliza de cache QuestionBanks de forma INCREMENTAL — nunca
    todo el scope antes de ensamblar — y ensambla el examen de forma
    determinística (round-robin, sin LLM). Si el scope no tiene
    suficientes preguntas disponibles PERO se consiguió al menos una, NO
    es un error: devuelve las que hay junto con
    `requested_count`/`actual_count`. Un tópico individual que falla nunca
    aborta la preparación completa mientras otros candidatos puedan cubrir
    el pedido (ver `certification_service.prepare_exam`); solo si NINGUNA
    pregunta válida pudo conseguirse tras agotar todos los candidatos se
    responde con un error — 422 si el proveedor sí respondió pero ningún
    tópico produjo contenido válido, o el código de error de proveedor
    real (502/503) si el proveedor nunca llegó a responder."""
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
    except certification_service.CertificationInsufficientQuestionsError:
        raise HTTPException(status_code=422, detail=_INSUFFICIENT_QUESTIONS)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except LLMAuthError:
        raise HTTPException(status_code=503, detail=_LLM_AUTH_REJECTED)
    except LLMUpstreamError:
        raise HTTPException(status_code=502, detail=_LLM_UPSTREAM_FAILED)
    except GenerationFailedError as exc:
        # Defensivo: `prepare_exam` ya captura GenerationFailedError por
        # candidato internamente y nunca debería dejarlo escapar, pero se
        # mantiene este mapeo por compatibilidad/seguridad.
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
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> CertificationPracticeResult:
    """Evalúa todas las respuestas de un simulacro o de una práctica al
    terminar (ambos modos entregan acá, sección 29). Determinístico, sin
    LLM. v1.7.0 Bloque 3: el resultado se persiste server-side ANTES de
    responder (nunca "mostrar resultado y persistir en background" -- ver
    docs/SERVER_SIDE_PROFILE_V1_7.md). Idempotente por `practice_id`: un
    reintento de red del mismo submit nunca duplica el intento."""
    try:
        result = certification_service.evaluate_simulation(
            settings=settings, course_id=course_id, answers=body.answers
        )
    except certification_service.CertificationBankNotFoundError:
        raise HTTPException(status_code=404, detail="Banco de preguntas no encontrado")
    except certification_service.CertificationQuestionNotFoundError:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    except certification_service.CertificationInvalidOptionError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # SQLAlchemyError acá nunca se atrapa localmente: propaga al handler
    # global (app/main.py, Bloque 2) -> 503 limpio. Nunca se responde el
    # resultado si la persistencia falla (PASO 24: nunca un attempt
    # "fantasma" que el alumno cree guardado).
    certification_history_service.persist_attempt(
        session, user.id, course_id, body.practice_id, body.mode, result
    )
    return result


@router.get("/{course_id}/certification/history", response_model=CertificationHistoryResponse)
def get_certification_history(
    course_id: str,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> CertificationHistoryResponse:
    _valid_topic_ids_by_module(course_id, settings)  # 404 si el curso no existe
    attempts = certification_history_service.get_history(session, user.id, course_id)
    return CertificationHistoryResponse(course_id=course_id, attempts=attempts)


@router.post(
    "/{course_id}/certification/legacy-import", response_model=CertificationHistoryResponse
)
def legacy_import_certification_history(
    course_id: str,
    body: LegacyCertificationImportRequest,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> CertificationHistoryResponse:
    """Fusiona (nunca reemplaza ni degrada) un snapshot legacy de
    `localStorage`. PASO 43: una entrada de `performance_by_topic` que
    referencia un módulo/tópico que ya no existe en el curriculum real se
    descarta en silencio (nunca crea evidencia fantasma para un tópico
    inexistente); el intento en sí se importa igual con el resto de sus
    tópicos válidos."""
    topics_by_module = _valid_topic_ids_by_module(course_id, settings)
    filtered_attempts = [
        attempt.model_copy(
            update={
                "performance_by_topic": [
                    t
                    for t in attempt.performance_by_topic
                    if t.module_id in topics_by_module and t.topic_id in topics_by_module[t.module_id]
                ]
            }
        )
        for attempt in body.attempts
    ]
    certification_history_service.import_legacy_attempts(session, user.id, course_id, filtered_attempts)

    attempts = certification_history_service.get_history(session, user.id, course_id)
    return CertificationHistoryResponse(course_id=course_id, attempts=attempts)


@router.delete(
    "/{course_id}/certification/history", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
def reset_certification_history(
    course_id: str,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> None:
    _valid_topic_ids_by_module(course_id, settings)  # 404 si el curso no existe
    certification_history_service.delete_history(session, user.id, course_id)
