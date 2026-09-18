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
    """Tipos de visual DECLARATIVOS soportados por un futuro renderer.
    Enum cerrado a propósito: el LLM nunca puede introducir un tipo de
    visual arbitrario (ver invariante J de Fase 3)."""

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


class LayoutHint(str, Enum):
    default = "default"
    left_to_right = "left_to_right"
    top_down = "top_down"
    two_column = "two_column"
    centered = "centered"


class VisualPlan(BaseModel):
    """Especificación DECLARATIVA de una visual para un renderer futuro.

    El LLM NUNCA debe generar HTML, JavaScript, React/JSX, CSS ejecutable,
    SVG ejecutable, scripts ni iframes: `description` es una instrucción de
    PRESENTACIÓN (qué mostrar y cómo organizarlo), no conocimiento
    pedagógico nuevo. Este modelo, al ser un enum cerrado + texto libre de
    descripción (nunca interpretado como markup), hace estructuralmente
    imposible que el LLM entregue código ejecutable como visual.
    """

    visual_type: VisualType
    layout_hint: LayoutHint = LayoutHint.default
    source_refs: list[str] = Field(default_factory=list)
    description: str = ""

    @model_validator(mode="after")
    def _refs_required_unless_none(self) -> "VisualPlan":
        if self.visual_type != VisualType.none and not self.source_refs:
            raise ValueError(
                "VisualPlan.source_refs no puede estar vacío cuando "
                f"visual_type='{self.visual_type.value}' (solo 'none' puede omitirlo)"
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
    """Enum cerrado: el LLM no puede introducir un tipo de escena
    arbitrario."""

    introduction = "introduction"
    explanation = "explanation"
    visual_explanation = "visual_explanation"
    checkpoint = "checkpoint"
    recap = "recap"


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
