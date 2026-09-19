import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.config import Settings, get_settings
from app.models.lesson import GenerateLessonRequest, LessonPlan
from app.models.schemas import CourseDetail, CourseSummary, GroundingResponse, TopicResponse
from app.models.tutor import (
    CheckpointEvaluationBody,
    CheckpointRequest,
    TutorReplyBody,
    TutorRequest,
)
from app.services import checkpoint_service, courses as course_service, tutor_service
from app.services import lesson_generator
from app.services.llm_provider import LLMAuthError, LLMConfigurationError, LLMUpstreamError
from app.services.llm_retry import GenerationFailedError

router = APIRouter(prefix="/api/courses", tags=["courses"])
logger = logging.getLogger("pwc_tutor.lesson")

_COURSE_NOT_FOUND = "Curso '{}' no encontrado"
_MODULE_NOT_FOUND = "Módulo '{}' no encontrado"
_TOPIC_NOT_FOUND = "Tópico '{}' no encontrado"
_LLM_AUTH_REJECTED = (
    "El proveedor LLM configurado rechazó la credencial. Verificá la configuración del backend."
)
_LLM_UPSTREAM_FAILED = (
    "El proveedor LLM externo no respondió correctamente. Intentá nuevamente más tarde."
)


@router.get("", response_model=list[CourseSummary])
def list_courses(settings: Settings = Depends(get_settings)) -> list[CourseSummary]:
    return course_service.list_courses(settings.content_path)


@router.get("/{course_id}", response_model=CourseDetail)
def get_course(course_id: str, settings: Settings = Depends(get_settings)) -> CourseDetail:
    try:
        return course_service.get_course_detail(settings.content_path, course_id)
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=f"Curso '{course_id}' no encontrado")


@router.get(
    "/{course_id}/modules/{module_id}/topics/{topic_id}",
    response_model=TopicResponse,
)
def get_topic(
    course_id: str,
    module_id: str,
    topic_id: str,
    settings: Settings = Depends(get_settings),
) -> TopicResponse:
    try:
        return course_service.get_topic(settings.content_path, course_id, module_id, topic_id)
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=f"Curso '{course_id}' no encontrado")
    except course_service.ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=f"Módulo '{module_id}' no encontrado")
    except course_service.TopicNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tópico '{topic_id}' no encontrado")


@router.get(
    "/{course_id}/modules/{module_id}/topics/{topic_id}/grounding",
    response_model=GroundingResponse,
)
def get_topic_grounding(
    course_id: str,
    module_id: str,
    topic_id: str,
    settings: Settings = Depends(get_settings),
) -> GroundingResponse:
    """Herramienta de inspección/desarrollo: expone el Grounding Packet
    determinístico que en una fase futura será el único contexto entregado
    a un LLM para este tópico. No contiene secretos ni invoca ningún LLM.
    """
    try:
        canonical, packet = course_service.get_grounding_packet(
            settings.content_path, course_id, module_id, topic_id
        )
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=f"Curso '{course_id}' no encontrado")
    except course_service.ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=f"Módulo '{module_id}' no encontrado")
    except course_service.TopicNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tópico '{topic_id}' no encontrado")

    return GroundingResponse(
        content_sha256=canonical.content_sha256,
        source_block_count=canonical.source_block_count,
        grounding_packet=packet,
    )


@router.get("/{course_id}/modules/{module_id}/topics/{topic_id}/assets/{asset_path:path}")
def get_topic_asset(
    course_id: str,
    module_id: str,
    topic_id: str,
    asset_path: str,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Sirve un asset (imagen) referenciado con una ruta relativa desde el
    Markdown de un tópico (Fase 7, sección 13). Resuelve SIEMPRE desde el
    repositorio seguro de cursos; nunca acepta una ruta de filesystem
    arbitraria del cliente. Solo raster seguro (png/jpg/jpeg/webp/gif);
    nunca .svg/.html/.js/.exe/.ps1/.bat/.cmd. 404 tanto para "no existe"
    como para "tipo no soportado" o "intento de path traversal" — el
    cliente nunca distingue esos tres casos entre sí.
    """
    try:
        real_path, mime_type = course_service.resolve_topic_asset(
            settings.content_path, course_id, module_id, topic_id, asset_path
        )
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=f"Curso '{course_id}' no encontrado")
    except course_service.ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=f"Módulo '{module_id}' no encontrado")
    except course_service.TopicNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tópico '{topic_id}' no encontrado")
    except course_service.AssetNotFoundError:
        raise HTTPException(status_code=404, detail="Asset no encontrado")

    return FileResponse(real_path, media_type=mime_type)


@router.post(
    "/{course_id}/modules/{module_id}/topics/{topic_id}/lesson",
    response_model=LessonPlan,
)
def generate_topic_lesson(
    course_id: str,
    module_id: str,
    topic_id: str,
    body: GenerateLessonRequest = GenerateLessonRequest(),
    settings: Settings = Depends(get_settings),
) -> LessonPlan:
    """Genera (o recupera de cache) la LessonPlan de un tópico usando el
    LLMProvider configurado en el backend (Fase 3).

    El navegador NUNCA puede enviar: una ruta de filesystem, una API key,
    un provider arbitrario, el system prompt ni el Grounding Packet — todo
    eso se resuelve/genera enteramente en el backend a partir de
    course_id/module_id/topic_id (resueltos por el repositorio seguro) y de
    la configuración del servidor.
    """
    try:
        return lesson_generator.generate_lesson(
            settings=settings,
            course_id=course_id,
            module_id=module_id,
            topic_id=topic_id,
            force_regenerate=body.force_regenerate,
        )
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=_COURSE_NOT_FOUND.format(course_id))
    except course_service.ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=_MODULE_NOT_FOUND.format(module_id))
    except course_service.TopicNotFoundError:
        raise HTTPException(status_code=404, detail=_TOPIC_NOT_FOUND.format(topic_id))
    except LLMConfigurationError as exc:
        # Provider mal configurado o sin credencial: la app sigue viva,
        # solo esta funcionalidad puntual no está disponible.
        raise HTTPException(status_code=503, detail=str(exc))
    except LLMAuthError:
        # Nunca se filtra el detalle crudo del proveedor (podría insinuar
        # información sobre la credencial); mensaje genérico y estable.
        raise HTTPException(
            status_code=503,
            detail="El proveedor LLM configurado rechazó la credencial. Verificá la configuración del backend.",
        )
    except LLMUpstreamError:
        raise HTTPException(
            status_code=502,
            detail="El proveedor LLM externo no respondió correctamente. Intentá nuevamente más tarde.",
        )
    except lesson_generator.LessonGenerationError as exc:
        logger.warning("lesson_generation_rejected course_id=%s module_id=%s topic_id=%s", course_id, module_id, topic_id)
        raise HTTPException(
            status_code=422,
            detail="No se pudo generar una lección válida a partir del material de este tópico.",
        ) from exc


@router.post(
    "/{course_id}/modules/{module_id}/topics/{topic_id}/tutor",
    response_model=TutorReplyBody,
)
def ask_topic_tutor(
    course_id: str,
    module_id: str,
    topic_id: str,
    body: TutorRequest,
    settings: Settings = Depends(get_settings),
) -> TutorReplyBody:
    """Tutor interactivo grounded (Fase 5). El navegador solo puede enviar
    la pregunta, un `scene_id` opcional y hasta 10 mensajes de historial
    reciente (roles `user`/`assistant` únicamente, nunca `system`). El
    backend resuelve siempre el tópico verdadero a través del repositorio
    seguro y arma el Grounding Packet (única fuente de verdad) por su
    cuenta; nunca acepta una ruta de filesystem, el system prompt, el
    Grounding Packet, una API key, un provider ni SourceBlocks arbitrarios
    desde el request.
    """
    try:
        return tutor_service.ask_tutor(
            settings=settings,
            course_id=course_id,
            module_id=module_id,
            topic_id=topic_id,
            message=body.message,
            scene_id=body.scene_id,
            recent_history=body.recent_history,
            allow_general_knowledge=body.allow_general_knowledge,
        )
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=_COURSE_NOT_FOUND.format(course_id))
    except course_service.ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=_MODULE_NOT_FOUND.format(module_id))
    except course_service.TopicNotFoundError:
        raise HTTPException(status_code=404, detail=_TOPIC_NOT_FOUND.format(topic_id))
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except LLMAuthError:
        raise HTTPException(status_code=503, detail=_LLM_AUTH_REJECTED)
    except LLMUpstreamError:
        raise HTTPException(status_code=502, detail=_LLM_UPSTREAM_FAILED)
    except GenerationFailedError as exc:
        logger.warning(
            "tutor_query_rejected course_id=%s module_id=%s topic_id=%s", course_id, module_id, topic_id
        )
        raise HTTPException(
            status_code=422,
            detail="El tutor no pudo generar una respuesta válida a partir del material de este tópico.",
        ) from exc


@router.post(
    "/{course_id}/modules/{module_id}/topics/{topic_id}/checkpoint",
    response_model=CheckpointEvaluationBody,
)
def evaluate_topic_checkpoint(
    course_id: str,
    module_id: str,
    topic_id: str,
    body: CheckpointRequest,
    settings: Settings = Depends(get_settings),
) -> CheckpointEvaluationBody:
    """Evalúa la respuesta del alumno a un checkpoint de comprensión
    (`interaction_type=comprehension_check`) de una escena ya generada
    (Fase 4/5). `scene.interaction.expected_answer` se usa únicamente como
    contexto para el LLM, nunca como autoridad: la evaluación real siempre
    se hace contra el Grounding Packet del tópico.
    """
    try:
        return checkpoint_service.evaluate_checkpoint(
            settings=settings,
            course_id=course_id,
            module_id=module_id,
            topic_id=topic_id,
            scene_id=body.scene_id,
            answer=body.answer,
        )
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=_COURSE_NOT_FOUND.format(course_id))
    except course_service.ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=_MODULE_NOT_FOUND.format(module_id))
    except course_service.TopicNotFoundError:
        raise HTTPException(status_code=404, detail=_TOPIC_NOT_FOUND.format(topic_id))
    except checkpoint_service.CheckpointLessonPlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except checkpoint_service.CheckpointSceneNotFoundError:
        raise HTTPException(status_code=404, detail=f"Escena '{body.scene_id}' no encontrada")
    except checkpoint_service.CheckpointNotComprehensionCheckError:
        raise HTTPException(
            status_code=409,
            detail=f"La escena '{body.scene_id}' no tiene una comprobación de comprensión para evaluar.",
        )
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except LLMAuthError:
        raise HTTPException(status_code=503, detail=_LLM_AUTH_REJECTED)
    except LLMUpstreamError:
        raise HTTPException(status_code=502, detail=_LLM_UPSTREAM_FAILED)
    except GenerationFailedError as exc:
        logger.warning(
            "checkpoint_evaluation_rejected course_id=%s module_id=%s topic_id=%s scene_id=%s",
            course_id,
            module_id,
            topic_id,
            body.scene_id,
        )
        raise HTTPException(
            status_code=422,
            detail="No se pudo evaluar el checkpoint a partir del material de este tópico.",
        ) from exc
