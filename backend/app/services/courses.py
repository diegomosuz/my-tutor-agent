"""Repositorio de cursos: lee el filesystem de cursos montado en /content.

El contenido Markdown es la única fuente de verdad. Este módulo SOLO lee
(nunca escribe) y nunca construye rutas de filesystem a partir de input
del usuario sin antes validarlas contra los directorios/archivos reales
existentes, evitando así path traversal.
"""
from __future__ import annotations

from pathlib import Path

import frontmatter

from app.models.schemas import (
    CanonicalInfo,
    CanonicalTopicContent,
    CourseDetail,
    CourseSummary,
    ModuleSummary,
    TopicMetadata,
    TopicResponse,
    TopicSummary,
)
from app.services import canonical as canonical_service
from app.services.naming import extract_order, humanize, slugify


class CourseNotFoundError(Exception):
    pass


class ModuleNotFoundError(Exception):
    pass


class TopicNotFoundError(Exception):
    pass


# Nombres de directorio/archivo que nunca son un curso/módulo/tópico real
# (Fase 7, sección 11): artefactos del sistema operativo o de herramientas
# de compresión, nunca contenido pedagógico. Comparación case-insensitive.
_IGNORED_NAMES = {"__macosx", "thumbs.db", "desktop.ini", "node_modules"}


def _is_ignored(name: str) -> bool:
    # v1.6.1: un nombre que empieza con "_" (además de "." ya ignorado
    # desde Fase 7) es la misma convención de autor que "esto no es
    # contenido de curso" -- confirmado con un curso real
    # (`LangGraph_Sistemas_Agenticos_Reales`) que usa `_recursos/` (assets
    # compartidos entre módulos) y `_laboratorio/` (scripts de apoyo, con
    # su propio README.md) como directorios de nivel de curso, sibling de
    # los módulos reales. Sin esta regla, `_list_subdirs` los trataba como
    # módulos fantasma (`_recursos` con 0 tópicos; `_laboratorio` con un
    # único tópico "Readme" derivado de su README.md) -- un bug real de
    # course discovery, no solo cosmético: inflaba `module_count` y los
    # exponía como rutas de módulo navegables sin contenido pedagógico
    # real. Extiende la convención ya existente en vez de bloquear nombres
    # específicos por keyword (PARTE 9 de la especificación: exclusión
    # basada en convención de autor, nunca en un blocklist de palabras).
    return name.startswith(".") or name.startswith("_") or name.lower() in _IGNORED_NAMES


def _list_subdirs(path: Path) -> list[Path]:
    if not path.is_dir():
        return []
    # Fase 8, sección 7: un curso/módulo nunca puede ser un symlink. Sin
    # este chequeo, un directorio symlinkeado a fuera de /content pasaría
    # `is_dir()` igual (sigue symlinks) y luego el propio `.resolve()` de
    # ese directorio pasaría a ser la nueva "raíz" contra la que se
    # comparan sus assets/tópicos — el chequeo de contención de
    # `resolve_topic_asset` terminaría comparando contra la raíz ya
    # escapada, no contra /content real. Se rechaza cualquier symlink acá,
    # sin excepción (no hace falta resolver ni comparar rutas).
    entries = [
        p for p in path.iterdir() if p.is_dir() and not p.is_symlink() and not _is_ignored(p.name)
    ]
    entries.sort(key=lambda p: (extract_order(p.name), p.name.lower()))
    return entries


def _list_topic_files(path: Path) -> list[Path]:
    if not path.is_dir():
        return []
    entries = [
        p
        for p in path.iterdir()
        if p.is_file()
        and not p.is_symlink()
        and p.suffix.lower() == ".md"
        and not _is_ignored(p.name)
    ]
    entries.sort(key=lambda p: (extract_order(p.name), p.name.lower()))
    return entries


def _resolve_by_slug(candidates: list[Path], requested_id: str) -> Path | None:
    """Busca, entre directorios/archivos REALES del filesystem, cuál slug
    coincide con el id solicitado. Nunca construye una ruta a partir del
    input del usuario: solo compara contra entradas ya enumeradas.
    """
    for candidate in candidates:
        stem = candidate.stem if candidate.is_file() else candidate.name
        if slugify(stem) == requested_id:
            return candidate
    return None


def _read_topic_frontmatter(md_path: Path) -> tuple[dict, str]:
    raw = md_path.read_text(encoding="utf-8")
    post = frontmatter.loads(raw)
    return post.metadata or {}, raw


def _build_topic_summary(md_path: Path) -> TopicSummary:
    metadata, _raw = _read_topic_frontmatter(md_path)
    title = metadata.get("title") or humanize(md_path.stem)
    order = metadata.get("order")
    if not isinstance(order, int):
        order = extract_order(md_path.name)
    return TopicSummary(id=slugify(md_path.stem), title=str(title), order=order)


def _build_module_summary(module_dir: Path, include_topics: bool = True) -> ModuleSummary:
    topics = _list_topic_files(module_dir)
    topic_summaries = [_build_topic_summary(t) for t in topics] if include_topics else []
    return ModuleSummary(
        id=slugify(module_dir.name),
        title=humanize(module_dir.name),
        order=extract_order(module_dir.name),
        topics=topic_summaries,
    )


def _course_description(course_dir: Path) -> str:
    """Descripción opcional del curso: si existe un topic 00-intro con
    frontmatter description, no se usa (eso es a nivel tópico). Por ahora
    se infiere vacío desde filesystem salvo que se agregue metadata futura.
    """
    return ""


def _build_course_summary(course_dir: Path) -> CourseSummary:
    modules = _list_subdirs(course_dir)
    topic_count = sum(len(_list_topic_files(m)) for m in modules)
    return CourseSummary(
        id=slugify(course_dir.name),
        title=humanize(course_dir.name),
        description=_course_description(course_dir),
        order=extract_order(course_dir.name),
        module_count=len(modules),
        topic_count=topic_count,
    )


def list_courses(content_path: Path) -> list[CourseSummary]:
    course_dirs = _list_subdirs(content_path)
    return [_build_course_summary(c) for c in course_dirs]


def _find_course_dir(content_path: Path, course_id: str) -> Path:
    course_dirs = _list_subdirs(content_path)
    match = _resolve_by_slug(course_dirs, course_id)
    if match is None:
        raise CourseNotFoundError(course_id)
    return match


def _find_module_dir(course_dir: Path, module_id: str) -> Path:
    module_dirs = _list_subdirs(course_dir)
    match = _resolve_by_slug(module_dirs, module_id)
    if match is None:
        raise ModuleNotFoundError(module_id)
    return match


def _find_topic_file(module_dir: Path, topic_id: str) -> Path:
    topic_files = _list_topic_files(module_dir)
    match = _resolve_by_slug(topic_files, topic_id)
    if match is None:
        raise TopicNotFoundError(topic_id)
    return match


def get_course_detail(content_path: Path, course_id: str) -> CourseDetail:
    course_dir = _find_course_dir(content_path, course_id)
    module_dirs = _list_subdirs(course_dir)
    modules = [_build_module_summary(m) for m in module_dirs]
    return CourseDetail(
        id=slugify(course_dir.name),
        title=humanize(course_dir.name),
        description=_course_description(course_dir),
        order=extract_order(course_dir.name),
        modules=modules,
    )


def _resolve_topic(
    content_path: Path, course_id: str, module_id: str, topic_id: str
) -> tuple[Path, Path, Path]:
    course_dir = _find_course_dir(content_path, course_id)
    module_dir = _find_module_dir(course_dir, module_id)
    topic_file = _find_topic_file(module_dir, topic_id)
    return course_dir, module_dir, topic_file


def _topic_metadata_and_content(topic_file: Path) -> tuple[TopicMetadata, str]:
    """Lee el archivo del tópico y separa frontmatter (metadata) de
    contenido pedagógico (Markdown sin frontmatter). Tolerante a la
    ausencia de frontmatter.
    """
    metadata_raw, raw_full = _read_topic_frontmatter(topic_file)
    post = frontmatter.loads(raw_full)

    title = metadata_raw.get("title") or humanize(topic_file.stem)
    order = metadata_raw.get("order")
    if not isinstance(order, int):
        order = extract_order(topic_file.name)
    description = metadata_raw.get("description") or ""

    topic_metadata = TopicMetadata(title=str(title), order=order, description=str(description))
    return topic_metadata, post.content


def get_topic(
    content_path: Path, course_id: str, module_id: str, topic_id: str
) -> TopicResponse:
    course_dir, module_dir, topic_file = _resolve_topic(
        content_path, course_id, module_id, topic_id
    )
    topic_metadata, content_markdown = _topic_metadata_and_content(topic_file)

    course_summary = _build_course_summary(course_dir)
    module_summary = _build_module_summary(module_dir)
    topic_summary = TopicSummary(
        id=slugify(topic_file.stem), title=topic_metadata.title, order=topic_metadata.order
    )

    canonical = canonical_service.build_canonical_topic(
        course_id=course_summary.id,
        module_id=module_summary.id,
        topic_id=topic_summary.id,
        metadata=topic_metadata,
        raw_markdown=content_markdown,
    )

    return TopicResponse(
        course=course_summary,
        module=module_summary,
        topic=topic_summary,
        metadata=topic_metadata,
        content_markdown=content_markdown,
        canonical=CanonicalInfo(
            content_sha256=canonical.content_sha256,
            source_block_count=canonical.source_block_count,
            source_blocks=canonical.source_blocks,
        ),
    )


def get_canonical_topic(
    content_path: Path, course_id: str, module_id: str, topic_id: str
) -> CanonicalTopicContent:
    """Construye el `CanonicalTopicContent` completo (incluyendo
    raw_markdown) de un tópico. Usado por el endpoint de inspección
    /grounding y disponible para uso interno en fases futuras (validación
    de respuestas LLM, etc.)."""
    course_dir, module_dir, topic_file = _resolve_topic(
        content_path, course_id, module_id, topic_id
    )
    topic_metadata, content_markdown = _topic_metadata_and_content(topic_file)
    return canonical_service.build_canonical_topic(
        course_id=slugify(course_dir.name),
        module_id=slugify(module_dir.name),
        topic_id=slugify(topic_file.stem),
        metadata=topic_metadata,
        raw_markdown=content_markdown,
    )


def iter_all_canonical_topics(
    content_path: Path, course_id: str
) -> list[tuple[ModuleSummary, TopicSummary, CanonicalTopicContent]]:
    """Devuelve el `CanonicalTopicContent` de TODOS los tópicos de un
    curso, en el mismo orden estable que `get_course_detail` (v1.4.0,
    Bloque 1 -- introducida para `course_retrieval.py`, que necesita
    escanear el curso completo en cada búsqueda).

    Equivalente semántico de llamar `get_canonical_topic` una vez por
    cada `(module_id, topic_id)` de `get_course_detail(...).modules`,
    pero resolviendo el directorio del curso UNA sola vez en vez de
    repetir la resolución completa curso->módulo->tópico (con su propio
    listado de directorios) en cada llamada -- una redundancia real
    medida con un curso de 53 tópicos (`spec-driven-design-expert`): sin
    este helper, escanear el curso completo tomaba ~5s; con él, ~1.3s.
    Mismo repositorio seguro, mismas garantías de contención de path
    traversal (`_resolve_by_slug` sobre directorios ya enumerados) --
    nunca construye una ruta a partir de `course_id` directamente."""
    course_dir = _find_course_dir(content_path, course_id)
    resolved_course_id = slugify(course_dir.name)
    module_dirs = _list_subdirs(course_dir)

    results: list[tuple[ModuleSummary, TopicSummary, CanonicalTopicContent]] = []
    for module_dir in module_dirs:
        # include_topics=False: los topics de este module_summary se
        # completan más abajo con el título real por tópico (derivado de
        # frontmatter vía _topic_metadata_and_content, la misma fuente que
        # usa get_canonical_topic) -- evita listar y parsear cada archivo
        # de tópico dos veces.
        module_summary = _build_module_summary(module_dir, include_topics=False)
        topic_files = _list_topic_files(module_dir)
        for topic_file in topic_files:
            topic_metadata, content_markdown = _topic_metadata_and_content(topic_file)
            topic_summary = TopicSummary(
                id=slugify(topic_file.stem),
                title=topic_metadata.title,
                order=topic_metadata.order,
            )
            canonical = canonical_service.build_canonical_topic(
                course_id=resolved_course_id,
                module_id=module_summary.id,
                topic_id=topic_summary.id,
                metadata=topic_metadata,
                raw_markdown=content_markdown,
            )
            results.append((module_summary, topic_summary, canonical))
    return results


class AssetNotFoundError(Exception):
    """El asset no existe, es de un tipo no soportado, o el path pedido
    intenta salir del CURSO (path traversal; hasta v1.6.0 el límite era
    el módulo, ver `resolve_topic_asset`). Se usa un único tipo de error
    para las tres causas: el cliente nunca debe poder distinguir "existe
    pero está bloqueado" de "no existe" (ver sección 13 de la
    especificación de Fase 7)."""


# Allow-list explícita (no block-list): solo raster seguro. .svg queda
# deliberadamente afuera (puede contener <script>); .html/.js/.exe/.ps1/
# .bat/.cmd nunca se sirven bajo ningún concepto.
ASSET_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def resolve_topic_asset(
    content_path: Path, course_id: str, module_id: str, topic_id: str, asset_path: str
) -> tuple[Path, str]:
    """Resuelve un asset relativo (ej. `images/architecture.png`) referenciado
    desde el Markdown de un tópico, de forma segura.

    Reglas duras: el tópico se resuelve SIEMPRE con el mismo repositorio
    seguro que el resto de la app (`_resolve_topic`, nunca acepta una ruta
    de filesystem del cliente); el asset se resuelve relativo al directorio
    del MÓDULO (donde vive el .md que lo referencia), pero el resultado
    puede terminar en CUALQUIER lugar dentro del CURSO (v1.6.1 -- antes
    solo se permitía dentro del propio módulo). `Path.resolve()` +
    `is_relative_to(course_root)` garantizan que el resultado nunca pueda
    escapar de ese curso, sin importar cuántos `../` tenga `asset_path`,
    rutas absolutas o codificación -- la contención se verifica sobre la
    ruta canónica REAL en disco, nunca comparando el string de la ruta
    pedida (por eso ya no hace falta, y de hecho sería más débil, un
    rechazo temprano tipo `".." in requested.parts`).

    Motivo real del cambio (v1.6.1, encontrado con un curso real): algunos
    cursos comparten assets entre varios módulos en un directorio de nivel
    de curso (ej. `_recursos/`, sibling de los módulos) y los referencian
    desde el Markdown de un tópico con una ruta relativa que sube un nivel
    (`../_recursos/diagrama.png`) -- eso es exactamente lo que
    `is_relative_to(module_root)` (el criterio anterior) rechazaba
    incorrectamente, aunque el archivo nunca saliera del curso. Solo se
    sirven extensiones de la allow-list (`ASSET_MIME_TYPES`). Devuelve
    (path_real_en_disco, mime_type); lanza `AssetNotFoundError` en
    cualquier otro caso (no existe / tipo no soportado / traversal fuera
    del curso)."""
    course_dir, module_dir, _topic_file = _resolve_topic(
        content_path, course_id, module_id, topic_id
    )

    requested = Path(asset_path)
    if requested.is_absolute() or not asset_path:
        raise AssetNotFoundError(asset_path)

    suffix = requested.suffix.lower()
    mime_type = ASSET_MIME_TYPES.get(suffix)
    if mime_type is None:
        raise AssetNotFoundError(asset_path)

    course_root = course_dir.resolve()
    candidate = (module_dir / requested).resolve()
    if not candidate.is_relative_to(course_root):
        raise AssetNotFoundError(asset_path)

    if not candidate.is_file():
        raise AssetNotFoundError(asset_path)

    return candidate, mime_type


def get_grounding_packet(
    content_path: Path,
    course_id: str,
    module_id: str,
    topic_id: str,
    *,
    include_structural_metadata: bool = False,
) -> tuple[CanonicalTopicContent, str]:
    """Devuelve el `CanonicalTopicContent` de un tópico junto con su
    Grounding Packet ya renderizado como texto determinístico.

    `include_structural_metadata` (v1.3.0, default False): se reenvía tal
    cual a `canonical_service.build_grounding_packet` -- ver el docstring
    de esa función. Solo `lesson_generator.py` lo activa; el resto de los
    llamadores (tutor, checkpoints, certificación, endpoint `/grounding`)
    no pasan este argumento y siguen recibiendo el packet sin cambios."""
    course_dir, module_dir, topic_file = _resolve_topic(
        content_path, course_id, module_id, topic_id
    )
    topic_metadata, content_markdown = _topic_metadata_and_content(topic_file)
    canonical = canonical_service.build_canonical_topic(
        course_id=slugify(course_dir.name),
        module_id=slugify(module_dir.name),
        topic_id=slugify(topic_file.stem),
        metadata=topic_metadata,
        raw_markdown=content_markdown,
    )
    packet = canonical_service.build_grounding_packet(
        canonical,
        course_title=humanize(course_dir.name),
        module_title=humanize(module_dir.name),
        topic_title=topic_metadata.title,
        include_structural_metadata=include_structural_metadata,
    )
    return canonical, packet
