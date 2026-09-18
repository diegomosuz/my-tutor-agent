from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.models.schemas import CourseDetail, CourseSummary, GroundingResponse, TopicResponse
from app.services import courses as course_service

router = APIRouter(prefix="/api/courses", tags=["courses"])


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
