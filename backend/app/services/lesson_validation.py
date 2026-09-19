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

from app.models.lesson import GeneratedLessonBody, GroundedText, RelationType, VisualPlan, VisualType
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
    block_type_by_ref = {block.source_ref: block.block_type for block in canonical.source_blocks}
    for scene in body.scenes:
        visual = scene.visual
        if visual.visual_type == VisualType.none:
            continue
        result = validate_source_refs(visual.source_refs, canonical)
        if result.invalid_refs:
            problems.append(
                f"{scene.scene_id}.visual: source_refs inexistentes {result.invalid_refs}."
            )
            continue  # el resto de las validaciones de este visual no son confiables

        problems.extend(_validate_visual_content(scene.scene_id, visual, block_type_by_ref))

    if problems:
        raise LessonValidationError(problems)


# Rango práctico validado (la calidad "ideal" — 3-7 pasos, etc. — la guía
# el prompt; acá solo se evita contenido estructuralmente absurdo, sin
# forzar reintentos por casos legítimos en el borde del rango).
_MIN_PROCESS_STEPS = 2
_MIN_GRAPH_NODES = 2

# v1.2.0 (bloque "Visual Selection Reliability"): tipos de visual donde
# TODAS las edges siendo `flows_to` es una señal inequívoca de que el
# contenido es en realidad una secuencia temporal (debería ser "process"),
# no una composición (hierarchy) ni un mapa conceptual (concept_map) sin
# orden temporal. Regla determinística sobre el PROPIO VisualPlan ya
# generado (nunca interpretación libre del Markdown fuente) — ver PARTE 4
# de la especificación y docs/VISUAL_SELECTION.md.
_HIERARCHY_LIKE_VISUAL_TYPES = (VisualType.hierarchy, VisualType.concept_map)


def _is_purely_sequential(edges: list) -> bool:
    """True únicamente si HAY edges y TODAS (sin excepción) son
    `flows_to`. Una sola edge de otro tipo (`contains`/`part_of`/etc.) ya
    alcanza para no marcarlo como mismatch — evita falsos positivos sobre
    jerarquías legítimas que además declaran una relación de flujo
    puntual. Sin edges, no hay señal suficiente: nunca se marca mismatch
    solo por ausencia de edges (ambigüedad != inconsistencia)."""
    if not edges:
        return False
    return all(edge.relation_type == RelationType.flows_to for edge in edges)


def _validate_visual_content(
    scene_id: str, visual: VisualPlan, block_type_by_ref: dict[str, str]
) -> list[str]:
    """Valida que el contenido estructurado de `visual` (v1.1.0, bloque de
    rendering pedagógico; extendido en v1.2.0 con chequeos de consistencia
    semántica interna) sea coherente con su `visual_type` — determinístico,
    sin LLM. Cada visual_type que requiere contenido estructurado (process,
    comparison, architecture, concept_map, image) debe traerlo poblado; el
    resto de los campos estructurados quedan vacíos/None (no se valida como
    error, simplemente el renderer los ignora)."""
    problems: list[str] = []

    if visual.visual_type == VisualType.process:
        if len(visual.process_steps) < _MIN_PROCESS_STEPS:
            problems.append(
                f"{scene_id}.visual: process requiere al menos {_MIN_PROCESS_STEPS} "
                f"process_steps (recibidos {len(visual.process_steps)})."
            )

    elif visual.visual_type == VisualType.comparison:
        if visual.comparison is None:
            problems.append(f"{scene_id}.visual: comparison requiere el campo 'comparison' poblado.")
        elif not visual.comparison.rows and not visual.comparison.columns:
            # v1.2.0: "comparison" sin ningún lado con contenido real
            # (ni tabla ni columns) — PARTE 5, "debe tener al menos dos
            # lados realmente representables". Nunca se rechaza una
            # LessonPlan ya CACHEADA por esto (esta función solo corre en
            # generación fresca, nunca al leer cache — ver
            # lesson_generator.py::_read_cache).
            problems.append(
                f"{scene_id}.visual: comparison requiere contenido real de al menos un "
                "lado — completá 'rows' (modo tabla) o 'columns' (modo cards con "
                "contenido propio por columna), nunca dejes ambos vacíos."
            )

    elif visual.visual_type in (VisualType.architecture, VisualType.concept_map):
        if len(visual.nodes) < _MIN_GRAPH_NODES:
            problems.append(
                f"{scene_id}.visual: {visual.visual_type.value} requiere al menos "
                f"{_MIN_GRAPH_NODES} nodes (recibidos {len(visual.nodes)})."
            )

    elif visual.visual_type == VisualType.image:
        has_image_block = any(
            block_type_by_ref.get(ref) == "image" for ref in visual.source_refs
        )
        if not has_image_block:
            problems.append(
                f"{scene_id}.visual: image requiere que al menos uno de sus source_refs "
                "apunte a un SourceBlock de tipo 'image' del material autorizado."
            )

    # v1.2.0 — PARTE 4: mismatch semántico interno. "hierarchy"/"concept_map"
    # cuyas edges son EXCLUSIVAMENTE "flows_to" describen, por definición
    # del propio enum RelationType, una secuencia temporal — exactamente
    # lo que "process" existe para representar. Nunca se reescribe
    # automáticamente (eso implicaría reinterpretar contenido en código,
    # algo que este bloque explícitamente evita): se rechaza con un
    # reason_code específico para que el retry de structured output lo
    # corrija con el modelo, nunca con una heurística de texto.
    if visual.visual_type in _HIERARCHY_LIKE_VISUAL_TYPES and _is_purely_sequential(visual.edges):
        problems.append(
            f"{scene_id}.visual: declarado como '{visual.visual_type.value}' pero TODAS sus "
            "edges son 'flows_to' (relación de secuencia temporal), no de composición "
            "jerárquica. [visual_semantic_mismatch_process] Si el contenido citado en "
            "source_refs realmente describe una secuencia ordenada, usá visual_type="
            "'process' con 'process_steps' en su lugar. Si en cambio sí es una "
            "composición real sin orden temporal, cambiá el relation_type de esas "
            "edges a 'contains' o 'part_of' — nunca inventes una relación que la "
            "fuente no sostenga."
        )

    return problems
