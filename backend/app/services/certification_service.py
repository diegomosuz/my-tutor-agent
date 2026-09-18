"""Orquestador de la práctica/simulacro de certificación grounded (Fase 6).

Pipeline de generación de un QuestionBank (por tópico, NUNCA por curso
completo — ver sección 5 de la especificación de Fase 6):

    CanonicalTopicContent + Grounding Packet (Fase 2, por tópico)
        -> Prompt Builder (app/prompts/certification.py)
        -> LLMProvider.generate_structured (Fase 3, reutilizado tal cual)
        -> GeneratedQuestionBankBody (validación Pydantic automática)
        -> validación de grounding (app/services/certification_validation.py)
        -> QuestionBank (ensamblada acá: bank_id, question_id, ids, hash,
           provider, model, prompt_version — el LLM nunca los produce)
        -> cache en filesystem (JSON, igual patrón que LessonPlan)

Ensamblaje del examen: 100% determinístico (round-robin por tópico, sin
LLM). Evaluación: 100% determinística (`certification_evaluator.py`, sin
LLM). Esto NO es RAG: no hay embeddings, vector store ni similarity
search — la selección de tópicos es determinística desde el scope pedido,
resuelto contra el filesystem real de cursos.

Principio de producto (ver CLAUDE.md / docs/ARCHITECTURE.md): esta
práctica NO representa ni afirma reproducir un examen oficial de ninguna
certificación externa.
"""
from __future__ import annotations

import hashlib
import logging
import random
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

from app.config import Settings
from app.models.certification import (
    AnswerSubmission,
    CertificationMode,
    CertificationPracticeResult,
    CertificationPrepareResponse,
    CertificationScope,
    CompetencyBreakdown,
    ExamQuestionView,
    GeneratedQuestionBankBody,
    PublicOption,
    Question,
    QuestionBank,
    QuestionEvaluation,
    QuestionVerdict,
    TopicBreakdown,
)
from app.models.schemas import CanonicalTopicContent
from app.prompts.certification import (
    build_certification_correction_message,
    build_certification_messages,
)
from app.services import courses as course_service
from app.services.cache_schema import CACHE_SCHEMA_VERSION
from app.services.certification_evaluator import VERDICT_POINTS, evaluate_answer
from app.services.certification_validation import validate_question_bank
from app.services.llm_provider import LLMConfigurationError, LLMProvider, get_llm_provider
from app.services.llm_retry import GenerationFailedError, generate_with_retries
from app.services.service_logging import log_event

logger = logging.getLogger("pwc_tutor.certification")

__all__ = [
    "get_or_generate_question_bank",
    "resolve_scope",
    "prepare_exam",
    "evaluate_question",
    "evaluate_simulation",
    "CertificationInvalidScopeError",
    "CertificationBankNotFoundError",
    "CertificationQuestionNotFoundError",
    "CertificationInvalidOptionError",
    "GenerationFailedError",
]

# 1-10 preguntas por tópico, sin importar el valor configurado (sección 7).
_MIN_ITEMS_PER_TOPIC = 1
_MAX_ITEMS_PER_TOPIC = 10

# Un bank_id es siempre el hex digest SHA-256 de la cache key (64 hex
# chars). Validar el formato ANTES de construir cualquier Path evita que un
# bank_id manipulado por el cliente pueda intentar un path traversal.
_BANK_ID_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class CertificationInvalidScopeError(Exception):
    """Un module_id/topic_id del scope pedido no existe en este curso."""


class CertificationBankNotFoundError(Exception):
    """bank_id desconocido, con formato inválido, o perteneciente a otro
    curso (se trata igual que "no encontrado" para no confirmar la
    existencia de un bank_id ajeno a este curso)."""


class CertificationQuestionNotFoundError(Exception):
    """question_id desconocido dentro de un QuestionBank real."""


class CertificationInvalidOptionError(Exception):
    """selected_option_ids referencia un option_id que no existe en la
    pregunta real."""


# --------------------------------------------------------------------------
# Cache de QuestionBank (filesystem, igual patrón que lesson_generator.py)
# --------------------------------------------------------------------------


def _cache_key(
    *,
    course_id: str,
    module_id: str,
    topic_id: str,
    content_sha256: str,
    provider_name: str,
    model: str,
    prompt_version: str,
    items_per_topic: int,
) -> str:
    """Identidad contextual completa (course_id/module_id/topic_id) +
    content_sha256 + provider + model + prompt_version +
    items_per_topic + CACHE_SCHEMA_VERSION.

    Fase 7, sección 2 — mismo bug de colisión que LessonPlan: dos tópicos
    distintos con el mismo Markdown (mismo content_sha256) no pueden
    compartir bank_id, o el segundo heredaría el course_id/module_id/
    topic_id del primero (ver `backend/tests/test_cache_isolation.py`).
    `items_per_topic` también entra en la key porque afecta directamente
    la cantidad de preguntas generadas (sección 2 de la especificación)."""
    raw = (
        f"{CACHE_SCHEMA_VERSION}:{course_id}:{module_id}:{topic_id}:"
        f"{content_sha256}:{provider_name}:{model}:{prompt_version}:{items_per_topic}"
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_file_path(cache_dir: Path, key: str) -> Path:
    return cache_dir / f"{key}.json"


def _read_cache(cache_dir: Path, key: str) -> QuestionBank | None:
    path = _cache_file_path(cache_dir, key)
    if not path.is_file():
        return None
    try:
        raw = path.read_text(encoding="utf-8")
        return QuestionBank.model_validate_json(raw)
    except (OSError, ValidationError, ValueError):
        return None


def _write_cache(cache_dir: Path, key: str, bank: QuestionBank) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    final_path = _cache_file_path(cache_dir, key)
    tmp_path = final_path.with_name(final_path.name + ".tmp")
    tmp_path.write_text(bank.model_dump_json(indent=2), encoding="utf-8")
    tmp_path.replace(final_path)


def _assemble_question_bank(
    *,
    body: GeneratedQuestionBankBody,
    canonical: CanonicalTopicContent,
    provider_name: str,
    model: str,
    prompt_version: str,
    cache_key: str,
) -> QuestionBank:
    questions = [
        Question(
            question_id=f"Q-{i + 1:03d}",
            question_type=q.question_type,
            question_style=q.question_style,
            stem=q.stem,
            options=q.options,
            correct_option_ids=q.correct_option_ids,
            explanation=q.explanation,
            competency=q.competency,
        )
        for i, q in enumerate(body.questions)
    ]
    return QuestionBank(
        bank_id=cache_key,
        course_id=canonical.course_id,
        module_id=canonical.module_id,
        topic_id=canonical.topic_id,
        content_sha256=canonical.content_sha256,
        provider=provider_name,
        model=model,
        prompt_version=prompt_version,
        questions=questions,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


def get_or_generate_question_bank(
    *,
    settings: Settings,
    course_id: str,
    module_id: str,
    topic_id: str,
    provider: LLMProvider | None = None,
    force_regenerate: bool = False,
) -> QuestionBank:
    """Genera (o recupera de cache) el QuestionBank de UN tópico.

    Lanza `course_service.CourseNotFoundError` / `ModuleNotFoundError` /
    `TopicNotFoundError` si el tópico no existe. Lanza
    `LLMConfigurationError` si el provider no está configurado. Lanza
    `GenerationFailedError` si no se pudo producir un banco válido tras los
    reintentos permitidos.
    """
    llm_provider = provider or get_llm_provider(settings)

    canonical, grounding_packet = course_service.get_grounding_packet(
        settings.content_path, course_id, module_id, topic_id
    )

    if not llm_provider.is_configured():
        raise LLMConfigurationError(
            f"El proveedor LLM configurado ('{llm_provider.name}') no tiene credencial disponible."
        )

    cache_dir = settings.certification_cache_path
    prompt_version = settings.certification_prompt_version
    items_per_topic = max(
        _MIN_ITEMS_PER_TOPIC, min(_MAX_ITEMS_PER_TOPIC, settings.certification_items_per_topic)
    )
    key = _cache_key(
        course_id=canonical.course_id,
        module_id=canonical.module_id,
        topic_id=canonical.topic_id,
        content_sha256=canonical.content_sha256,
        provider_name=llm_provider.name,
        model=llm_provider.model,
        prompt_version=prompt_version,
        items_per_topic=items_per_topic,
    )

    log_context = {
        "course_id": course_id,
        "module_id": module_id,
        "topic_id": topic_id,
        "provider": llm_provider.name,
        "model": llm_provider.model,
        "content_sha256": canonical.content_sha256[:12],
    }

    if not force_regenerate:
        cached_bank = _read_cache(cache_dir, key)
        if cached_bank is not None:
            log_event(logger, "certification_bank_cache_hit", **log_context)
            return cached_bank

    log_event(logger, "certification_bank_cache_miss", **log_context)
    log_event(logger, "certification_bank_generation_started", **log_context)
    started_at = time.monotonic()

    messages = build_certification_messages(
        grounding_packet=grounding_packet, items_per_topic=items_per_topic
    )

    def _validate(body: GeneratedQuestionBankBody) -> None:
        validate_question_bank(body, canonical)

    try:
        body = generate_with_retries(
            provider=llm_provider,
            messages=messages,
            response_model=GeneratedQuestionBankBody,
            validate=_validate,
            build_correction_message=build_certification_correction_message,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        log_event(
            logger,
            "certification_bank_generation_failed",
            **log_context,
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        raise

    bank = _assemble_question_bank(
        body=body,
        canonical=canonical,
        provider_name=llm_provider.name,
        model=llm_provider.model,
        prompt_version=prompt_version,
        cache_key=key,
    )
    # Nunca cachear un banco vacío de forma persistente evitaría poder
    # servir tópicos genuinamente breves; sí evitamos cachear errores (ya
    # garantizado: solo llegamos acá tras una validación exitosa).
    _write_cache(cache_dir, key, bank)

    duration_ms = int((time.monotonic() - started_at) * 1000)
    log_event(
        logger,
        "certification_bank_generation_completed",
        **log_context,
        duration_ms=duration_ms,
        question_count=len(bank.questions),
    )
    return bank


# --------------------------------------------------------------------------
# Resolución de scope (determinística, contra el repositorio seguro)
# --------------------------------------------------------------------------


def resolve_scope(
    *, settings: Settings, course_id: str, scope: CertificationScope
) -> list[tuple[str, str]]:
    """Devuelve una lista ordenada y sin duplicados de (module_id,
    topic_id) reales del curso, según el scope pedido. Nunca confía en un
    id que no exista en el filesystem real (resuelto vía
    `course_service.get_course_detail`, el mismo repositorio seguro del
    resto de la aplicación — nunca se acepta una ruta de filesystem)."""
    course_detail = course_service.get_course_detail(settings.content_path, course_id)

    topics_by_id: dict[str, list[tuple[str, str]]] = {}
    modules_by_id: dict[str, list[tuple[str, str]]] = {}
    all_pairs: list[tuple[str, str]] = []
    for module in course_detail.modules:
        module_pairs = [(module.id, topic.id) for topic in module.topics]
        modules_by_id[module.id] = module_pairs
        all_pairs.extend(module_pairs)
        for topic in module.topics:
            topics_by_id.setdefault(topic.id, []).append((module.id, topic.id))

    resolved: list[tuple[str, str]] = []

    if scope.topic_ids:
        for topic_id in scope.topic_ids:
            matches = topics_by_id.get(topic_id)
            if not matches:
                raise CertificationInvalidScopeError(
                    f"El tópico '{topic_id}' no existe en el curso '{course_id}'."
                )
            resolved.extend(matches)
    elif scope.module_ids:
        for module_id in scope.module_ids:
            pairs = modules_by_id.get(module_id)
            if pairs is None:
                raise CertificationInvalidScopeError(
                    f"El módulo '{module_id}' no existe en el curso '{course_id}'."
                )
            resolved.extend(pairs)
    else:
        resolved.extend(all_pairs)

    seen: set[tuple[str, str]] = set()
    deduped: list[tuple[str, str]] = []
    for pair in resolved:
        if pair not in seen:
            seen.add(pair)
            deduped.append(pair)
    return deduped


# --------------------------------------------------------------------------
# Ensamblaje determinístico del examen (round-robin, sin LLM)
# --------------------------------------------------------------------------


def _round_robin_select(
    banks: list[QuestionBank], question_count: int, *, shuffle: bool, seed: int | None
) -> list[tuple[QuestionBank, Question]]:
    rng = random.Random(seed) if shuffle else None
    queues: list[list[Question]] = []
    for bank in banks:
        questions = list(bank.questions)
        if rng is not None:
            rng.shuffle(questions)
        queues.append(questions)

    selected: list[tuple[QuestionBank, Question]] = []
    progressed = True
    while len(selected) < question_count and progressed:
        progressed = False
        for bank, queue in zip(banks, queues):
            if not queue:
                continue
            if len(selected) >= question_count:
                break
            selected.append((bank, queue.pop(0)))
            progressed = True
    return selected


def prepare_exam(
    *,
    settings: Settings,
    course_id: str,
    mode: CertificationMode,
    scope: CertificationScope,
    question_count: int,
    shuffle: bool = True,
    seed: int | None = None,
    provider: LLMProvider | None = None,
) -> CertificationPrepareResponse:
    """Resuelve el scope, genera/recupera un QuestionBank por tópico y
    ensambla el examen de forma determinística (round-robin por tópico,
    NUNCA con el LLM). Si no hay preguntas suficientes disponibles, NO es
    un error: se devuelven las disponibles junto con
    requested_count/actual_count (sección 22 de la especificación)."""
    llm_provider = provider or get_llm_provider(settings)

    resolved_topics = resolve_scope(settings=settings, course_id=course_id, scope=scope)

    banks: list[QuestionBank] = []
    for module_id, topic_id in resolved_topics:
        bank = get_or_generate_question_bank(
            settings=settings,
            course_id=course_id,
            module_id=module_id,
            topic_id=topic_id,
            provider=llm_provider,
        )
        banks.append(bank)

    selected = _round_robin_select(banks, question_count, shuffle=shuffle, seed=seed)

    questions = [
        ExamQuestionView(
            bank_id=bank.bank_id,
            question_id=question.question_id,
            course_id=course_id,
            module_id=bank.module_id,
            topic_id=bank.topic_id,
            question_type=question.question_type,
            question_style=question.question_style,
            stem=question.stem.text,
            options=[PublicOption(option_id=o.option_id, text=o.text) for o in question.options],
        )
        for bank, question in selected
    ]

    practice_id = uuid.uuid4().hex

    log_event(
        logger,
        "certification_exam_prepared",
        course_id=course_id,
        mode=mode.value,
        topic_count=len(resolved_topics),
        requested_count=question_count,
        actual_count=len(questions),
    )

    return CertificationPrepareResponse(
        practice_id=practice_id,
        course_id=course_id,
        mode=mode,
        requested_count=question_count,
        actual_count=len(questions),
        questions=questions,
    )


# --------------------------------------------------------------------------
# Evaluación determinística (sin LLM)
# --------------------------------------------------------------------------


def _load_bank_for_evaluation(*, settings: Settings, course_id: str, bank_id: str) -> QuestionBank:
    if not _BANK_ID_PATTERN.match(bank_id):
        raise CertificationBankNotFoundError(bank_id)
    bank = _read_cache(settings.certification_cache_path, bank_id)
    if bank is None or bank.course_id != course_id:
        raise CertificationBankNotFoundError(bank_id)
    return bank


def _evaluate_one(
    *, settings: Settings, course_id: str, bank_id: str, question_id: str, selected_option_ids: list[str]
) -> QuestionEvaluation:
    bank = _load_bank_for_evaluation(settings=settings, course_id=course_id, bank_id=bank_id)
    question = next((q for q in bank.questions if q.question_id == question_id), None)
    if question is None:
        raise CertificationQuestionNotFoundError(f"{bank_id}/{question_id}")

    valid_option_ids = {opt.option_id for opt in question.options}
    unknown = [oid for oid in selected_option_ids if oid not in valid_option_ids]
    if unknown:
        raise CertificationInvalidOptionError(
            f"selected_option_ids contiene opciones inexistentes: {unknown}"
        )

    verdict = evaluate_answer(
        question_type=question.question_type,
        correct_option_ids=question.correct_option_ids,
        selected_option_ids=selected_option_ids,
    )

    return QuestionEvaluation(
        bank_id=bank_id,
        question_id=question_id,
        module_id=bank.module_id,
        topic_id=bank.topic_id,
        question_type=question.question_type,
        selected_option_ids=selected_option_ids,
        verdict=verdict,
        correct_option_ids=question.correct_option_ids,
        explanation=question.explanation,
        competency=question.competency,
    )


def evaluate_question(
    *, settings: Settings, course_id: str, bank_id: str, question_id: str, selected_option_ids: list[str]
) -> QuestionEvaluation:
    """Evalúa UNA pregunta (modo Practice). Determinístico, sin LLM."""
    result = _evaluate_one(
        settings=settings,
        course_id=course_id,
        bank_id=bank_id,
        question_id=question_id,
        selected_option_ids=selected_option_ids,
    )
    log_event(
        logger,
        "certification_question_evaluated",
        course_id=course_id,
        bank_id=bank_id,
        question_id=question_id,
        verdict=result.verdict.value,
    )
    return result


def _round(value: float) -> float:
    return round(value, 1)


def evaluate_simulation(
    *, settings: Settings, course_id: str, answers: list[AnswerSubmission]
) -> CertificationPracticeResult:
    """Evalúa todas las respuestas de un simulacro (modo Simulation).
    Determinístico, sin LLM. Una respuesta con `selected_option_ids` vacío
    se cuenta como "unanswered" en los agregados (nunca como "incorrect"),
    aunque su `verdict` individual siga siendo el que produce el evaluador
    determinístico (útil para el repaso post-examen)."""
    results: list[QuestionEvaluation] = []
    unanswered_flags: list[bool] = []

    for answer in answers:
        result = _evaluate_one(
            settings=settings,
            course_id=course_id,
            bank_id=answer.bank_id,
            question_id=answer.question_id,
            selected_option_ids=answer.selected_option_ids,
        )
        results.append(result)
        unanswered_flags.append(len(answer.selected_option_ids) == 0)

    total_questions = len(results)
    correct = sum(
        1 for r, unanswered in zip(results, unanswered_flags)
        if not unanswered and r.verdict == QuestionVerdict.correct
    )
    partially_correct = sum(
        1 for r, unanswered in zip(results, unanswered_flags)
        if not unanswered and r.verdict == QuestionVerdict.partially_correct
    )
    incorrect = sum(
        1 for r, unanswered in zip(results, unanswered_flags)
        if not unanswered and r.verdict == QuestionVerdict.incorrect
    )
    unanswered = sum(1 for u in unanswered_flags if u)

    points = correct * VERDICT_POINTS[QuestionVerdict.correct] + partially_correct * VERDICT_POINTS[
        QuestionVerdict.partially_correct
    ]
    practice_score_percent = _round((points / total_questions) * 100) if total_questions else 0.0

    by_topic = _breakdown_by_topic(results, unanswered_flags)
    by_competency = _breakdown_by_competency(results, unanswered_flags)
    topics_to_reinforce = sorted(
        [t for t in by_topic if t.incorrect > 0 or t.partially_correct > 0],
        key=lambda t: t.practice_score_percent,
    )

    log_event(
        logger,
        "certification_simulation_evaluated",
        course_id=course_id,
        total_questions=total_questions,
        correct=correct,
        partially_correct=partially_correct,
        incorrect=incorrect,
        unanswered=unanswered,
        practice_score_percent=practice_score_percent,
    )

    return CertificationPracticeResult(
        total_questions=total_questions,
        correct=correct,
        partially_correct=partially_correct,
        incorrect=incorrect,
        unanswered=unanswered,
        practice_score_percent=practice_score_percent,
        by_topic=by_topic,
        by_competency=by_competency,
        question_results=results,
        topics_to_reinforce=topics_to_reinforce,
    )


def _breakdown_by_topic(
    results: list[QuestionEvaluation], unanswered_flags: list[bool]
) -> list[TopicBreakdown]:
    groups: dict[tuple[str, str], list[tuple[QuestionEvaluation, bool]]] = {}
    order: list[tuple[str, str]] = []
    for result, unanswered in zip(results, unanswered_flags):
        key = (result.module_id, result.topic_id)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append((result, unanswered))

    breakdowns: list[TopicBreakdown] = []
    for module_id, topic_id in order:
        items = groups[(module_id, topic_id)]
        attempted = len(items)
        correct = sum(1 for r, u in items if not u and r.verdict == QuestionVerdict.correct)
        partially_correct = sum(
            1 for r, u in items if not u and r.verdict == QuestionVerdict.partially_correct
        )
        incorrect = sum(1 for r, u in items if not u and r.verdict == QuestionVerdict.incorrect)
        unanswered = sum(1 for _, u in items if u)
        points = correct * VERDICT_POINTS[QuestionVerdict.correct] + partially_correct * VERDICT_POINTS[
            QuestionVerdict.partially_correct
        ]
        score = _round((points / attempted) * 100) if attempted else 0.0
        breakdowns.append(
            TopicBreakdown(
                module_id=module_id,
                topic_id=topic_id,
                attempted=attempted,
                correct=correct,
                partially_correct=partially_correct,
                incorrect=incorrect,
                unanswered=unanswered,
                practice_score_percent=score,
            )
        )
    return breakdowns


def _breakdown_by_competency(
    results: list[QuestionEvaluation], unanswered_flags: list[bool]
) -> list[CompetencyBreakdown]:
    groups: dict[str, list[tuple[QuestionEvaluation, bool]]] = {}
    order: list[str] = []
    for result, unanswered in zip(results, unanswered_flags):
        label = result.competency.text
        if label not in groups:
            groups[label] = []
            order.append(label)
        groups[label].append((result, unanswered))

    breakdowns: list[CompetencyBreakdown] = []
    for label in order:
        items = groups[label]
        attempted = len(items)
        correct = sum(1 for r, u in items if not u and r.verdict == QuestionVerdict.correct)
        partially_correct = sum(
            1 for r, u in items if not u and r.verdict == QuestionVerdict.partially_correct
        )
        incorrect = sum(1 for r, u in items if not u and r.verdict == QuestionVerdict.incorrect)
        points = correct * VERDICT_POINTS[QuestionVerdict.correct] + partially_correct * VERDICT_POINTS[
            QuestionVerdict.partially_correct
        ]
        score = _round((points / attempted) * 100) if attempted else 0.0
        breakdowns.append(
            CompetencyBreakdown(
                competency=label,
                attempted=attempted,
                correct=correct,
                partially_correct=partially_correct,
                incorrect=incorrect,
                practice_score_percent=score,
            )
        )
    return breakdowns
