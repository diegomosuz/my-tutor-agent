"""Modelos Pydantic del pipeline de generación de clases con LLM (Fase 3).

Todo lo que el LLM devuelve (`GeneratedLessonBody` y sus componentes) pasa
por validación Pydantic (forma del contrato) y luego por validación de
grounding (`app/services/lesson_validation.py`, contenido trazable al
material autorizado) antes de aceptarse. Los campos determinísticos de
`LessonPlan` (ids, `content_sha256`, `provider`, `model`, `cached`) los
agrega el backend; el LLM nunca los produce.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator


class GroundedText(BaseModel):
    """Texto pedagógico con trazabilidad ESTRUCTURAL a uno o más
    `SourceBlock` del `CanonicalTopicContent` del tópico.

    IMPORTANTE — límite de esta garantía (ver CLAUDE.md / ARCHITECTURE.md):
    `source_refs` demuestra que el LLM declaró de qué bloques fuente dice
    derivar el texto, y que esos bloques existen realmente en el material
    autorizado. Esto NO es una prueba semántica de que el texto generado
    efectivamente se infiere de forma correcta de esos bloques (no hay
    verificación de entailment). Es trazabilidad estructural, no una
    garantía matemática de fidelidad del contenido.
    """

    text: str
    source_refs: list[str] = Field(default_factory=list)

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("GroundedText.text no puede estar vacío")
        return value

    @field_validator("source_refs")
    @classmethod
    def _refs_not_empty(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("GroundedText.source_refs no puede estar vacío")
        return value


class VisualType(str, Enum):
    """Tipos de visual DECLARATIVOS soportados por el renderer (frontend).
    Enum cerrado a propósito: el LLM nunca puede introducir un tipo de
    visual arbitrario (ver invariante J de Fase 3).

    v1.1.0 (bloque de rendering pedagógico): se agrega `image`, que
    reutiliza el mismo patrón ya usado por `table`/`code`/`quote` — cita un
    `SourceBlock` de tipo "image" ya existente vía `source_refs`. Nunca hay
    un campo de URL/ruta separado: es estructuralmente imposible que el LLM
    apunte a una imagen que no exista en el material (misma garantía que
    `validate_source_refs` ya provee para el resto del contenido)."""

    none = "none"
    hero = "hero"
    bullets = "bullets"
    process = "process"
    comparison = "comparison"
    hierarchy = "hierarchy"
    architecture = "architecture"
    concept_map = "concept_map"
    table = "table"
    code = "code"
    quote = "quote"
    image = "image"


class LayoutHint(str, Enum):
    default = "default"
    left_to_right = "left_to_right"
    top_down = "top_down"
    two_column = "two_column"
    centered = "centered"


class VisualEmphasis(str, Enum):
    """Énfasis visual controlado (v1.1.0): nunca un color arbitrario del
    LLM — el frontend mapea cada valor a un design token PwC fijo. Usar con
    moderación (el prompt lo pide explícitamente)."""

    neutral = "neutral"
    primary = "primary"
    secondary = "secondary"
    warning = "warning"


class ProcessStep(BaseModel):
    """Un paso de un `visual_type='process'`. `label` y `detail` son texto
    corto de PRESENTACIÓN (como `description` en `VisualPlan`): el
    grounding pedagógico de todo el proceso lo sigue garantizando
    `VisualPlan.source_refs` a nivel de escena — no se pide un source_ref
    por paso para no duplicar la complejidad de grounding que ya cubre el
    nivel de escena (ver docs/LESSON_RENDERING.md)."""

    label: str = Field(min_length=1, max_length=120)
    detail: str = Field(default="", max_length=280)


class ComparisonRow(BaseModel):
    """Una fila de un `visual_type='comparison'` en modo tabla (ver
    `ComparisonPlan`). `values` debe tener exactamente un valor por columna
    declarada — se valida en `ComparisonPlan`."""

    label: str = Field(min_length=1, max_length=60)
    values: list[str] = Field(min_length=1)


class ComparisonPlan(BaseModel):
    """Contenido estructurado de un `visual_type='comparison'`.

    Dos modos:
    - "cards" (rows vacío): `column_labels` son simplemente las 2-4
      etiquetas cortas a comparar (p.ej. "Concepto A" / "Concepto B") — el
      renderer muestra una card por columna usando `key_points`.
    - "tabla" (rows no vacío): cada fila tiene una etiqueta (p.ej.
      "Entradas") y un valor por columna — igual cantidad de valores que
      columnas en TODAS las filas.
    """

    column_labels: list[str] = Field(min_length=2, max_length=4)
    rows: list[ComparisonRow] = Field(default_factory=list, max_length=8)

    @field_validator("column_labels")
    @classmethod
    def _labels_not_blank(cls, value: list[str]) -> list[str]:
        for label in value:
            if not label or not label.strip():
                raise ValueError("ComparisonPlan.column_labels no puede tener etiquetas vacías")
        return value

    @model_validator(mode="after")
    def _rows_match_column_count(self) -> "ComparisonPlan":
        expected = len(self.column_labels)
        for i, row in enumerate(self.rows):
            if len(row.values) != expected:
                raise ValueError(
                    f"ComparisonPlan.rows[{i}] tiene {len(row.values)} valores, "
                    f"se esperaban {expected} (uno por columna declarada en column_labels)."
                )
        return self


class NodeRole(str, Enum):
    """Categoría visual opcional de un nodo (`architecture`/`concept_map`).
    Enum cerrado: nunca un rol arbitrario inventado por el LLM."""

    component = "component"
    service = "service"
    datastore = "datastore"
    external = "external"
    actor = "actor"
    concept = "concept"


class GraphNode(BaseModel):
    """Nodo de `architecture`/`concept_map`. `label`/`description` son
    texto corto de presentación (mismo criterio que `ProcessStep`): el
    grounding del diagrama completo lo cubre `VisualPlan.source_refs`."""

    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=200)
    role: NodeRole | None = None


class RelationType(str, Enum):
    """Clasificación semántica cerrada de una relación entre dos nodos.
    Nunca texto libre: evita que el LLM invente un tipo de relación
    ambiguo o con matiz semántico no soportado por la fuente."""

    connects_to = "connects_to"
    depends_on = "depends_on"
    contains = "contains"
    flows_to = "flows_to"
    relates_to = "relates_to"
    part_of = "part_of"


class GraphEdge(BaseModel):
    """Arista entre dos `GraphNode.id` declarados en la MISMA visual.
    `from_id`/`to_id` se validan estructuralmente contra `VisualPlan.nodes`
    (ver `VisualPlan._graph_edges_reference_declared_nodes` y
    `lesson_validation.py`) — una arista hacia un nodo inexistente se
    rechaza siempre, de forma determinística, sin intervención del LLM."""

    from_id: str = Field(min_length=1, max_length=40)
    to_id: str = Field(min_length=1, max_length=40)
    label: str = Field(default="", max_length=60)
    relation_type: RelationType = RelationType.relates_to


class VisualPlan(BaseModel):
    """Especificación DECLARATIVA de una visual, renderizada 100% por
    componentes React del equipo (ver frontend/src/classroom/visuals/).

    El LLM NUNCA debe generar HTML, JavaScript, React/JSX, CSS ejecutable,
    SVG ejecutable, scripts ni iframes: `description` es una instrucción de
    PRESENTACIÓN (qué mostrar y cómo organizarlo), no conocimiento
    pedagógico nuevo. Los campos estructurados agregados en v1.1.0
    (`process_steps`, `comparison`, `nodes`/`edges`) son la separación
    explícita entre QUÉ ENSEÑAR (key_points/narration/source_refs, siempre
    grounded) y CÓMO MOSTRARLO (estos campos: enums cerrados + texto corto
    de presentación + referencias estructurales entre sí) — nunca
    coordenadas, tamaños, colores ni markup libre: layout_hint ya es un
    enum cerrado, y `VisualEmphasis` mapea a design tokens fijos, nunca a
    un color arbitrario.
    """

    visual_type: VisualType
    layout_hint: LayoutHint = LayoutHint.default
    source_refs: list[str] = Field(
        default_factory=list,
        description=(
            "OBLIGATORIO salvo visual_type='none': uno o más SRC-XXX reales de "
            "AUTHORIZED SOURCE. NUNCA puede quedar vacío, sin importar cuántos "
            "otros campos tenga esta visual (process_steps/comparison/nodes/edges)."
        ),
    )
    description: str = ""
    emphasis: VisualEmphasis = VisualEmphasis.neutral

    # Contenido estructurado — solo se usa el campo relevante a
    # `visual_type`; el resto queda vacío/None (ver validate_lesson_body
    # para la clasificación completa "campo requerido por tipo").
    process_steps: list[ProcessStep] = Field(default_factory=list, max_length=8)
    comparison: ComparisonPlan | None = None
    nodes: list[GraphNode] = Field(default_factory=list, max_length=8)
    edges: list[GraphEdge] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def _refs_required_unless_none(self) -> "VisualPlan":
        if self.visual_type != VisualType.none and not self.source_refs:
            raise ValueError(
                "VisualPlan.source_refs no puede estar vacío cuando "
                f"visual_type='{self.visual_type.value}' (solo 'none' puede omitirlo)"
            )
        return self

    @model_validator(mode="after")
    def _graph_edges_reference_declared_nodes(self) -> "VisualPlan":
        if not self.edges:
            return self
        node_ids = {n.id for n in self.nodes}
        unknown: list[str] = []
        for edge in self.edges:
            if edge.from_id not in node_ids:
                unknown.append(edge.from_id)
            if edge.to_id not in node_ids:
                unknown.append(edge.to_id)
        if unknown:
            raise ValueError(
                f"VisualPlan.edges hace referencia a node id(s) inexistentes en "
                f"VisualPlan.nodes: {sorted(set(unknown))}."
            )
        return self


class InteractionType(str, Enum):
    comprehension_check = "comprehension_check"
    reflection = "reflection"


class InteractionPlan(BaseModel):
    """Preparación de interacción pedagógica (Fase 3). NO es un simulador
    de examen: sin scoring, sin dificultad, sin banco de preguntas, sin
    persistencia de resultados."""

    interaction_type: InteractionType
    question: GroundedText
    expected_answer: GroundedText | None = None

    @model_validator(mode="after")
    def _reflection_has_no_expected_answer_requirement(self) -> "InteractionPlan":
        # comprehension_check puede tener expected_answer; reflection no lo
        # requiere (puede ser None). No se fuerza nada adicional acá: la
        # validación de grounding de expected_answer (si está presente) se
        # hace de forma genérica junto con el resto de los GroundedText.
        return self


class SceneType(str, Enum):
    """Rol pedagógico de una escena — enum cerrado, el LLM no puede
    introducir un valor arbitrario. Decide composición visual, densidad,
    ritmo y narración (ver docs/LESSON_RENDERING.md); NUNCA es contenido
    pedagógico adicional en sí mismo.

    v1.1.0 (bloque de rendering pedagógico): expandido de 5 a 10 valores
    para poder distinguir explícitamente process/comparison/architecture/
    example/opening/closing, que antes caían todos en el genérico
    "visual_explanation". Se reutilizó este campo existente en vez de
    agregar un "scene_role" paralelo — ya cumplía exactamente ese rol."""

    opening = "opening"
    concept = "concept"
    explanation = "explanation"
    process = "process"
    comparison = "comparison"
    example = "example"
    architecture = "architecture"
    recap = "recap"
    checkpoint = "checkpoint"
    closing = "closing"


class LessonScene(BaseModel):
    scene_id: str
    scene_type: SceneType
    title: GroundedText
    key_points: list[GroundedText] = Field(default_factory=list)
    narration: list[GroundedText] = Field(default_factory=list)
    visual: VisualPlan
    interaction: InteractionPlan | None = None


class GeneratedLessonBody(BaseModel):
    """Lo ÚNICO que el LLM debe producir. course_id/module_id/topic_id,
    content_sha256, provider, model, timestamps y cache keys los agrega el
    backend de forma determinística (ver `LessonPlan`)."""

    lesson_title: GroundedText
    learning_objectives: list[GroundedText] = Field(default_factory=list)
    scenes: list[LessonScene] = Field(default_factory=list)
    recap: list[GroundedText] = Field(default_factory=list)

    @field_validator("scenes")
    @classmethod
    def _at_least_one_scene(cls, value: list[LessonScene]) -> list[LessonScene]:
        if not value:
            raise ValueError("GeneratedLessonBody.scenes no puede estar vacío")
        return value


class LessonPlan(BaseModel):
    """Ensamblada por el BACKEND a partir de `GeneratedLessonBody` +
    metadata determinística. Es lo que se cachea en filesystem y se
    devuelve al frontend."""

    lesson_id: str
    course_id: str
    module_id: str
    topic_id: str

    content_sha256: str
    prompt_version: str

    provider: str
    model: str

    lesson_title: GroundedText
    learning_objectives: list[GroundedText] = Field(default_factory=list)
    scenes: list[LessonScene]
    recap: list[GroundedText] = Field(default_factory=list)

    cached: bool
    # Informativo únicamente: NO forma parte de la cache key ni de
    # lesson_id (la identidad del contenido es determinística, ver
    # app/services/lesson_generator.py).
    generated_at: str


class AiStatusResponse(BaseModel):
    """Respuesta de GET /api/ai/status. Nunca debe incluir credenciales."""

    provider: str
    model: str
    configured: bool
    prompt_version: str


class GenerateLessonRequest(BaseModel):
    force_regenerate: bool = False
