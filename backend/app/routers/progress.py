"""Progreso curricular por tópico (v1.7.0, Bloque 2). PostgreSQL es la
fuente de verdad desde este bloque -- ver docs/SERVER_SIDE_PROFILE_V1_7.md.

Regla dura (idéntica en espíritu a la de identidad, Bloque 1): ningún
endpoint acá recibe ni acepta un `user_id` del cliente -- el usuario actual
se resuelve SIEMPRE vía `get_current_app_user` (Request -> IdentityProvider
-> Principal -> Application User Resolver -> AppUser), nunca de la URL ni
del body."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.models import AppUser, TopicProgress
from app.db.session import get_db_session
from app.dependencies import get_current_app_user
from app.models.progress import (
    CourseProgressResponse,
    LegacyImportRequest,
    LegacyImportTopicEntry,
    MarkProgressRequest,
    TopicProgressEntry,
)
from app.services import courses as course_service
from app.services import topic_progress_service

router = APIRouter(prefix="/api/progress", tags=["progress"])

_COURSE_NOT_FOUND = "Curso '{}' no encontrado"
_MODULE_NOT_FOUND = "Módulo '{}' no encontrado"
_TOPIC_NOT_FOUND = "Tópico '{}' no encontrado"


def _row_to_entry(row: TopicProgress) -> TopicProgressEntry:
    return TopicProgressEntry(
        module_id=row.module_id,
        topic_id=row.topic_id,
        status=row.status,  # type: ignore[arg-type]  -- siempre "in_progress"/"completed" por construcción
        started_at=row.started_at,
        completed_at=row.completed_at,
    )


def _valid_topic_ids_by_module(course_id: str, settings: Settings) -> dict[str, set[str]]:
    """`{module_id: {topic_id, ...}}` del curriculum REAL actual (PASO 42):
    nunca se permite escribir/importar progreso para un module_id/topic_id
    que no exista, sin necesitar una segunda llamada por entrada."""
    try:
        detail = course_service.get_course_detail(settings.content_path, course_id)
    except course_service.CourseNotFoundError:
        raise HTTPException(status_code=404, detail=_COURSE_NOT_FOUND.format(course_id))
    return {module.id: {topic.id for topic in module.topics} for module in detail.modules}


@router.get("/{course_id}", response_model=CourseProgressResponse)
def get_course_progress(
    course_id: str,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> CourseProgressResponse:
    _valid_topic_ids_by_module(course_id, settings)  # 404 si el curso no existe
    rows = topic_progress_service.get_course_progress(session, user.id, course_id)
    return CourseProgressResponse(course_id=course_id, topics=[_row_to_entry(r) for r in rows])


@router.put(
    "/{course_id}/{module_id}/{topic_id}",
    response_model=TopicProgressEntry,
)
def mark_topic_progress(
    course_id: str,
    module_id: str,
    topic_id: str,
    body: MarkProgressRequest,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> TopicProgressEntry:
    topics_by_module = _valid_topic_ids_by_module(course_id, settings)
    if module_id not in topics_by_module:
        raise HTTPException(status_code=404, detail=_MODULE_NOT_FOUND.format(module_id))
    if topic_id not in topics_by_module[module_id]:
        raise HTTPException(status_code=404, detail=_TOPIC_NOT_FOUND.format(topic_id))

    row = topic_progress_service.mark_topic_progress(
        session, user.id, course_id, module_id, topic_id, body.action
    )
    return _row_to_entry(row)


@router.post("/{course_id}/legacy-import", response_model=CourseProgressResponse)
def legacy_import_progress(
    course_id: str,
    body: LegacyImportRequest,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> CourseProgressResponse:
    """Fusiona (nunca reemplaza ni degrada) el snapshot legacy de
    `localStorage` con el progreso server-side existente. PASO 41: una
    entrada que referencia un módulo/tópico que ya no existe en el
    curriculum real se descarta silenciosamente, nunca rompe el import
    completo."""
    topics_by_module = _valid_topic_ids_by_module(course_id, settings)
    valid_entries: list[LegacyImportTopicEntry] = [
        entry
        for entry in body.topics
        if entry.module_id in topics_by_module and entry.topic_id in topics_by_module[entry.module_id]
    ]
    topic_progress_service.import_legacy_progress(session, user.id, course_id, valid_entries)

    rows = topic_progress_service.get_course_progress(session, user.id, course_id)
    return CourseProgressResponse(course_id=course_id, topics=[_row_to_entry(r) for r in rows])


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def reset_course_progress(
    course_id: str,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> None:
    _valid_topic_ids_by_module(course_id, settings)  # 404 si el curso no existe
    topic_progress_service.delete_course_progress(session, user.id, course_id)
