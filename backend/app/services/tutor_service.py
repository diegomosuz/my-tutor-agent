"""Orquestador del tutor interactivo grounded (Fase 5, extendido en
v1.3.0 con el modo ampliado y en v1.4.0 Bloque 2 con evidencia course-wide).

Pipeline (v1.4.0):

    CanonicalTopicContent + Grounding Packet (Fase 2, vía app/services/courses.py)
        -> contexto de escena (opcional, vía lesson_generator.get_cached_lesson_plan)
        -> COURSE DOMAIN (v1.3.0 BLOQUE 6, ahora resuelto en TODO modo)
        -> COURSE EVIDENCE (v1.4.0 Bloque 2: app/services/course_retrieval.py
           + app/services/course_grounding.py, SIEMPRE, sin importar el modo)
        -> Prompt Builder (app/prompts/tutor.py)
        -> LLMProvider.generate_structured (Fase 3, reutilizado tal cual)
        -> StructuredTutorReplyBody (validación Pydantic automática)
        -> validación de grounding (app/services/tutor_validation.py)
        -> validación de legalidad mode-aware (_validate, acá abajo)
        -> TutorReplyBody público (_to_public_reply; no se cachea, ver Fase 5 sección 18)

Regla de fuente de verdad: el Grounding Packet del tópico actual y el
COURSE EVIDENCE de otros tópicos del mismo curso son las ÚNICAS fuentes
autorizadas de conocimiento curricular. `recent_history`, el contexto de
escena (GENERATED CLASS CONTEXT) y el dominio del curso (COURSE DOMAIN)
son exclusivamente contexto conversacional/generado/estructural NO
confiable — nunca se usan como fuente de verdad, y nunca se envían al LLM
como si lo fueran (ver `app/prompts/tutor.py`).

v1.4.0 (Bloque 2) -- decisión de producto no negociable: el switch
"Ampliar con conocimiento general" (`allow_general_knowledge`) NUNCA
controló si el tutor puede usar evidencia de otros tópicos del MISMO
curso -- eso corre en TODA consulta, sin importar el switch (ver
`_resolve_course_evidence`, llamado incondicionalmente acá abajo). El
switch controla EXCLUSIVAMENTE si, además de eso, el tutor puede usar
conocimiento general del modelo para lo que ni el tópico actual ni el
resto del curso alcanzan a cubrir (ver `_validate` y REGLA 22 del prompt).

Diseñado para inyección de dependencias simple, igual que
`lesson_generator.py`: `ask_tutor` acepta un `provider: LLMProvider | None`
opcional para que los tests inyecten un `FakeLLMProvider` sin tocar
Internet.
"""
from __future__ import annotations

import logging
import time

from app.config import Settings
from app.models.schemas import CanonicalTopicContent
from app.models.tutor import (
    StructuredTutorReplyBody,
    TutorCourseSource,
    TutorMessage,
    TutorReplyBody,
    TutorResponseType,
    TutorScopeRelation,
)
from app.prompts.tutor import (
    CourseModuleScope,
    CourseScope,
    SceneContext,
    build_tutor_correction_message,
    build_tutor_messages,
)
from app.services import course_retrieval
from app.services import courses as course_service
from app.services import lesson_generator
from app.services.course_grounding import (
    CourseSourceBinding,
    build_course_evidence_packet,
    build_course_source_bindings,
)
from app.services.llm_provider import LLMConfigurationError, LLMProvider, get_llm_provider
from app.services.llm_retry import GenerationFailedError, ValidationFailure, generate_with_retries
from app.services.service_logging import log_event
from app.services.tutor_validation import validate_tutor_reply

logger = logging.getLogger("pwc_tutor.tutor")

# Re-exportado para quien quiera capturarlo explícitamente (routers/tests).
__all__ = ["ask_tutor", "GenerationFailedError"]

# v1.4.0 (Bloque 2): mismo top_k que ya validó el Bloque 1 (PARTE 9) --
# sin env var nueva, sin knob de configuración adicional. `exclude_topic_id`
# siempre es el tópico actual: nunca tiene sentido que el tutor "descubra"
# de vuelta el propio tópico que ya tiene como AUTHORIZED SOURCE.
_COURSE_EVIDENCE_TOP_K = 6


def _resolve_scene_context(
    *,
    settings: Settings,
    provider: LLMProvider,
    canonical: CanonicalTopicContent,
    scene_id: str | None,
) -> SceneContext | None:
    """Busca la escena `scene_id` dentro de la LessonPlan actualmente
    cacheada para este tópico/provider/modelo (si existe alguna). Nunca
    genera una LessonPlan nueva. Si no hay cache, o `scene_id` no existe en
    ella, devuelve `None` sin lanzar — un `scene_id` inválido nunca debe
    producir un 500 (sección 8 de la especificación de Fase 5)."""
    if not scene_id:
        return None
    try:
        cached_plan = lesson_generator.get_cached_lesson_plan(settings, provider, canonical)
    except Exception:
        return None
    if cached_plan is None:
        return None
    scene = next((s for s in cached_plan.scenes if s.scene_id == scene_id), None)
    if scene is None:
        return None

    refs: set[str] = set()
    refs.update(scene.title.source_refs)
    for kp in scene.key_points:
        refs.update(kp.source_refs)
    refs.update(scene.visual.source_refs)
    # Deliberadamente NO se incluye narration: la narración generada no es
    # una fuente de conocimiento nueva (sección 8 de la especificación).

    return SceneContext(scene_id=scene.scene_id, title=scene.title.text, source_refs=sorted(refs))


def _resolve_course_scope(*, settings: Settings, course_id: str) -> CourseScope | None:
    """Resuelve el dominio del curso completo (v1.3.0, BLOQUE 6) desde
    `course_id` -- SIEMPRE vía el repositorio seguro ya existente
    (`course_service.get_course_detail`, el mismo que resuelve `GET
    /api/courses/{course_id}`), nunca a partir de un path o string
    arbitrario del request. Determinístico, sin LLM, sin embeddings: solo
    una segunda lectura (barata) del filesystem de cursos.

    v1.4.0 (Bloque 2): se llama en TODO modo (antes: únicamente cuando
    `allow_general_knowledge=True`) -- `scope_relation` ahora se clasifica
    siempre (REGLA 20 del prompt es universal desde tutor-v4), así que el
    modo estricto también se beneficia de este contexto. `course_id` ya
    fue validado por `course_service.get_grounding_packet` momentos antes
    en `ask_tutor` -- en la práctica este resolver nunca debería fallar --
    pero, igual que `_resolve_scene_context`, nunca propaga una excepción:
    si por cualquier motivo no puede resolver el curso, el tutor
    simplemente sigue funcionando sin COURSE DOMAIN, nunca rompe la
    consulta del alumno."""
    try:
        detail = course_service.get_course_detail(settings.content_path, course_id)
    except Exception:
        return None

    modules = [
        CourseModuleScope(title=m.title, topic_titles=[t.title for t in m.topics])
        for m in detail.modules
    ]
    return CourseScope(
        course_title=detail.title,
        course_description=detail.description,
        modules=modules,
    )


def _resolve_course_evidence(
    *, settings: Settings, course_id: str, topic_id: str, message: str
) -> list[CourseSourceBinding]:
    """Recupera evidencia lexical determinística de OTROS tópicos del
    mismo curso (v1.4.0, Bloque 2) usando exactamente la pregunta del
    alumno como query, sin reescritura ni segunda llamada LLM (PARTE 10).
    Corre en TODA consulta, sin importar `allow_general_knowledge` (ver
    docstring del módulo).

    A diferencia de `_resolve_scene_context`/`_resolve_course_scope`, NO
    atrapa excepciones de forma genérica: `course_id` ya fue validado
    momentos antes por `course_service.get_grounding_packet`, así que
    `course_retrieval.search_course` no debería fallar por un curso
    inexistente en la práctica -- si de todos modos falla (por ejemplo,
    un error real de parseo en otro tópico del curso), eso es un problema
    real que debe propagarse como error, nunca silenciarse como "sin
    evidencia" (PARTE 33: nunca confundir "no hay evidencia" con "no se
    pudo buscar evidencia`)."""
    candidates = course_retrieval.search_course(
        settings,
        course_id,
        message,
        exclude_topic_id=topic_id,
        top_k=_COURSE_EVIDENCE_TOP_K,
    )
    return build_course_source_bindings(candidates)


def _to_public_reply(
    raw: StructuredTutorReplyBody, course_bindings: list[CourseSourceBinding]
) -> TutorReplyBody:
    """Convierte la respuesta interna del LLM (`StructuredTutorReplyBody`)
    en el contrato público (`TutorReplyBody`) -- reemplaza a
    `ExpandedTutorReplyBody.to_tutor_reply_body()` (v1.3.0), que ya no
    puede ser un método sin argumentos porque armar `course_sources`
    necesita los `CourseSourceBinding` de ESTA consulta puntual (v1.4.0,
    Bloque 2).

    `course_sources` se filtra acá a SOLO las fuentes efectivamente
    citadas en `course_answer_chunks` (PARTE 18): el packet completo
    enviado al LLM pudo tener hasta `_COURSE_EVIDENCE_TOP_K` candidatos,
    pero el público nunca ve los que el LLM no usó. Se preserva el orden
    determinístico de `course_bindings` (el mismo orden de ranking del
    Bloque 1), nunca el orden en que el LLM las citó."""
    cited_refs: set[str] = set()
    for chunk in raw.course_answer_chunks:
        cited_refs.update(chunk.source_refs)

    course_sources = [
        TutorCourseSource(
            ref=binding.course_source_ref,
            module_id=binding.module_id,
            module_title=binding.module_title,
            topic_id=binding.topic_id,
            topic_title=binding.topic_title,
            original_source_ref=binding.original_source_ref,
            heading_path=binding.heading_path,
        )
        for binding in course_bindings
        if binding.course_source_ref in cited_refs
    ]

    return TutorReplyBody(
        response_type=raw.response_type,
        answer_chunks=raw.answer_chunks,
        course_answer_chunks=raw.course_answer_chunks,
        course_sources=course_sources,
        general_knowledge_chunks=raw.general_knowledge_chunks,
        clarification_question=raw.clarification_question,
        general_knowledge_used=raw.general_knowledge_used,
    )


def ask_tutor(
    *,
    settings: Settings,
    course_id: str,
    module_id: str,
    topic_id: str,
    message: str,
    scene_id: str | None,
    recent_history: list[TutorMessage],
    allow_general_knowledge: bool = False,
    provider: LLMProvider | None = None,
) -> TutorReplyBody:
    """Genera la respuesta grounded del tutor a una pregunta del alumno.

    Lanza `course_service.CourseNotFoundError` / `ModuleNotFoundError` /
    `TopicNotFoundError` si el tópico no existe (resuelto siempre por el
    repositorio seguro). Lanza `LLMConfigurationError` si el provider no
    está configurado. Lanza `GenerationFailedError` si no se pudo producir
    una respuesta válida tras los reintentos permitidos.

    `allow_general_knowledge` (v1.3.0, default False; semántica ampliada
    en v1.4.0 Bloque 2 -- PARTE 22/25 del bloque original de Fase 1.3,
    reemplazada por la decisión de producto documentada en el docstring
    del módulo): en False, el tutor puede usar el tópico actual Y el
    resto del curso (COURSE EVIDENCE), pero NUNCA conocimiento general del
    modelo. En True, además de esas dos fuentes curriculares, permite
    -- únicamente para esta consulta puntual -- que el tutor use
    conocimiento general del modelo para lo que ninguna de las dos
    alcance a cubrir (ver app/prompts/tutor.py REGLA 22/23). Nunca se
    persiste entre preguntas: el frontend lo reenvía en cada request.
    """
    llm_provider = provider or get_llm_provider(settings)

    # Resolver el tópico ANTES de exigir credencial: un tópico inexistente
    # debe dar 404 incluso sin ninguna API key configurada.
    canonical, grounding_packet = course_service.get_grounding_packet(
        settings.content_path, course_id, module_id, topic_id
    )

    if not llm_provider.is_configured():
        raise LLMConfigurationError(
            f"El proveedor LLM configurado ('{llm_provider.name}') no tiene credencial disponible."
        )

    scene_context = _resolve_scene_context(
        settings=settings, provider=llm_provider, canonical=canonical, scene_id=scene_id
    )
    # v1.4.0 (Bloque 2): ambas resoluciones de contexto curricular
    # extendido corren SIEMPRE, sin importar allow_general_knowledge (ver
    # docstring del módulo).
    course_scope = _resolve_course_scope(settings=settings, course_id=course_id)

    retrieval_started_at = time.monotonic()
    course_bindings = _resolve_course_evidence(
        settings=settings, course_id=course_id, topic_id=topic_id, message=message
    )
    retrieval_ms = int((time.monotonic() - retrieval_started_at) * 1000)
    course_evidence_packet = build_course_evidence_packet(course_bindings)

    log_context = {
        "course_id": course_id,
        "module_id": module_id,
        "topic_id": topic_id,
        "scene_id": scene_id or "-",
        "provider": llm_provider.name,
        "model": llm_provider.model,
        "allow_general_knowledge": allow_general_knowledge,
    }
    log_event(
        logger,
        "tutor_query_started",
        **log_context,
        retrieval_ms=retrieval_ms,
        course_candidates_count=len(course_bindings),
    )
    started_at = time.monotonic()

    messages = build_tutor_messages(
        message=message,
        recent_history=recent_history,
        scene_context=scene_context,
        grounding_packet=grounding_packet,
        allow_general_knowledge=allow_general_knowledge,
        course_scope=course_scope,
        course_evidence_packet=course_evidence_packet,
    )

    def _validate(body: StructuredTutorReplyBody) -> None:
        validate_tutor_reply(
            answer_chunks=body.answer_chunks,
            course_answer_chunks=body.course_answer_chunks,
            canonical=canonical,
            course_bindings=course_bindings,
        )

        if not allow_general_knowledge:
            # Defensa en profundidad (igual criterio que v1.3.0): en modo
            # estricto el prompt nunca incluye REGLA 22 (la única que
            # explica cuándo usar conocimiento general) -- si de todos
            # modos aparece, es una inconsistencia real del modelo.
            if body.general_knowledge_chunks or body.general_knowledge_used:
                raise ValidationFailure(
                    [
                        "general_knowledge_chunks debe estar vacío (y general_knowledge_used=false) "
                        "cuando el request no permite conocimiento general (allow_general_knowledge=false); "
                        "en este modo solo podés responder con answer_chunks/course_answer_chunks, o con "
                        "response_type='not_covered' si ninguna fuente curricular alcanza."
                    ]
                )
            if body.response_type == TutorResponseType.unrelated:
                raise ValidationFailure(
                    [
                        "response_type='unrelated' solo es válido cuando el request permite "
                        "conocimiento general (allow_general_knowledge=true); en modo estricto "
                        "usá 'not_covered' si ninguna fuente curricular alcanza para responder."
                    ]
                )
            # v1.4.0 (Bloque 2): mapeo scope_relation -> response_type,
            # dependiente del modo (ver docstring del módulo y de
            # app/models/tutor.py::_validate_course_grounded_shape, que
            # deliberadamente NO valida esta relación por ser mode-aware).
            if (
                body.scope_relation == TutorScopeRelation.unrelated
                and body.response_type
                not in (TutorResponseType.not_covered, TutorResponseType.clarification)
            ):
                raise ValidationFailure(
                    [
                        "scope_relation='unrelated' en modo estricto debe mapear a "
                        "response_type='not_covered' (o 'clarification' si hace falta más "
                        "contexto) -- nunca 'answer' para una pregunta que vos mismo "
                        "clasificaste como ajena al tópico y al curso."
                    ]
                )
        else:
            # v1.3.0 (cierre del gap funcional del modo ampliado): QA real
            # mostró que el proveedor configurado (gpt-4o-mini) seguía
            # devolviendo "not_covered" para preguntas relacionadas pero
            # no cubiertas por la fuente. "not_covered" nunca es una
            # respuesta legal en modo ampliado -- la reemplazan
            # "unrelated" (scope ajeno) o "answer" con
            # general_knowledge_chunks (scope relacionado, ver REGLA 22).
            if body.response_type == TutorResponseType.not_covered:
                raise ValidationFailure(
                    [
                        "response_type='not_covered' no es una respuesta válida en modo ampliado "
                        "(allow_general_knowledge=true). Si la pregunta no está relacionada con el "
                        "tema ni con el curso, usá response_type='unrelated'. Si está relacionada "
                        "pero ninguna fuente curricular alcanza, respondé con response_type='answer' "
                        "usando general_knowledge_chunks -- nunca 'not_covered' para una pregunta "
                        "relevante en este modo."
                    ]
                )
            # v1.4.0 (Bloque 2): mismo mapeo que en modo estricto, pero
            # con el valor legal invertido -- scope_relation='unrelated'
            # mapea a response_type='unrelated' en este modo (nunca
            # 'not_covered', que ya está excluido arriba). Y a la inversa:
            # si scope_relation SÍ pertenece al tópico o al curso, la
            # respuesta nunca puede declararse 'unrelated'.
            if body.scope_relation == TutorScopeRelation.unrelated:
                if body.response_type not in (
                    TutorResponseType.unrelated,
                    TutorResponseType.clarification,
                ):
                    raise ValidationFailure(
                        [
                            "scope_relation='unrelated' en modo ampliado debe mapear a "
                            "response_type='unrelated' (o 'clarification' si hace falta más "
                            "contexto) -- nunca 'answer'."
                        ]
                    )
            elif body.response_type == TutorResponseType.unrelated:
                raise ValidationFailure(
                    [
                        "response_type='unrelated' requiere scope_relation='unrelated' -- si "
                        "clasificaste la pregunta como 'current_topic' o 'course_domain', no es "
                        "consistente responder 'unrelated'."
                    ]
                )

    def _on_retry(attempt: int, reason: str) -> None:
        # Observabilidad segura (nunca pregunta/respuesta/texto libre):
        # solo ids ya presentes en log_context + el intento + una
        # categoría fija de motivo (vocabulario cerrado de llm_retry.py:
        # "upstream_error"/"invalid_contract"/"grounding_invalid" -- esta
        # última cubre tanto validate_tutor_reply como las ValidationFailure
        # explícitas de _validate acá arriba).
        log_event(logger, "tutor_query_retry", **log_context, attempt=attempt, reason=reason)

    # v1.4.0 (Bloque 2): un único response_model para TODA llamada, en
    # ambos modos -- ver StructuredTutorReplyBody en app/models/tutor.py
    # para la justificación completa (reemplaza a
    # TutorReplyBody/ExpandedTutorReplyBody de v1.3.0).
    try:
        raw_body: StructuredTutorReplyBody = generate_with_retries(
            provider=llm_provider,
            messages=messages,
            response_model=StructuredTutorReplyBody,
            validate=_validate,
            build_correction_message=build_tutor_correction_message,
            on_retry=_on_retry,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        log_event(
            logger,
            "tutor_query_failed",
            **log_context,
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        raise

    body = _to_public_reply(raw_body, course_bindings)

    duration_ms = int((time.monotonic() - started_at) * 1000)
    log_event(
        logger,
        "tutor_query_completed",
        **log_context,
        scope_relation=raw_body.scope_relation.value,
        topic_coverage=raw_body.topic_coverage.value,
        course_coverage=raw_body.course_coverage.value,
        duration_ms=duration_ms,
        response_type=body.response_type.value,
        general_knowledge_used=body.general_knowledge_used,
        course_sources_count=len(body.course_sources),
    )
    return body
