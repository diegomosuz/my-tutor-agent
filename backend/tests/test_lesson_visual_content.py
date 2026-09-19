"""Tests del contenido visual estructurado agregado en v1.1.0 (bloque de
rendering pedagógico): process_steps, comparison, nodes/edges (architecture/
concept_map), e image (visual_type que cita un SourceBlock de imagen).

Dos niveles:
- Pydantic puro (`VisualPlan`/`ComparisonPlan`/etc.): estructuralmente
  imposible construir una arista hacia un nodo inexistente o una fila de
  comparison con una cantidad de valores distinta a las columnas — se
  verifica sin tocar el pipeline de generación.
- `lesson_validation.validate_lesson_body` (determinístico, sin LLM): un
  visual_type que requiere contenido estructurado (process/comparison/
  architecture/concept_map/image) pero no lo trae poblado se rechaza.

Ningún test hace llamadas de red."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.lesson import (
    ComparisonColumn,
    ComparisonPlan,
    ComparisonRow,
    GeneratedLessonBody,
    GraphEdge,
    GraphNode,
    GroundedText,
    LayoutHint,
    ProcessStep,
    VisualPlan,
    VisualType,
)
from app.services.lesson_validation import LessonValidationError, validate_lesson_body

from .lesson_fixtures import build_sample_canonical, valid_lesson_body_dict

CANONICAL = build_sample_canonical()  # SRC-001..SRC-004, ninguno de tipo "image"

IMAGE_TOPIC_MARKDOWN = (
    "# Arquitectura de referencia\n"
    "\n"
    "![Diagrama de arquitectura](images/architecture.png)\n"
    "\n"
    "Este diagrama muestra los componentes principales del sistema.\n"
)


def _image_canonical():
    return build_sample_canonical(IMAGE_TOPIC_MARKDOWN)


# --------------------------------------------------------------------------
# D/E. architecture: edges deben referenciar nodes declarados (Pydantic)
# --------------------------------------------------------------------------


def test_D_architecture_edges_referencing_declared_nodes_is_valid():
    visual = VisualPlan(
        visual_type=VisualType.architecture,
        layout_hint=LayoutHint.default,
        source_refs=["SRC-001"],
        nodes=[
            GraphNode(id="api", label="API Gateway"),
            GraphNode(id="db", label="Base de datos"),
        ],
        edges=[GraphEdge(from_id="api", to_id="db", relation_type="connects_to")],
    )
    assert len(visual.edges) == 1


def test_E_edge_to_nonexistent_node_is_rejected():
    with pytest.raises(ValidationError, match="node id"):
        VisualPlan(
            visual_type=VisualType.architecture,
            source_refs=["SRC-001"],
            nodes=[GraphNode(id="api", label="API Gateway")],
            edges=[GraphEdge(from_id="api", to_id="nunca-declarado", relation_type="connects_to")],
        )


def test_edge_with_unknown_relation_type_is_rejected():
    with pytest.raises(ValidationError):
        GraphEdge(from_id="a", to_id="b", relation_type="invented_relation")


# --------------------------------------------------------------------------
# Comparison: filas deben tener la misma cantidad de valores que columnas
# --------------------------------------------------------------------------


def test_comparison_rows_matching_columns_is_valid():
    plan = ComparisonPlan(
        column_labels=["Sistema tradicional", "Sistema con IA"],
        rows=[
            ComparisonRow(label="Entradas", values=["Reglas fijas", "Datos de entrenamiento"]),
            ComparisonRow(label="Resultado", values=["Determinístico", "Probabilístico"]),
        ],
    )
    assert len(plan.rows) == 2


def test_comparison_row_with_wrong_value_count_is_rejected():
    with pytest.raises(ValidationError, match="valores"):
        ComparisonPlan(
            column_labels=["A", "B"],
            rows=[ComparisonRow(label="Fila", values=["solo-uno"])],
        )


def test_comparison_cards_mode_allows_empty_rows():
    plan = ComparisonPlan(column_labels=["Concepto A", "Concepto B"])
    assert plan.rows == []


def test_comparison_requires_two_to_four_columns():
    with pytest.raises(ValidationError):
        ComparisonPlan(column_labels=["Solo uno"])
    with pytest.raises(ValidationError):
        ComparisonPlan(column_labels=["A", "B", "C", "D", "E"])


# --------------------------------------------------------------------------
# v1.2.0 — ComparisonColumn: contenido column-specific en modo "cards"
# (PARTE 21.A-E de la especificación de "Visual Fidelity").
# --------------------------------------------------------------------------


def test_A_comparison_column_specific_content_is_valid():
    plan = ComparisonPlan(
        column_labels=["Punto de entrada incorrecto", "Punto de entrada correcto"],
        columns=[
            ComparisonColumn(
                title="Punto de entrada incorrecto",
                points=["Configuración repetida cada semana", "12 min cargando contexto"],
            ),
            ComparisonColumn(
                title="Punto de entrada correcto",
                points=["Se configura una sola vez", "El contexto ya está disponible"],
            ),
        ],
    )
    assert plan.columns[0].points != plan.columns[1].points
    assert len(plan.columns) == 2


def test_B_comparison_column_count_mismatch_is_rejected():
    with pytest.raises(ValidationError, match="columna"):
        ComparisonPlan(
            column_labels=["A", "B", "C"],
            columns=[ComparisonColumn(title="A", points=["x"]), ComparisonColumn(title="B", points=["y"])],
        )


def test_C_comparison_column_title_required_two_to_four_via_column_labels():
    # `columns` en sí no acota cantidad más allá de coincidir con
    # column_labels (2-4, ya acotado ahí) — un `columns` con más de 4
    # entradas es estructuralmente imposible sin que column_labels
    # también tenga esa cantidad, lo cual ya está prohibido.
    with pytest.raises(ValidationError):
        ComparisonPlan(
            column_labels=["A", "B", "C", "D", "E"],
            columns=[ComparisonColumn(title=c, points=[]) for c in "ABCDE"],
        )


def test_D_comparison_column_points_bounded_and_not_blank():
    with pytest.raises(ValidationError):
        ComparisonColumn(title="A", points=[""])
    with pytest.raises(ValidationError):
        ComparisonColumn(title="A", points=["x" * 161])
    with pytest.raises(ValidationError):
        ComparisonColumn(title="A", points=["ok"] * 7)  # max_length=6


def test_E_legacy_comparison_without_columns_still_parses():
    # LessonPlans cacheadas de lesson-v3 (antes de v1.2.0) nunca tenían
    # `columns` — deben seguir parseando exactamente igual.
    plan = ComparisonPlan.model_validate({"column_labels": ["Concepto A", "Concepto B"]})
    assert plan.columns == []
    assert plan.rows == []


# --------------------------------------------------------------------------
# F. process: cantidad de pasos fuera de rango se rechaza (Pydantic acota
#    el máximo; validate_lesson_body exige el mínimo práctico).
# --------------------------------------------------------------------------


def test_process_visual_with_too_many_steps_is_rejected_by_pydantic():
    with pytest.raises(ValidationError):
        VisualPlan(
            visual_type=VisualType.process,
            source_refs=["SRC-001"],
            process_steps=[ProcessStep(label=f"Paso {i}") for i in range(9)],
        )


def test_F_process_visual_with_too_few_steps_is_rejected_by_lesson_validation():

    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "process",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "process_steps": [{"label": "Único paso"}],
    }

    body = GeneratedLessonBody.model_validate(body_dict)
    with pytest.raises(LessonValidationError, match="process_steps"):
        validate_lesson_body(body, CANONICAL)


def test_comparison_visual_without_comparison_content_is_rejected():


    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "comparison",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    with pytest.raises(LessonValidationError, match="comparison"):
        validate_lesson_body(body, CANONICAL)


def test_architecture_visual_without_enough_nodes_is_rejected():


    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "architecture",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [{"id": "solo-uno", "label": "Único nodo"}],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    with pytest.raises(LessonValidationError, match="architecture"):
        validate_lesson_body(body, CANONICAL)


# --------------------------------------------------------------------------
# G/H. image: solo permite citar un SourceBlock real de tipo "image" —
#      no existe ningún campo de URL, así que una imagen "inventada" es
#      estructuralmente imposible; acá se confirma que citar un ref que NO
#      es una imagen real (p.ej. un párrafo) también se rechaza.
# --------------------------------------------------------------------------


def _minimal_body_with_image_visual(ref: str) -> GeneratedLessonBody:
    """Cuerpo de UNA sola escena, todas las refs apuntando a `ref` — evita
    arrastrar las refs SRC-003/SRC-004 del fixture de 2 escenas (que no
    existen en el canonical chico de `_image_canonical()`)."""
    return GeneratedLessonBody.model_validate(
        {
            "lesson_title": {"text": "Arquitectura de referencia", "source_refs": [ref]},
            "learning_objectives": [{"text": "Entender el diagrama.", "source_refs": [ref]}],
            "scenes": [
                {
                    "scene_id": "SCENE-001",
                    "scene_type": "architecture",
                    "title": {"text": "Diagrama", "source_refs": [ref]},
                    "key_points": [{"text": "Componentes principales.", "source_refs": [ref]}],
                    "narration": [{"text": "Así se ve la arquitectura.", "source_refs": [ref]}],
                    "visual": {
                        "visual_type": "image",
                        "layout_hint": "default",
                        "source_refs": [ref],
                        "description": "",
                    },
                    "interaction": None,
                }
            ],
            "recap": [{"text": "Recapitulación.", "source_refs": [ref]}],
        }
    )


def test_G_image_visual_citing_real_image_block_is_accepted():
    canonical = _image_canonical()
    image_ref = next(b.source_ref for b in canonical.source_blocks if b.block_type == "image")
    body = _minimal_body_with_image_visual(image_ref)

    validate_lesson_body(body, canonical)  # no debe lanzar


def test_H_image_visual_citing_a_non_image_block_is_rejected():
    canonical = _image_canonical()
    # El heading NO es una imagen.
    non_image_ref = next(b.source_ref for b in canonical.source_blocks if b.block_type != "image")
    body = _minimal_body_with_image_visual(non_image_ref)

    with pytest.raises(LessonValidationError, match="image"):
        validate_lesson_body(body, canonical)


# --------------------------------------------------------------------------
# J. scene source refs siguen siendo obligatorias donde corresponde
#    (regresión: la validación general de GroundedText no se rompió con
#    los campos nuevos).
# --------------------------------------------------------------------------


def test_J_scene_title_without_source_refs_is_still_rejected():
    with pytest.raises(ValidationError):
        from app.models.lesson import GroundedText

        GroundedText(text="Sin refs", source_refs=[])
