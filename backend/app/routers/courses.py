import logging

from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.models.lesson import GenerateLessonRequest, LessonPlan
from app.models.schemas import CourseDetail, CourseSummary, GroundingResponse, TopicResponse
from app.services import courses as course_service
from app.services import lesson_generator
from app.services.llm_provider import LLMAuthError, LLMConfigurationError, LLMUpstreamError

router = APIRouter(prefix="/api/courses", tags=["courses"])
logger = logging.getLogger("pwc_tutor.lesson")

_COURSE_NOT_FOUND = "Curso '{}' no encontrado"
_MODULE_NOT_FOUND = "Módulo '{}' no encontrado"
_TOPIC_NOT_FOUND = "Tópico '{}' no encontrado"


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
