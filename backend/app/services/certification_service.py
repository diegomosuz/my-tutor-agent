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

Preparación INCREMENTAL y demand-driven (v1.0.1 — ver
docs/RELEASE_NOTES_v1.0.1.md): `prepare_exam` NUNCA genera un QuestionBank
por cada tópico del scope antes de ensamblar el examen. Ordena los
candidatos (round-robin determinístico por módulo, sin `random`), y para
cada uno reutiliza cache si existe o genera solo si falta, deteniéndose en
cuanto hay cobertura y cantidad suficientes para `question_count` (early
stop). Un tópico que falla (error transitorio de proveedor, o contrato/
grounding inválido tras agotar reintentos) se salta y no aborta el resto —
solo un error SISTÉMICO (credencial rechazada o mal configurada) corta la
búsqueda de más candidatos de inmediato. Ver `prepare_exam` para el
algoritmo completo.

Principio de producto (ver CLAUDE.md / docs/ARCHITECTURE.md): esta
práctica NO representa ni afirma reproducir un examen oficial de ninguna
certificación externa.
"""
from __future__ import annotations

import contextvars
import hashlib
import logging
import random
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
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
from app.services.llm_provider import (
    LLMAuthError,
    LLMConfigurationError,
    LLMProvider,
    LLMUpstreamError,
    get_llm_provider,
)
from app.services.llm_retry import GenerationFailedError, generate_with_retries
from app.services.service_logging import log_event
from app.services.singleflight import SingleFlight

logger = logging.getLogger("pwc_tutor.certification")

# Deduplica generaciones concurrentes del MISMO QuestionBank (misma cache
# key) dentro de este proceso — ver docs/PERFORMANCE.md. Instancia a nivel
# de módulo: debe deduplicar entre requests HTTP distintos (dos
# preparaciones simultáneas que necesiten el mismo tópico), no solo dentro
# de las waves de una misma preparación (dentro de una preparación, cada
# tópico pendiente ya se genera una única vez — ver `_run_generation_waves`).
_bank_singleflight: SingleFlight = SingleFlight()

# Concurrencia de generación acotada (PARTE 3/4 de la especificación de
# performance v1.1.0): nunca 0 (secuencial roto) ni desmedida (ráfagas
# contra el proveedor LLM). 1 reproduce el comportamiento estrictamente
# secuencial de versiones anteriores.
_MIN_CONCURRENCY = 1
_MAX_CONCURRENCY = 4

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
    "CertificationInsufficientQuestionsError",
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


class CertificationInsufficientQuestionsError(Exception):
    """v1.0.1 (PARTE 8, Caso C): se agotaron todos los candidatos del
    scope y, aun con tolerancia a fallos por tópico, no se consiguió NI
    UNA pregunta válida. El proveedor LLM sí llegó a responder al menos
    una vez (si nunca respondió, se conserva la clasificación de error de
    proveedor real — ver `prepare_exam`) — esto NO es un error de
    proveedor, es "no hay material suficiente/válido para este pedido".
    Nunca incluye prompts, texto de respuestas ni datos sensibles en su
    mensaje."""

    def __init__(self, course_id: str, requested_count: int) -> None:
        self.course_id = course_id
        self.requested_count = requested_count
        super().__init__(
            f"No se pudieron generar preguntas válidas para el curso '{course_id}' "
            f"(se pidieron {requested_count})."
        )


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


@dataclass(frozen=True)
class _BankCacheContext:
    """Todo lo necesario para leer/escribir el QuestionBank de UN tópico,
    resuelto una sola vez y compartido entre el barrido cache-only (PARTE 2
    de la especificación de performance) y la generación real, para nunca
    duplicar/desincronizar la lógica de cache key."""

    canonical: CanonicalTopicContent
    grounding_packet: str
    cache_dir: Path
    key: str
    prompt_version: str
    items_per_topic: int
    log_context: dict[str, object]


def _resolve_bank_cache_context(
    *, settings: Settings, course_id: str, module_id: str, topic_id: str, llm_provider: LLMProvider
) -> _BankCacheContext:
    """Resuelve el tópico y calcula la cache key. Lanza
    `course_service.CourseNotFoundError`/`ModuleNotFoundError`/
    `TopicNotFoundError` si el tópico no existe, y `LLMConfigurationError`
    si el provider no está configurado (idéntico a versiones anteriores:
    incluso para un cache HIT se exige credencial configurada, ya que el
    provider/model participan de la cache key — ver docs/PERFORMANCE.md
    sección "Qué NO cambió")."""
    canonical, grounding_packet = course_service.get_grounding_packet(
        settings.content_path, course_id, module_id, topic_id
    )

    if not llm_provider.is_configured():
        raise LLMConfigurationError(
            f"El proveedor LLM configurado ('{llm_provider.name}') no tiene credencial disponible."
        )

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
    return _BankCacheContext(
        canonical=canonical,
        grounding_packet=grounding_packet,
        cache_dir=settings.certification_cache_path,
        key=key,
        prompt_version=prompt_version,
        items_per_topic=items_per_topic,
        log_context=log_context,
    )


def _peek_cached_question_bank(
    *, settings: Settings, course_id: str, module_id: str, topic_id: str, llm_provider: LLMProvider
) -> QuestionBank | None:
    """Lee (SIN generar) el QuestionBank cacheado de un tópico, si existe.
    Nunca llama al LLM. Usado por el barrido cache-only de `prepare_exam`
    (PARTE 2 de la especificación de performance v1.1.0): mirar TODOS los
    candidatos del scope en orden curricular buscando cache útil, antes de
    generar nada, incluso si el banco cacheado está más adelante en el
    orden que un candidato sin cache."""
    ctx = _resolve_bank_cache_context(
        settings=settings, course_id=course_id, module_id=module_id, topic_id=topic_id, llm_provider=llm_provider
    )
    bank = _read_cache(ctx.cache_dir, ctx.key)
    if bank is not None:
        log_event(logger, "certification_bank_cache_hit", **ctx.log_context)
    return bank


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
    bank, _was_cache_hit = _get_or_generate_question_bank_with_source(
        settings=settings,
        course_id=course_id,
        module_id=module_id,
        topic_id=topic_id,
        provider=provider,
        force_regenerate=force_regenerate,
    )
    return bank


def _generate_question_bank(
    *, settings: Settings, llm_provider: LLMProvider, ctx: _BankCacheContext
) -> QuestionBank:
    """El cuerpo real de generación (prompt -> LLM -> validación ->
    ensamblado -> cache). Nunca se llama directamente para un cache HIT."""
    log_event(logger, "certification_bank_generation_started", **ctx.log_context)
    started_at = time.monotonic()

    messages = build_certification_messages(
        grounding_packet=ctx.grounding_packet, items_per_topic=ctx.items_per_topic
    )

    def _validate(body: GeneratedQuestionBankBody) -> None:
        validate_question_bank(body, ctx.canonical)

    def _on_retry(attempt: int, reason: str) -> None:
        # `reason` ya viene sanitizado por llm_retry.py ("upstream_error"
        # | "invalid_contract" | "grounding_invalid"); nunca incluye texto
        # de la respuesta del LLM ni del prompt.
        log_event(
            logger, "certification_bank_generation_retry", **ctx.log_context, attempt=attempt, reason=reason
        )

    try:
        body = generate_with_retries(
            provider=llm_provider,
            messages=messages,
            response_model=GeneratedQuestionBankBody,
            validate=_validate,
            build_correction_message=build_certification_correction_message,
            on_retry=_on_retry,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        log_event(
            logger,
            "certification_bank_generation_failed",
            **ctx.log_context,
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        raise

    bank = _assemble_question_bank(
        body=body,
        canonical=ctx.canonical,
        provider_name=llm_provider.name,
        model=llm_provider.model,
        prompt_version=ctx.prompt_version,
        cache_key=ctx.key,
    )
    # Nunca cachear un banco vacío de forma persistente evitaría poder
    # servir tópicos genuinamente breves; sí evitamos cachear errores (ya
    # garantizado: solo llegamos acá tras una validación exitosa).
    _write_cache(ctx.cache_dir, ctx.key, bank)

    duration_ms = int((time.monotonic() - started_at) * 1000)
    log_event(
        logger,
        "certification_bank_generation_completed",
        **ctx.log_context,
        duration_ms=duration_ms,
        question_count=len(bank.questions),
    )
    return bank


def _get_or_generate_question_bank_with_source(
    *,
    settings: Settings,
    course_id: str,
    module_id: str,
    topic_id: str,
    provider: LLMProvider | None = None,
    force_regenerate: bool = False,
) -> tuple[QuestionBank, bool]:
    """Igual que `get_or_generate_question_bank`, pero además devuelve si
    fue un cache hit — usado internamente por `prepare_exam` para poder
    reportar `cache_hits`/`generated_banks` en el resumen de observabilidad
    sin recalcular la cache key por su cuenta (evita duplicar/desincronizar
    la lógica de cache).

    La generación real está deduplicada por single-flight (v1.1.0, PARTE 8
    de la especificación de performance): si dos requests HTTP distintos
    necesitan generar el MISMO QuestionBank al mismo tiempo, solo uno
    llama al LLM; el otro espera y reutiliza el resultado."""
    llm_provider = provider or get_llm_provider(settings)
    ctx = _resolve_bank_cache_context(
        settings=settings, course_id=course_id, module_id=module_id, topic_id=topic_id, llm_provider=llm_provider
    )

    if not force_regenerate:
        cached_bank = _read_cache(ctx.cache_dir, ctx.key)
        if cached_bank is not None:
            log_event(logger, "certification_bank_cache_hit", **ctx.log_context)
            return cached_bank, True

    log_event(logger, "certification_bank_cache_miss", **ctx.log_context)

    def _generate_and_cache() -> QuestionBank:
        # Re-check de cache tras adquirir el lock del single-flight: si
        # otra generación concurrente para esta misma key ya escribió
        # cache mientras esperábamos, la reutilizamos.
        if not force_regenerate:
            recached = _read_cache(ctx.cache_dir, ctx.key)
            if recached is not None:
                log_event(logger, "certification_bank_cache_hit", **ctx.log_context)
                return recached
        return _generate_question_bank(settings=settings, llm_provider=llm_provider, ctx=ctx)

    def _on_wait() -> None:
        log_event(logger, "certification_bank_singleflight_wait", **ctx.log_context)

    singleflight_key = ctx.key if not force_regenerate else f"{ctx.key}:force"
    bank = _bank_singleflight.call(singleflight_key, _generate_and_cache, on_wait=_on_wait)
    return bank, False


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


def _order_candidates_for_generation(
    pairs: list[tuple[str, str]], *, is_topic_specific_scope: bool
) -> list[tuple[str, str]]:
    """Reordena los candidatos (module_id, topic_id) para GENERACIÓN
    incremental (v1.0.1, PARTE 1). Nunca usa `random`; 100% determinístico.

    - Scope "tópicos específicos": se usa el orden que ya devuelve
      `resolve_scope` (el orden en que el alumno/UI los pidió) tal cual —
      no tiene sentido "cubrir módulos" cuando el alumno ya eligió tópicos
      puntuales.
    - Scope "curso completo" / "módulos específicos": round-robin
      determinístico por módulo (preservando el orden real de módulos y,
      dentro de cada módulo, el orden real de sus tópicos, ya establecido
      por `resolve_scope`): primero el 1er tópico de cada módulo, luego el
      2do de cada módulo que todavía tenga, etc. Esto evita concentrar
      siempre las primeras preguntas en el primer módulo cuando el pedido
      es, por ejemplo, "5 preguntas de curso completo" sobre un curso con
      30 tópicos.
    """
    if is_topic_specific_scope:
        return list(pairs)

    by_module: dict[str, list[tuple[str, str]]] = {}
    module_order: list[str] = []
    for module_id, topic_id in pairs:
        if module_id not in by_module:
            by_module[module_id] = []
            module_order.append(module_id)
        by_module[module_id].append((module_id, topic_id))

    ordered: list[tuple[str, str]] = []
    index = 0
    while True:
        appended_any = False
        for module_id in module_order:
            bucket = by_module[module_id]
            if index < len(bucket):
                ordered.append(bucket[index])
                appended_any = True
        if not appended_any:
            break
        index += 1
    return ordered


# --------------------------------------------------------------------------
# Cache-first global + concurrencia acotada (v1.1.0, bloque de performance)
# --------------------------------------------------------------------------


class _PrepareState:
    """Acumuladores compartidos entre la fase cache-only y la fase de
    generación de `prepare_exam`. `banks`/`total_available` se actualizan
    SIEMPRE en orden curricular (nunca en orden de finalización de una
    wave concurrente) — ver `_run_generation_waves`."""

    __slots__ = (
        "target_topic_coverage",
        "question_count",
        "banks",
        "total_available",
        "cache_hits",
        "cache_misses",
        "generated_banks",
        "failed_banks",
        "waves_started",
        "scanned_count",
        "pending_attempted",
        "systemic_error",
        "last_upstream_error",
        "had_contract_failure",
    )

    def __init__(self, *, target_topic_coverage: int, question_count: int) -> None:
        self.target_topic_coverage = target_topic_coverage
        self.question_count = question_count
        self.banks: list[QuestionBank] = []
        self.total_available = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.generated_banks = 0
        self.failed_banks = 0
        self.waves_started = 0
        # Candidatos efectivamente examinados: `scanned_count` cuenta el
        # barrido cache-only (FASE 1), `pending_attempted` cuenta cuántos de
        # los candidatos pendientes se intentaron generar (FASE 2). Un
        # candidato pendiente ya fue contado una vez en `scanned_count`, así
        # que la cuenta total de "nunca tocados" es la suma de lo que cada
        # fase dejó sin examinar en su propio universo (ver `prepare_exam`).
        self.scanned_count = 0
        self.pending_attempted = 0
        self.systemic_error: Exception | None = None
        self.last_upstream_error: LLMUpstreamError | None = None
        self.had_contract_failure = False

    def is_satisfied(self) -> bool:
        return (
            len(self.banks) >= self.target_topic_coverage
            and self.total_available >= self.question_count
        )

    def add_bank(self, bank: QuestionBank) -> None:
        self.banks.append(bank)
        self.total_available += len(bank.questions)


def _scan_cached_banks(
    *,
    settings: Settings,
    course_id: str,
    llm_provider: LLMProvider,
    candidates: list[tuple[str, str]],
    base_log_context: dict[str, object],
    state: _PrepareState,
) -> list[tuple[str, str]]:
    """FASE 1 (PARTE 2 de la especificación de performance): recorre TODOS
    los candidatos en orden curricular mirando solo su cache (nunca llama
    al LLM). Devuelve, en orden curricular, los candidatos que resultaron
    cache MISS (pendientes de generación). Se detiene apenas el cache
    acumulado alcanza para satisfacer el pedido — nunca sigue mirando cache
    de más candidatos de los necesarios, pero SÍ mira más allá de un miss
    puntual buscando un hit más adelante en el orden."""
    pending: list[tuple[str, str]] = []
    for module_id, topic_id in candidates:
        if state.is_satisfied():
            break
        state.scanned_count += 1
        cached = _peek_cached_question_bank(
            settings=settings,
            course_id=course_id,
            module_id=module_id,
            topic_id=topic_id,
            llm_provider=llm_provider,
        )
        if cached is not None:
            state.cache_hits += 1
            state.add_bank(cached)
            log_event(
                logger,
                "certification_questions_available",
                **base_log_context,
                module_id=module_id,
                topic_id=topic_id,
                questions_available=state.total_available,
                source="cache",
            )
        else:
            state.cache_misses += 1
            pending.append((module_id, topic_id))
    return pending


def _generate_one_for_wave(
    *, settings: Settings, course_id: str, module_id: str, topic_id: str, llm_provider: LLMProvider
) -> QuestionBank:
    """Wrapper delgado usado por `_run_generation_waves` dentro de un
    thread del pool: genera (nunca lee cache-only, eso ya lo hizo la fase
    1) el QuestionBank de un candidato pendiente. Las excepciones de
    `_get_or_generate_question_bank_with_source` se propagan tal cual —
    `_run_generation_waves` las clasifica al recoger `future.result()`."""
    bank, _was_cache_hit = _get_or_generate_question_bank_with_source(
        settings=settings, course_id=course_id, module_id=module_id, topic_id=topic_id, provider=llm_provider
    )
    return bank


def _run_generation_waves(
    *,
    settings: Settings,
    course_id: str,
    llm_provider: LLMProvider,
    pending: list[tuple[str, str]],
    base_log_context: dict[str, object],
    state: _PrepareState,
    max_concurrency: int,
) -> None:
    """FASE 2 (PARTES 3/5/6/7 de la especificación de performance): genera
    `pending` (candidatos que la fase cache-only no pudo resolver) en waves
    de hasta `max_concurrency` candidatos concurrentes, nunca todos a la
    vez. Tras cada wave se reevalúa `state.is_satisfied()`: si ya alcanza,
    la siguiente wave nunca se inicia (los candidatos restantes de
    `pending` nunca se tocan) — se acepta que la wave YA iniciada pueda
    producir hasta `max_concurrency - 1` bancos "de más" en vez de
    implementar cancelación de requests HTTP ya en curso.

    Determinismo (PARTE 5): los resultados de cada wave se agregan a
    `state.banks` SIEMPRE en el orden curricular de sumisión (iterando la
    lista de futures en orden), nunca en el orden en que terminan los
    threads — dos ejecuciones con los mismos QuestionBanks cacheados
    producen siempre el mismo examen ensamblado, sin importar qué tan
    rápido responda el proveedor para cada tópico.

    Tolerancia a fallos: un candidato que falla por un motivo específico
    de ESE tópico no bloquea al resto de su wave. Un error SISTÉMICO dejar
    terminar la wave ya iniciada (sus futures ya están corriendo), pero
    ninguna wave nueva arranca después."""
    effective_concurrency = max(1, min(max_concurrency, len(pending)))
    index = 0
    with ThreadPoolExecutor(max_workers=effective_concurrency) as executor:
        while index < len(pending) and not state.is_satisfied() and state.systemic_error is None:
            wave = pending[index : index + max_concurrency]
            state.waves_started += 1
            # NOTA: `state.attempted_count` no se incrementa acá — cada
            # candidato de `pending` ya fue contado una vez por el barrido
            # cache-only (`_scan_cached_banks`), que es lo único que decide
            # cuántos candidatos del scope se "tocaron" en total (para
            # `remaining_candidate_count`/`early_stop`).
            for module_id, topic_id in wave:
                log_event(
                    logger, "certification_topic_selected", **base_log_context, module_id=module_id, topic_id=topic_id
                )

            # contextvars.copy_context() propaga current_request_id (ver
            # app/services/service_logging.py) a los threads del pool —
            # ThreadPoolExecutor, a diferencia de asyncio, no lo hace solo.
            # Un Context no puede entrarse dos veces en simultáneo, así que
            # se captura una copia INDEPENDIENTE por cada tarea (nunca una
            # sola copia compartida entre los threads de la wave).
            futures = [
                executor.submit(
                    contextvars.copy_context().run,
                    _generate_one_for_wave,
                    settings=settings,
                    course_id=course_id,
                    module_id=module_id,
                    topic_id=topic_id,
                    llm_provider=llm_provider,
                )
                for module_id, topic_id in wave
            ]

            for (module_id, topic_id), future in zip(wave, futures):
                try:
                    bank = future.result()
                except (LLMConfigurationError, LLMAuthError) as exc:
                    state.systemic_error = exc
                    state.failed_banks += 1
                    log_event(
                        logger,
                        "certification_topic_skipped",
                        **base_log_context,
                        module_id=module_id,
                        topic_id=topic_id,
                        error_type=type(exc).__name__,
                        reason="systemic",
                    )
                    continue  # dejar terminar el resto de ESTA wave igual
                except LLMUpstreamError as exc:
                    state.last_upstream_error = exc
                    state.failed_banks += 1
                    log_event(
                        logger,
                        "certification_topic_skipped",
                        **base_log_context,
                        module_id=module_id,
                        topic_id=topic_id,
                        error_type=type(exc).__name__,
                        reason="upstream",
                    )
                    continue
                except GenerationFailedError as exc:
                    state.had_contract_failure = True
                    state.failed_banks += 1
                    log_event(
                        logger,
                        "certification_topic_skipped",
                        **base_log_context,
                        module_id=module_id,
                        topic_id=topic_id,
                        error_type=type(exc).__name__,
                        reason="invalid_contract_or_grounding",
                    )
                    continue

                state.generated_banks += 1
                state.add_bank(bank)
                log_event(
                    logger,
                    "certification_questions_available",
                    **base_log_context,
                    module_id=module_id,
                    topic_id=topic_id,
                    questions_available=state.total_available,
                    source="generated",
                )

            state.pending_attempted += len(wave)
            index += len(wave)


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
    """Resuelve el scope y genera/recupera QuestionBanks en dos fases
    (v1.1.0, bloque de performance — ver docs/PERFORMANCE.md; hereda el
    espíritu incremental/demand-driven de v1.0.1). El ensamblaje final
    sigue siendo 100% determinístico (round-robin por pregunta,
    `_round_robin_select`, NUNCA con el LLM), y el orden de los bancos
    usado para ese ensamblaje es siempre el orden curricular de los
    candidatos — nunca el orden en que terminan las llamadas concurrentes.

    Algoritmo:
      1. Ordenar candidatos (module_id, topic_id) — round-robin por módulo
         para scope curso/módulos, orden pedido para scope de tópicos.
      2. FASE CACHE-ONLY (`_scan_cached_banks`): recorrer TODOS los
         candidatos en ese orden mirando SOLO su cache (nunca llama al
         LLM). Si el cache ya alcanza para cubrir `question_count` con
         `target_topic_coverage` tópicos distintos, la preparación termina
         acá con CERO llamadas al proveedor — incluso si los bancos útiles
         están más adelante en el orden que un candidato sin cache (nunca
         se corta el barrido en el primer miss).
      3. FASE DE GENERACIÓN (`_run_generation_waves`), solo si la fase
         anterior no alcanzó: los candidatos que resultaron cache MISS se
         generan en "waves" de hasta `CERTIFICATION_MAX_CONCURRENCY`
         candidatos en paralelo (bounded concurrency, nunca todos a la
         vez). Tras cada wave se reevalúa la condición de early stop; si ya
         alcanza, la siguiente wave nunca se inicia (los candidatos
         restantes nunca se tocan). Un candidato que falla por un motivo
         específico de ESE tópico (`LLMUpstreamError` tras agotar sus
         reintentos, o `GenerationFailedError`) se registra y no bloquea al
         resto de su wave ni a las siguientes. Un error SISTÉMICO
         (`LLMConfigurationError`/`LLMAuthError`) dejar terminar la wave ya
         iniciada, pero ninguna wave nueva arranca después.
      4. Si al terminar no se consiguió NINGUNA pregunta válida: se decide
         el error más preciso posible (proveedor realmente inaccesible vs.
         ningún tópico produjo contenido válido) — nunca un 502 genérico si
         el proveedor sí respondió. Si se consiguió AL MENOS una pregunta
         válida, nunca es un error, aunque sea menos que `question_count`."""
    llm_provider = provider or get_llm_provider(settings)

    resolved_topics = resolve_scope(settings=settings, course_id=course_id, scope=scope)
    candidates = _order_candidates_for_generation(
        resolved_topics, is_topic_specific_scope=bool(scope.topic_ids)
    )
    target_topic_coverage = min(question_count, len(candidates))
    max_concurrency = max(
        _MIN_CONCURRENCY, min(_MAX_CONCURRENCY, settings.certification_max_concurrency)
    )

    base_log_context = {"course_id": course_id, "mode": mode.value}
    log_event(
        logger,
        "certification_prepare_started",
        **base_log_context,
        requested_count=question_count,
        candidate_count=len(candidates),
        max_concurrency=max_concurrency,
    )
    started_at = time.monotonic()

    state = _PrepareState(target_topic_coverage=target_topic_coverage, question_count=question_count)

    pending = _scan_cached_banks(
        settings=settings,
        course_id=course_id,
        llm_provider=llm_provider,
        candidates=candidates,
        base_log_context=base_log_context,
        state=state,
    )

    if not state.is_satisfied() and pending:
        _run_generation_waves(
            settings=settings,
            course_id=course_id,
            llm_provider=llm_provider,
            pending=pending,
            base_log_context=base_log_context,
            state=state,
            max_concurrency=max_concurrency,
        )

    duration_ms = int((time.monotonic() - started_at) * 1000)
    # "Nunca tocado" = candidatos que la fase cache-only nunca llegó a
    # mirar (candidate_count - scanned_count) + candidatos que resultaron
    # cache miss pero la fase de generación nunca intentó (len(pending) -
    # pending_attempted). Un candidato pendiente ya fue contado una vez en
    # scanned_count, por eso no se sigue sumando en la fase de generación.
    never_touched = (len(candidates) - state.scanned_count) + (len(pending) - state.pending_attempted)
    early_stop = state.is_satisfied() and never_touched > 0
    if early_stop:
        remaining = never_touched
        log_event(
            logger,
            "certification_early_stop",
            **base_log_context,
            topics_covered=len(state.banks),
            questions_available=state.total_available,
            remaining_candidate_count=remaining,
        )
        if remaining > 0:
            log_event(
                logger,
                "certification_bank_generation_skipped",
                **base_log_context,
                skipped_count=remaining,
                reason="early_stop",
            )

    if state.total_available == 0:
        log_event(
            logger,
            "certification_prepare_failed",
            **base_log_context,
            requested_count=question_count,
            candidate_count=len(candidates),
            failed_banks=state.failed_banks,
            duration_ms=duration_ms,
        )
        if state.systemic_error is not None:
            raise state.systemic_error
        if state.last_upstream_error is not None and not state.had_contract_failure:
            # Todos los intentos fallaron por red/proveedor, ninguno llegó
            # siquiera a producir contenido inválido: el proveedor está
            # genuinamente inaccesible (Caso B de la especificación).
            raise state.last_upstream_error
        # El proveedor respondió al menos una vez, pero ningún tópico
        # produjo contenido válido tras agotar reintentos y candidatos
        # (Caso C): esto NO es un error de proveedor.
        raise CertificationInsufficientQuestionsError(course_id, question_count)

    selected = _round_robin_select(state.banks, question_count, shuffle=shuffle, seed=seed)

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
        "certification_prepare_completed",
        **base_log_context,
        requested_count=question_count,
        candidate_count=len(candidates),
        cache_hits=state.cache_hits,
        cache_misses=state.cache_misses,
        generated_banks=state.generated_banks,
        failed_banks=state.failed_banks,
        waves_started=state.waves_started,
        max_concurrency=max_concurrency,
        questions_available=state.total_available,
        questions_returned=len(questions),
        early_stop=early_stop,
        duration_ms=duration_ms,
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
