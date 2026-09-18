"""Parser canónico de Markdown (Fase 2 — modelo canónico + grounding).

Transforma el Markdown de un tópico (ya sin frontmatter) en una lista
determinística de `SourceBlock`, y construye a partir de ellos el
`CanonicalTopicContent` y el Grounding Packet que en una fase futura se
enviará a un proveedor LLM.

Regla dura: este módulo NUNCA invoca un LLM. Todo acá es 100%
determinístico: mismo Markdown de entrada => exactamente el mismo modelo
canónico de salida (ver tests de invariantes en
`backend/tests/test_canonical.py`).

## Por qué markdown-it-py

Se usa `markdown-it-py` (dependencia nueva, ver requirements.txt) en lugar
de escribir un parser Markdown propio porque:

- es una librería madura y ampliamente usada (base de facto de la
  extensión Markdown de Jupyter/MyST), con muy pocas dependencias propias;
- expone, para cada token de bloque, el rango de líneas de origen
  (`token.map`), que es exactamente lo que necesitamos para `start_line` /
  `end_line` sin reimplementar esa lógica;
- soporta tablas simplemente habilitando la regla `table` sobre el preset
  `commonmark`, sin necesitar plugins adicionales pesados.

No se usa el preset `gfm-like` porque activa `linkify` (autodetección de
URLs sueltas), que requiere el paquete extra `linkify-it-py`; no lo
necesitamos porque los enlaces `[texto](url)` ya funcionan con el parser
inline estándar de CommonMark.
"""
from __future__ import annotations

import hashlib
import re

from markdown_it import MarkdownIt
from markdown_it.token import Token

from app.models.schemas import (
    CanonicalTopicContent,
    SourceBlock,
    SourceRefValidationResult,
    TopicMetadata,
)

_MD = MarkdownIt("commonmark").enable("table")

# Tipo de token de apertura (o token único, para bloques que no anidan
# contenido como "fence" u "hr") -> block_type expuesto en SourceBlock.
_BLOCK_TYPE_BY_TOKEN_TYPE = {
    "heading_open": "heading",
    "paragraph_open": "paragraph",
    "bullet_list_open": "list",
    "ordered_list_open": "list",
    "blockquote_open": "blockquote",
    "table_open": "table",
    "fence": "code",
    "code_block": "code",
    "hr": "horizontal_rule",
}

# --- Utilidades de "plain_text" (representación auxiliar sin sintaxis MD) ---
# Nota: son transformaciones puramente sintácticas (quitar marcadores),
# nunca reformulan ni resumen el contenido.
_LINK_OR_IMAGE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_INLINE_CODE = re.compile(r"`([^`]*)`")
_HEADING_PREFIX = re.compile(r"^#{1,6}\s*", re.MULTILINE)
_BLOCKQUOTE_PREFIX = re.compile(r"^[ \t]*>[ \t]?", re.MULTILINE)
_LIST_ITEM_PREFIX = re.compile(r"^[ \t]*([-*+]|\d+[.)])\s+", re.MULTILINE)
_EMPHASIS_MARKERS = re.compile(r"(\*\*\*|\*\*|\*|___|__|_)")
_TABLE_PIPES = re.compile(r"\|")
_TABLE_SEPARATOR_LINE = re.compile(r"^[ \t]*:?-+:?[ \t]*$")
_MULTI_BLANK_LINES = re.compile(r"\n{2,}")
_MULTI_SPACES = re.compile(r"[ \t]+")


class InvalidSourceReferenceError(Exception):
    """Se lanza cuando se solicita validar referencias SRC-XXX y alguna no
    existe en el `CanonicalTopicContent` correspondiente."""

    def __init__(self, invalid_refs: list[str]):
        self.invalid_refs = invalid_refs
        joined = ", ".join(invalid_refs)
        super().__init__(f"Referencias de fuente inválidas: {joined}")


def _strip_markdown_syntax(markdown_text: str) -> str:
    """Convierte un fragmento Markdown en texto plano aproximado, quitando
    únicamente marcadores de sintaxis (no reformula el contenido)."""
    text = markdown_text
    text = _LINK_OR_IMAGE.sub(r"\1", text)
    text = _INLINE_CODE.sub(r"\1", text)
    text = _HEADING_PREFIX.sub("", text)
    text = _BLOCKQUOTE_PREFIX.sub("", text)
    text = _LIST_ITEM_PREFIX.sub("", text)
    text = _EMPHASIS_MARKERS.sub("", text)
    lines = [
        line for line in text.split("\n") if not _TABLE_SEPARATOR_LINE.match(line)
    ]
    text = "\n".join(lines)
    text = _TABLE_PIPES.sub(" ", text)
    text = _MULTI_SPACES.sub(" ", text)
    text = _MULTI_BLANK_LINES.sub("\n", text)
    return text.strip()


def _code_block_plain_text(markdown_text: str) -> str:
    """Para bloques de código, el plain_text es el código en sí (sin las
    líneas de la valla ```), preservado literalmente: no tiene sentido
    quitarle sintaxis Markdown porque no es prosa, es código fuente."""
    lines = markdown_text.split("\n")
    if lines and lines[0].lstrip().startswith("```"):
        inner = lines[1:]
        if inner and inner[-1].strip().startswith("```"):
            inner = inner[:-1]
        return "\n".join(inner)
    # Bloque de código indentado (4 espacios): quitar la indentación mínima.
    return markdown_text


def _block_type_for_open_token(open_token: Token) -> str:
    return _BLOCK_TYPE_BY_TOKEN_TYPE.get(open_token.type, "other")


def _inline_child(block_tokens: list[Token]) -> Token | None:
    for tok in block_tokens:
        if tok.type == "inline":
            return tok
    return None


def _is_image_only_paragraph(block_tokens: list[Token]) -> bool:
    inline = _inline_child(block_tokens)
    if inline is None or not inline.children:
        return False
    meaningful = [
        child
        for child in inline.children
        if not (child.type == "text" and child.content.strip() == "")
    ]
    return len(meaningful) == 1 and meaningful[0].type == "image"


def _heading_level(open_token: Token) -> int:
    # tag es "h1".."h6"
    try:
        return int(open_token.tag[1:])
    except (IndexError, ValueError):
        return 1


def _split_top_level_blocks(tokens: list[Token]) -> list[list[Token]]:
    """Agrupa el stream plano de tokens de markdown-it-py en bloques de
    primer nivel (nivel 0 del documento), preservando los tokens anidados
    de cada bloque (ítems de lista, celdas de tabla, contenido inline).

    Un token de nivel 0 es o bien autosuficiente (nesting == 0: `fence`,
    `hr`, `html_block`, ...) o bien de apertura (nesting == 1). En ese
    segundo caso, dado que todo el contenido anidado tiene nivel >= 1, el
    primer token siguiente que vuelve a nivel 0 es exactamente su cierre
    correspondiente.
    """
    blocks: list[list[Token]] = []
    i = 0
    n = len(tokens)
    while i < n:
        tok = tokens[i]
        if tok.level != 0:
            # No debería ocurrir para un documento bien formado, pero por
            # robustez lo saltamos en lugar de romper el parseo.
            i += 1
            continue
        if tok.nesting == 0:
            blocks.append([tok])
            i += 1
            continue
        j = i + 1
        while j < n and tokens[j].level != 0:
            j += 1
        # tokens[j] es el cierre correspondiente (o fin de stream, guard).
        end = min(j + 1, n)
        blocks.append(tokens[i:end])
        i = end
    return blocks


def parse_source_blocks(markdown_text: str) -> list[SourceBlock]:
    """Convierte Markdown (sin frontmatter) en una lista ordenada y
    determinística de SourceBlock. No usa ningún LLM.
    """
    lines = markdown_text.split("\n")
    tokens = _MD.parse(markdown_text)
    top_blocks = _split_top_level_blocks(tokens)

    result: list[SourceBlock] = []
    heading_stack: list[tuple[int, str]] = []
    ref_index = 0

    for block_tokens in top_blocks:
        open_token = block_tokens[0]
        if open_token.map is None:
            # Bloque sin rango de líneas conocido (no debería ocurrir para
            # los tipos de bloque soportados); lo saltamos de forma segura.
            continue

        start_line = open_token.map[0] + 1  # 1-indexado
        end_line = open_token.map[1]  # map[1] es exclusivo (0-idx) == última línea 1-idx
        block_markdown = "\n".join(lines[start_line - 1 : end_line])

        block_type = _block_type_for_open_token(open_token)
        if block_type == "paragraph" and _is_image_only_paragraph(block_tokens):
            block_type = "image"

        if block_type == "code":
            plain_text = _code_block_plain_text(block_markdown)
        elif block_type == "heading":
            # No reusar block_markdown: para headings Setext (título +
            # línea de "===="/"----" subrayado), open_token.map abarca
            # AMBAS líneas (correcto para preservar el markdown literal),
            # pero el texto del título vive únicamente en el token inline
            # hijo (.content), que markdown-it-py ya resuelve sin la línea
            # de subrayado ni el prefijo "#" de un heading ATX.
            inline = _inline_child(block_tokens)
            heading_text = inline.content if inline is not None else block_markdown
            plain_text = _strip_markdown_syntax(heading_text)
        else:
            plain_text = _strip_markdown_syntax(block_markdown)

        if block_type == "heading":
            level = _heading_level(open_token)
            title = plain_text.strip() or block_markdown.strip()
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title))
            heading_path = [t for _, t in heading_stack]
        else:
            heading_path = [t for _, t in heading_stack]

        ref_index += 1
        result.append(
            SourceBlock(
                source_ref=f"SRC-{ref_index:03d}",
                block_type=block_type,
                markdown=block_markdown,
                plain_text=plain_text,
                heading_path=heading_path,
                start_line=start_line,
                end_line=end_line,
            )
        )

    return result


def build_canonical_topic(
    *,
    course_id: str,
    module_id: str,
    topic_id: str,
    metadata: TopicMetadata,
    raw_markdown: str,
) -> CanonicalTopicContent:
    """Construye el `CanonicalTopicContent` completo de un tópico.

    `raw_markdown` debe ser el Markdown ya sin frontmatter (el contenido
    pedagógico autorizado). El hash se calcula exactamente sobre ese texto,
    en UTF-8, sin timestamps ni metadata adicional: mismo contenido implica
    mismo hash; cualquier cambio real de contenido cambia el hash.
    """
    source_blocks = parse_source_blocks(raw_markdown)
    content_sha256 = hashlib.sha256(raw_markdown.encode("utf-8")).hexdigest()
    return CanonicalTopicContent(
        course_id=course_id,
        module_id=module_id,
        topic_id=topic_id,
        metadata=metadata,
        raw_markdown=raw_markdown,
        content_sha256=content_sha256,
        source_blocks=source_blocks,
        source_block_count=len(source_blocks),
    )


def build_grounding_packet(
    canonical: CanonicalTopicContent,
    *,
    course_title: str,
    module_title: str,
    topic_title: str,
) -> str:
    """Genera el Grounding Packet determinístico de un tópico.

    Es texto plano listo para ser usado en una fase futura como el ÚNICO
    contexto pedagógico entregado a un LLM. No agrega explicaciones ni
    instrucciones de prompting generadas por la aplicación: cada sección
    `[SRC-XXX]` contiene exclusivamente el Markdown fuente de ese bloque.
    """
    lines: list[str] = []
    lines.append("=== AUTHORIZED SOURCE: TOPIC ===")
    lines.append("")
    lines.append(f"Course: {course_title}")
    lines.append(f"Module: {module_title}")
    lines.append(f"Topic: {topic_title}")
    lines.append(f"Content SHA256: {canonical.content_sha256}")
    lines.append("")
    for block in canonical.source_blocks:
        lines.append(f"[{block.source_ref}]")
        lines.append(block.markdown)
        lines.append("")
    lines.append("=== END AUTHORIZED SOURCE ===")
    return "\n".join(lines) + "\n"


def validate_source_refs(
    references: list[str], canonical: CanonicalTopicContent
) -> SourceRefValidationResult:
    """Clasifica una lista de referencias SRC-XXX en válidas/inválidas
    respecto de los `source_blocks` de `canonical`. No lanza excepción: es
    la variante "informativa", pensada para reportar qué referencias
    citadas por un futuro LLM no existen en el material autorizado.
    """
    known_refs = {block.source_ref for block in canonical.source_blocks}
    valid_refs = [ref for ref in references if ref in known_refs]
    invalid_refs = [ref for ref in references if ref not in known_refs]
    return SourceRefValidationResult(valid_refs=valid_refs, invalid_refs=invalid_refs)


def assert_valid_source_refs(
    references: list[str], canonical: CanonicalTopicContent
) -> None:
    """Variante estricta de `validate_source_refs`: lanza
    `InvalidSourceReferenceError` si alguna referencia no existe. Pensada
    para usarse en la fase futura de validación de respuestas LLM."""
    result = validate_source_refs(references, canonical)
    if result.invalid_refs:
        raise InvalidSourceReferenceError(result.invalid_refs)
