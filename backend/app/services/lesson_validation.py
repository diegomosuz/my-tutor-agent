"""Validación de grounding e invariantes estructurales de un
`GeneratedLessonBody`, previo a ensamblar el `LessonPlan` final (Fase 3).

Complementa (no reemplaza) la validación Pydantic: Pydantic garantiza la
FORMA del contrato (tipos, enums cerrados, campos no vacíos); este módulo
garantiza que el CONTENIDO sea trazable al material autorizado del tópico
(todas las `source_refs` existen en el `CanonicalTopicContent`) y que las
invariantes de secuencia de escenas se cumplan.

Límite importante de esta garantía (ver CLAUDE.md / docs/ARCHITECTURE.md):

    Source reference validation guarantees structural traceability to
    authorized source blocks. It does not by itself prove semantic
    entailment of every generated statement.

Es decir: confirmamos que cada `source_ref` citado existe realmente en el
material, pero no verificamos matemáticamente que el texto generado se
infiera correctamente de ese bloque. Esa verificación semántica no está
implementada (y no se pretende estarlo con reglas deterministas).
"""
from __future__ import annotations

from collections.abc import Iterator

from app.models.lesson import GeneratedLessonBody, GroundedText, VisualType
from app.models.schemas import CanonicalTopicContent
from app.services.canonical import validate_source_refs


class LessonValidationError(Exception):
    """Se lanza cuando un `GeneratedLessonBody` no pasa la validación de
    grounding o alguna invariante estructural de Fase 3. `problems` es una
    lista de descripciones cortas, pensada para reenviarse al LLM como
    mensaje de corrección (ver app/prompts/lesson.py)."""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("; ".join(problems))


def _iter_grounded_texts(body: GeneratedLessonBody) -> Iterator[tuple[str, GroundedText]]:
    """Recorre TODAS las instancias de GroundedText del cuerpo generado,
    con una etiqueta legible de dónde aparece cada una (para mensajes de
    error / corrección claros)."""
    yield "lesson_title", body.lesson_title
    for i, objective in enumerate(body.learning_objectives):
        yield f"learning_objectives[{i}]", objective
    for scene in body.scenes:
        yield f"{scene.scene_id}.title", scene.title
        for i, kp in enumerate(scene.key_points):
            yield f"{scene.scene_id}.key_points[{i}]", kp
        for i, n in enumerate(scene.narration):
            yield f"{scene.scene_id}.narration[{i}]", n
        if scene.interaction is not None:
            yield f"{scene.scene_id}.interaction.question", scene.interaction.question
            if scene.interaction.expected_answer is not None:
                yield (
                    f"{scene.scene_id}.interaction.expected_answer",
                    scene.interaction.expected_answer,
                )
    for i, r in enumerate(body.recap):
        yield f"recap[{i}]", r


def validate_lesson_body(
    body: GeneratedLessonBody, canonical: CanonicalTopicContent
) -> None:
    """Valida `body` contra `canonical`. Lanza `LessonValidationError` con
    la lista completa de problemas encontrados (no aborta en el primer
    error, para que un eventual mensaje de corrección al LLM sea completo).
    """
    problems: list[str] = []

    # Invariante A: al menos una escena. Pydantic ya lo exige a nivel de
    # schema (GeneratedLessonBody.scenes no puede ser []); se revalida acá
    # por robustez ante cambios futuros del modelo.
    if not body.scenes:
        problems.append("La lección no contiene ninguna escena (scenes vacío).")

    # Invariantes B/C: scene_id únicos y estrictamente secuenciales
    # SCENE-001, SCENE-002, ... en el orden real de la lista.
    scene_ids = [scene.scene_id for scene in body.scenes]
    if len(scene_ids) != len(set(scene_ids)):
        problems.append(f"scene_id duplicados: {scene_ids}")
    expected_ids = [f"SCENE-{i:03d}" for i in range(1, len(scene_ids) + 1)]
    if scene_ids != expected_ids:
        problems.append(
            "scene_id debe ser secuencial y empezar en SCENE-001 "
            f"(se recibió {scene_ids}, se esperaba {expected_ids})."
        )

    # Invariantes D/E: todo GroundedText tiene al menos una source_ref
    # (Pydantic ya lo exige) y toda source_ref existe realmente en el
    # material autorizado del tópico (validate_source_refs, Fase 2).
    for label, grounded_text in _iter_grounded_texts(body):
        if not grounded_text.source_refs:
            problems.append(f"{label}: source_refs vacío.")
            continue
        result = validate_source_refs(grounded_text.source_refs, canonical)
        if result.invalid_refs:
            problems.append(f"{label}: source_refs inexistentes {result.invalid_refs}.")

    # VisualPlan.source_refs también deben existir realmente (cuando
    # visual_type != "none"; Pydantic ya exige que no estén vacíos en ese
    # caso, ver VisualPlan._refs_required_unless_none).
    for scene in body.scenes:
        visual = scene.visual
        if visual.visual_type == VisualType.none:
            continue
        result = validate_source_refs(visual.source_refs, canonical)
        if result.invalid_refs:
            problems.append(
                f"{scene.scene_id}.visual: source_refs inexistentes {result.invalid_refs}."
            )

    if problems:
        raise LessonValidationError(problems)
