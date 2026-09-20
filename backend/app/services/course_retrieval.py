"""Course-wide retrieval determinístico (v1.4.0, Bloque 1:
"COURSE-WIDE RETRIEVAL FOUNDATION").

Busca `SourceBlock`s relevantes en TODO un curso (cruzando módulos y
tópicos), reutilizando exclusivamente el repositorio seguro ya existente
(`app/services/courses.py`) y el modelo canónico ya existente
(`app/models/schemas.py::CanonicalTopicContent`/`SourceBlock`). Sin LLM,
sin embeddings, sin vector DB, sin segundo servicio: un ranking lexical
determinístico (BM25-like con boost por campo), calculado in-process
sobre el contenido actual del curso en cada llamada.

Este módulo NO decide si "el curso responde la pregunta" -- eso es
responsabilidad de un bloque futuro que integre esto con el Tutor. Acá
solo se devuelven `CourseEvidenceCandidate` rankeados; una lista vacía
significa "sin evidencia lexical significativa", nunca "no se buscó".

Pipeline:

    Course (repositorio seguro, course_service.get_course_detail)
        -> (module_id, topic_id) en orden estable de filesystem
        -> CanonicalTopicContent por tópico (course_service.get_canonical_topic)
        -> SourceBlocks "buscables" (ver _SEARCHABLE_BLOCK_TYPES)
        -> tokenización determinística (normalize_text/tokenize)
        -> scoring BM25-like con boost de campo (topic_title > heading_path > body)
        -> filtro de no-match (0 términos coincidentes => descartado, nunca incluido)
        -> orden determinístico (score desc, luego posición estable en el curso)
        -> diversidad opcional por tópico
        -> top_k CourseEvidenceCandidate
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field

from app.config import Settings
from app.models.retrieval import CourseEvidenceCandidate
from app.models.schemas import SourceBlock
from app.services import courses as course_service

DEFAULT_TOP_K = 6
MAX_TOP_K = 10
DEFAULT_MAX_PER_TOPIC = 3

# PARTE 6: bloques con contenido pedagógico real. Un heading standalone
# nunca es evidencia por sí mismo (no sostiene una afirmación completa) --
# pero su texto SÍ participa del ranking a través de `heading_path` de los
# bloques que contiene. `horizontal_rule` y `other` (block_type sin
# clasificar) tampoco son buscables.
_SEARCHABLE_BLOCK_TYPES = frozenset({"paragraph", "list", "table", "code", "blockquote", "image"})

# Boosts de campo (PARTE 9): coincidir en el título del tópico pesa más
# que coincidir en el heading_path, que a su vez pesa más que una
# coincidencia incidental en el cuerpo del bloque. Calibrado leyendo QA
# real (ver docs/COURSE_GROUNDED_TUTOR_V1_4.md), no una convención externa.
_WEIGHT_TITLE = 3.0
_WEIGHT_HEADING = 2.0
_WEIGHT_BODY = 1.0

# BM25 clásico (Robertson/Sparck Jones). k1 controla la saturación de
# term-frequency, b controla cuánto penaliza un bloque más largo que el
# promedio. Valores estándar de la literatura -- no se recalibran acá
# porque el corpus (SourceBlocks pedagógicos cortos) no mostró necesidad
# real durante QA.
_BM25_K1 = 1.5
_BM25_B = 0.75

# PARTE 7: lista mínima y deliberadamente pequeña -- palabras function
# words extremadamente comunes en español/inglés que casi nunca aportan
# señal de relevancia en una query corta. Nunca un diccionario de
# sinónimos, nunca stemming: esto es solo ruido de alta frecuencia.
_STOPWORDS = frozenset(
    {
        # Español
        "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del",
        "al", "a", "en", "y", "o", "que", "es", "son", "se", "su", "sus",
        "por", "para", "con", "sin", "como", "más", "pero", "si", "no",
        "lo", "le", "les", "este", "esta", "estos", "estas", "ese", "esa",
        "qué", "cómo", "cuál", "cuáles",
        # Inglés
        "the", "a", "an", "of", "to", "in", "is", "are", "and", "or",
        "that", "this", "these", "those", "for", "with", "on", "as",
        "what", "how", "which",
    }
)

# Términos técnicos cortos que NO deben tratarse como ruido pese a tener
# 1-2 caracteres tras tokenizar en mayúsculas (ej. "AI", "IA"). No son una
# regla de negocio -- son una excepción a un filtro de longitud mínima que
# de otro modo destruiría acrónimos reales (PARTE 8: "no hardcodear esos
# conceptos como reglas de negocio", así que esto NUNCA afecta el
# ranking, solo evita que el tokenizer descarte un acrónimo de 2 letras
# por "muy corto").
_MIN_TOKEN_LENGTH_DEFAULT = 2

_WORD_RE = re.compile(r"[^\W_]+(?:-[^\W_]+)*", re.UNICODE)


def normalize_text(text: str) -> str:
    """Normalización Unicode determinística: NFKC + casefold + remoción
    consistente de acentos/diacríticos. Se aplica IGUAL a la query y al
    corpus, así que "constitución" y "constitucion" matchean entre sí sin
    ambigüedad. Nunca stemming, nunca sinónimos."""
    normalized = unicodedata.normalize("NFKC", text).casefold()
    decomposed = unicodedata.normalize("NFKD", normalized)
    without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return unicodedata.normalize("NFKC", without_marks)


def tokenize(text: str, *, min_length: int = _MIN_TOKEN_LENGTH_DEFAULT) -> list[str]:
    """Tokeniza determinísticamente: normaliza, separa en palabras
    (preservando guiones internos de términos compuestos como
    "spec-driven" o "contract-driven" como UN token adicional, sin perder
    sus partes), filtra vacíos/stopwords/tokens demasiado cortos.

    Un token con guion produce DOS entradas en el resultado: el compuesto
    completo ("spec-driven") y sus partes ("spec", "driven") por
    separado -- así una query "spec driven design" matchea contenido
    escrito "Spec-Driven Design" y viceversa, sin diccionario de
    sinónimos ni normalización especial por tema."""
    normalized = normalize_text(text)
    tokens: list[str] = []
    for match in _WORD_RE.finditer(normalized):
        raw = match.group(0)
        parts = raw.split("-")
        candidates = [raw] if len(parts) > 1 else []
        candidates.extend(parts)
        for candidate in candidates:
            if len(candidate) < min_length:
                continue
            if candidate in _STOPWORDS:
                continue
            tokens.append(candidate)
    return tokens


@dataclass(frozen=True)
class _CorpusEntry:
    """Un SourceBlock buscable, ya tokenizado, con su posición estable en
    el curso (para tie-breaking determinístico) y su metadata de
    módulo/tópico ya resuelta."""

    course_id: str
    module_id: str
    module_title: str
    topic_id: str
    topic_title: str
    block: SourceBlock
    order_key: tuple[int, int, int]  # (module_index, topic_index, block_index)

    title_tokens: tuple[str, ...] = field(repr=False)
    heading_tokens: tuple[str, ...] = field(repr=False)
    body_tokens: tuple[str, ...] = field(repr=False)
    body_length: int = field(repr=False)


def _build_corpus(
    settings: Settings, course_id: str, *, exclude_topic_id: str | None
) -> list[_CorpusEntry]:
    """Escanea TODO el curso (todos los módulos, todos los tópicos) y
    devuelve las entradas buscables ya tokenizadas. Sin cache (PARTE 18):
    siempre lee el contenido actual del curso, nunca puede quedar stale.
    Reutiliza exclusivamente el repositorio seguro existente
    (`course_service.iter_all_canonical_topics`, que resuelve el curso una
    sola vez en vez de repetir la resolución completa por cada tópico --
    ver su docstring para la medición real) -- nunca construye una ruta de
    filesystem a partir de `course_id`/`module_id`/`topic_id`."""
    module_index_by_id: dict[str, int] = {}
    topic_index_by_module: dict[str, int] = {}

    entries: list[_CorpusEntry] = []
    for module_summary, topic_summary, canonical in course_service.iter_all_canonical_topics(
        settings.content_path, course_id
    ):
        if exclude_topic_id is not None and topic_summary.id == exclude_topic_id:
            continue

        module_index = module_index_by_id.setdefault(module_summary.id, len(module_index_by_id))
        topic_index = topic_index_by_module.get(module_summary.id, 0)
        topic_index_by_module[module_summary.id] = topic_index + 1

        title_tokens = tuple(tokenize(topic_summary.title))
        for block_index, block in enumerate(canonical.source_blocks):
            if block.block_type not in _SEARCHABLE_BLOCK_TYPES:
                continue
            heading_tokens = tuple(tokenize(" ".join(block.heading_path)))
            body_tokens = tuple(tokenize(block.plain_text))
            entries.append(
                _CorpusEntry(
                    course_id=course_id,
                    module_id=module_summary.id,
                    module_title=module_summary.title,
                    topic_id=topic_summary.id,
                    topic_title=topic_summary.title,
                    block=block,
                    order_key=(module_index, topic_index, block_index),
                    title_tokens=title_tokens,
                    heading_tokens=heading_tokens,
                    body_tokens=body_tokens,
                    body_length=len(body_tokens),
                )
            )
    return entries


def _document_frequencies(corpus: list[_CorpusEntry]) -> dict[str, int]:
    df: dict[str, int] = {}
    for entry in corpus:
        seen_terms = set(entry.title_tokens) | set(entry.heading_tokens) | set(entry.body_tokens)
        for term in seen_terms:
            df[term] = df.get(term, 0) + 1
    return df


def _idf(term_df: int, corpus_size: int) -> float:
    # BM25 IDF con piso en 0 (Robertson-Walker): nunca negativo, un
    # término presente en absolutamente todos los bloques no puede restar
    # puntaje.
    value = math.log(1.0 + (corpus_size - term_df + 0.5) / (term_df + 0.5))
    return max(value, 0.0)


def _term_frequency(tokens: tuple[str, ...], term: str) -> int:
    return sum(1 for t in tokens if t == term)


def _score_entry(
    entry: _CorpusEntry,
    query_terms: list[str],
    idf_by_term: dict[str, float],
    avg_body_length: float,
) -> tuple[float, list[str]]:
    """BM25-like con boost de campo: cada término de la query aporta
    IDF(term) * saturación(term-frequency ponderada por campo). La
    normalización por longitud (k1/b) usa el largo del CUERPO del bloque
    (title/heading son cortos y consistentes, no hace falta normalizarlos
    por separado). Devuelve (score, términos que efectivamente matchearon
    al menos una vez en algún campo) -- si esa lista queda vacía, el
    bloque no tiene ninguna coincidencia lexical real."""
    score = 0.0
    matched_terms: list[str] = []
    unique_query_terms = list(dict.fromkeys(query_terms))  # dedup preservando orden

    for term in unique_query_terms:
        idf = idf_by_term.get(term)
        if idf is None:
            continue  # término no existe en absoluto en el corpus del curso

        tf_title = _term_frequency(entry.title_tokens, term)
        tf_heading = _term_frequency(entry.heading_tokens, term)
        tf_body = _term_frequency(entry.body_tokens, term)
        if tf_title == 0 and tf_heading == 0 and tf_body == 0:
            continue

        matched_terms.append(term)
        weighted_tf = (
            _WEIGHT_TITLE * tf_title + _WEIGHT_HEADING * tf_heading + _WEIGHT_BODY * tf_body
        )
        length_norm = 1 - _BM25_B + _BM25_B * (
            (entry.body_length / avg_body_length) if avg_body_length > 0 else 1.0
        )
        saturated = (weighted_tf * (_BM25_K1 + 1)) / (weighted_tf + _BM25_K1 * length_norm)
        score += idf * saturated

    if not matched_terms:
        return 0.0, []

    # PARTE 11/28 (no-match): un único término coincidente, sobre una
    # query de 2+ términos, no es evidencia significativa -- QA real
    # mostró exactamente esto: queries claramente ajenas al curso ("receta
    # tradicional de asado", "resultados del partido de fútbol") igual
    # producían un candidato porque UNA palabra genérica ("tradicional",
    # "resultados") aparecía de casualidad en algún bloque, con un score
    # en el mismo rango que un match legítimo de un solo término. La
    # cobertura mínima (al menos 2 términos distintos quando la query
    # tiene 2 o más) es la señal que sí distingue ambos casos de forma
    # determinística, sin IDF absoluto arbitrario ni lista de palabras
    # "genéricas" hardcodeada.
    if len(matched_terms) < min(2, len(unique_query_terms)):
        return 0.0, []

    # PARTE 9 "term coverage": un bloque que matchea MÁS términos
    # distintos de la query debe rankear mejor que uno que solo matchea
    # un término repetido muchas veces, aun con el mismo score BM25 base.
    # Multiplicador acotado en [0.5, 1.0] -- nunca anula un match parcial
    # fuerte, solo lo pondera hacia abajo relativo a una cobertura mayor.
    coverage = len(matched_terms) / len(unique_query_terms)
    score *= 0.5 + 0.5 * coverage

    # Bonus de frase exacta (PARTE 9): si la query normalizada completa
    # aparece como substring contiguo del texto del campo, sumamos un
    # bonus fijo ponderado por el boost de ese campo -- favorece un match
    # de frase real ("spec drift") sobre una coincidencia de términos
    # sueltos y dispersos.
    query_phrase = " ".join(unique_query_terms)
    if query_phrase:
        if query_phrase in " ".join(entry.title_tokens):
            score += _WEIGHT_TITLE
        if query_phrase in " ".join(entry.heading_tokens):
            score += _WEIGHT_HEADING
        if query_phrase in " ".join(entry.body_tokens):
            score += _WEIGHT_BODY

    return score, matched_terms


def _select_with_diversity(
    ranked: list[tuple[float, list[str], _CorpusEntry]],
    *,
    top_k: int,
    max_per_topic: int | None,
) -> list[tuple[float, list[str], _CorpusEntry]]:
    """PARTE 15: evita que un solo tópico ocupe todo `top_k` solo porque
    repite el término buscado muchas veces. Selección en dos pasadas,
    determinística: primero respeta `max_per_topic`; si eso deja huecos
    (no hay suficiente diversidad real de tópicos para llenar `top_k`),
    una segunda pasada completa con los candidatos restantes de mayor
    score, ignorando el límite -- nunca devuelve MENOS resultados de los
    que existirían sin diversidad."""
    if max_per_topic is None:
        return ranked[:top_k]

    selected: list[tuple[float, list[str], _CorpusEntry]] = []
    per_topic_count: dict[tuple[str, str], int] = {}
    deferred: list[tuple[float, list[str], _CorpusEntry]] = []

    for item in ranked:
        entry = item[2]
        key = (entry.module_id, entry.topic_id)
        if per_topic_count.get(key, 0) < max_per_topic:
            selected.append(item)
            per_topic_count[key] = per_topic_count.get(key, 0) + 1
        else:
            deferred.append(item)
        if len(selected) >= top_k:
            return selected[:top_k]

    for item in deferred:
        if len(selected) >= top_k:
            break
        selected.append(item)

    return selected[:top_k]


def search_course(
    settings: Settings,
    course_id: str,
    query: str,
    *,
    exclude_topic_id: str | None = None,
    top_k: int = DEFAULT_TOP_K,
    max_per_topic: int | None = DEFAULT_MAX_PER_TOPIC,
) -> list[CourseEvidenceCandidate]:
    """Busca evidencia lexical determinística en TODO el curso
    (`course_id`), opcionalmente excluyendo un tópico (`exclude_topic_id`
    -- típicamente el tópico actual, cuando ya se determinó que no
    alcanza y se quiere buscar en el RESTO del curso).

    Determinístico: la misma combinación (curso, query, contenido) SIEMPRE
    produce los mismos candidatos, en el mismo orden, con los mismos
    scores -- no hay ninguna fuente de aleatoriedad ni de I/O externo.

    Devuelve `[]` cuando la query no tiene ninguna coincidencia lexical
    real con el contenido del curso -- nunca "rellena" el resultado con
    candidatos irrelevantes solo porque `top_k > 0` (PARTE 11).

    Lanza las mismas excepciones que `course_service.get_course_detail`
    (`CourseNotFoundError`) si el curso no existe -- resuelto siempre por
    el repositorio seguro, nunca a partir de una ruta de filesystem
    construida acá."""
    top_k = max(1, min(top_k, MAX_TOP_K))

    query_terms = tokenize(query)
    if not query_terms:
        return []

    corpus = _build_corpus(settings, course_id, exclude_topic_id=exclude_topic_id)
    if not corpus:
        return []

    df = _document_frequencies(corpus)
    idf_by_term = {term: _idf(df_count, len(corpus)) for term, df_count in df.items()}
    avg_body_length = sum(e.body_length for e in corpus) / len(corpus) if corpus else 0.0

    scored: list[tuple[float, list[str], _CorpusEntry]] = []
    for entry in corpus:
        score, matched_terms = _score_entry(entry, query_terms, idf_by_term, avg_body_length)
        if score > 0.0:
            scored.append((score, matched_terms, entry))

    if not scored:
        return []

    # Orden determinístico: score descendente, tie-break por posición
    # estable (module_index, topic_index, block_index) -- nunca por hash
    # ni por cualquier fuente no determinística.
    scored.sort(key=lambda item: (-item[0], item[2].order_key))

    selected = _select_with_diversity(scored, top_k=top_k, max_per_topic=max_per_topic)

    return [
        CourseEvidenceCandidate(
            course_id=entry.course_id,
            module_id=entry.module_id,
            module_title=entry.module_title,
            topic_id=entry.topic_id,
            topic_title=entry.topic_title,
            source_ref=entry.block.source_ref,
            block_type=entry.block.block_type,
            heading_path=list(entry.block.heading_path),
            start_line=entry.block.start_line,
            end_line=entry.block.end_line,
            markdown=entry.block.markdown,
            plain_text=entry.block.plain_text,
            score=round(score, 6),
            matched_terms=matched_terms,
        )
        for score, matched_terms, entry in selected
    ]
