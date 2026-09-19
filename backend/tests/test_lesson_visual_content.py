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


# --------------------------------------------------------------------------
# v1.2.0 (bloque "Visual Selection Reliability") — PARTE 14.A-F: mismatch
# semántico interno (hierarchy/concept_map con edges 100% "flows_to") y
# aceptación de los visual_type "hierarchy-like"/process/architecture/
# comparison cuando su contenido estructurado SÍ es internamente coherente.
# Todas las fixtures son genéricas (sin nombres de curso/módulo reales, ver
# PARTE 13): "Paso 1/2", "Categoría/Subcategoría", "API/Base de datos",
# "Concepto A/B", "Antes/Después".
# --------------------------------------------------------------------------


def test_A_hierarchy_with_all_flows_to_edges_is_rejected_as_semantic_mismatch():
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "hierarchy",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "paso-1", "label": "Paso 1"},
            {"id": "paso-2", "label": "Paso 2"},
        ],
        "edges": [{"from_id": "paso-1", "to_id": "paso-2", "relation_type": "flows_to"}],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    with pytest.raises(LessonValidationError, match=r"\[visual_semantic_mismatch_process\]"):
        validate_lesson_body(body, CANONICAL)


def test_A2_concept_map_with_all_flows_to_edges_is_also_rejected():
    # concept_map comparte la misma señal inequívoca que hierarchy (ver
    # _HIERARCHY_LIKE_VISUAL_TYPES en lesson_validation.py).
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "concept_map",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "concepto-a", "label": "Concepto A"},
            {"id": "concepto-b", "label": "Concepto B"},
        ],
        "edges": [{"from_id": "concepto-a", "to_id": "concepto-b", "relation_type": "flows_to"}],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    with pytest.raises(LessonValidationError, match=r"\[visual_semantic_mismatch_process\]"):
        validate_lesson_body(body, CANONICAL)


def test_hierarchy_with_one_non_flows_to_edge_among_several_is_not_rejected():
    # Evita falsos positivos: una sola edge que NO es "flows_to" ya alcanza
    # para no marcar mismatch, aunque el resto sí lo sean (ver docstring de
    # _is_purely_sequential — "ambigüedad != inconsistencia").
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "hierarchy",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "raiz", "label": "Categoría"},
            {"id": "hijo-1", "label": "Subcategoría 1"},
            {"id": "hijo-2", "label": "Subcategoría 2"},
        ],
        "edges": [
            {"from_id": "raiz", "to_id": "hijo-1", "relation_type": "contains"},
            {"from_id": "hijo-1", "to_id": "hijo-2", "relation_type": "flows_to"},
        ],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


def test_B_valid_process_visual_is_accepted():
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "process",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "process_steps": [{"label": "Paso 1"}, {"label": "Paso 2"}],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


def test_C_valid_parent_child_hierarchy_is_accepted():
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "hierarchy",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "raiz", "label": "Categoría"},
            {"id": "hijo-1", "label": "Subcategoría 1"},
        ],
        "edges": [{"from_id": "raiz", "to_id": "hijo-1", "relation_type": "contains"}],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


def test_D_valid_architecture_is_accepted():
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "architecture",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "api", "label": "API"},
            {"id": "db", "label": "Base de datos"},
        ],
        "edges": [{"from_id": "api", "to_id": "db", "relation_type": "connects_to"}],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


def test_E_valid_concept_map_is_accepted():
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "concept_map",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "concepto-a", "label": "Concepto A"},
            {"id": "concepto-b", "label": "Concepto B"},
        ],
        "edges": [{"from_id": "concepto-a", "to_id": "concepto-b", "relation_type": "relates_to"}],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


def test_F_valid_comparison_is_accepted():
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "comparison",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "comparison": {
            "column_labels": ["Antes", "Después"],
            "columns": [
                {"title": "Antes", "points": ["Proceso manual"]},
                {"title": "Después", "points": ["Proceso automatizado"]},
            ],
        },
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


# --------------------------------------------------------------------------
# v1.2.0.1 (mismo bloque "Visual Selection Reliability", corrección post-QA
# real): "hierarchy" con edges declaradas pero NINGUNA "contains"/"part_of"
# es una contradicción interna -- las entidades son pares/hermanas
# (comparadas por atributos, p.ej. "depends_on" usado como sustituto de un
# contraste ordinal), no una composición real. Fixtures genéricas, sin
# nombres de modelos/curso reales (PARTE 13 de la especificación original
# sigue aplicando).
# --------------------------------------------------------------------------


def test_A_hierarchy_with_only_non_containment_edges_is_rejected():
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "hierarchy",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "nivel-1", "label": "Nivel 1"},
            {"id": "nivel-2", "label": "Nivel 2"},
            {"id": "nivel-3", "label": "Nivel 3"},
        ],
        "edges": [
            {"from_id": "nivel-1", "to_id": "nivel-2", "relation_type": "depends_on"},
            {"from_id": "nivel-2", "to_id": "nivel-3", "relation_type": "depends_on"},
        ],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    with pytest.raises(
        LessonValidationError, match=r"\[visual_semantic_mismatch_hierarchy_relation\]"
    ):
        validate_lesson_body(body, CANONICAL)


def test_hierarchy_with_one_containment_edge_among_others_is_not_rejected():
    # Una sola edge "contains"/"part_of" ya alcanza -- evita falsos
    # positivos, mismo criterio que _is_purely_sequential.
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "hierarchy",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "raiz", "label": "Categoría"},
            {"id": "hijo-1", "label": "Subcategoría 1"},
            {"id": "hijo-2", "label": "Subcategoría 2"},
        ],
        "edges": [
            {"from_id": "raiz", "to_id": "hijo-1", "relation_type": "contains"},
            {"from_id": "hijo-1", "to_id": "hijo-2", "relation_type": "relates_to"},
        ],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


def test_hierarchy_without_any_edges_is_still_accepted():
    # Ambigüedad (sin edges) nunca es tratada como inconsistencia -- ver
    # docstring de _lacks_containment_edges. Jerarquía plana legítima.
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "hierarchy",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "nivel-1", "label": "Nivel 1"},
            {"id": "nivel-2", "label": "Nivel 2"},
            {"id": "nivel-3", "label": "Nivel 3"},
        ],
        "edges": [],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


def test_concept_map_with_non_containment_edges_is_not_affected():
    # La nueva validación es EXCLUSIVA de "hierarchy" -- concept_map no
    # tiene el mismo contrato de "solo contains/part_of" (sus edges son
    # relaciones conceptuales generales, relates_to es legítimo ahí).
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "concept_map",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "concepto-a", "label": "Concepto A"},
            {"id": "concepto-b", "label": "Concepto B"},
        ],
        "edges": [{"from_id": "concepto-a", "to_id": "concepto-b", "relation_type": "depends_on"}],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar


def test_C_valid_parent_child_hierarchy_with_containment_edges_still_accepted():
    # Regresión: la jerarquía padre/hijo genuina (ya cubierta por
    # test_C_valid_parent_child_hierarchy_is_accepted más arriba) sigue
    # aceptándose sin cambios tras esta corrección.
    body_dict = valid_lesson_body_dict()
    body_dict["scenes"][0]["visual"] = {
        "visual_type": "hierarchy",
        "layout_hint": "default",
        "source_refs": ["SRC-002"],
        "description": "",
        "nodes": [
            {"id": "raiz", "label": "Categoría"},
            {"id": "hijo-1", "label": "Subcategoría 1"},
            {"id": "hijo-2", "label": "Subcategoría 2"},
        ],
        "edges": [
            {"from_id": "raiz", "to_id": "hijo-1", "relation_type": "contains"},
            {"from_id": "raiz", "to_id": "hijo-2", "relation_type": "part_of"},
        ],
    }
    body = GeneratedLessonBody.model_validate(body_dict)
    validate_lesson_body(body, CANONICAL)  # no debe lanzar
