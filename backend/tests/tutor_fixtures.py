"""Fixtures compartidas para tests de Fase 5 (Tutor / Checkpoint)."""
from __future__ import annotations

import copy

from .lesson_fixtures import valid_lesson_body_dict


def lesson_body_with_reflection_scene() -> dict:
    """Variante de `valid_lesson_body_dict()` con una interacción
    `reflection` en SCENE-001 (que por defecto no tiene interacción), para
    probar que /checkpoint la rechaza (sección 25 de Fase 5: reflection se
    conversa por /tutor, nunca se evalúa como checkpoint)."""
    body = copy.deepcopy(valid_lesson_body_dict())
    body["scenes"][0]["interaction"] = {
        "interaction_type": "reflection",
        "question": {"text": "¿Qué te llamó la atención de este tema?", "source_refs": ["SRC-001"]},
        "expected_answer": None,
    }
    return body


# v1.3.0 (BLOQUE 6, segundo gap-closure) / v1.4.0 (Bloque 2):
# `scope_relation`/`topic_coverage`/`course_coverage` son campos SIEMPRE
# requeridos por `StructuredTutorReplyBody` (el único `response_model`
# interno desde v1.4.0 Bloque 2, ver app/models/tutor.py) -- se incluyen en
# TODOS los fixtures con valores consistentes con la forma real de cada
# respuesta. `course_coverage` default "insufficient" en los fixtures que
# no ejercitan evidencia de otros tópicos del curso (ver más abajo los que
# sí lo hacen).


def valid_answer_reply_dict(refs: list[str] | None = None) -> dict:
    return {
        "scope_relation": "current_topic",
        "topic_coverage": "sufficient",
        "course_coverage": "insufficient",
        "response_type": "answer",
        "answer_chunks": [
            {
                "text": "Kubernetes es un orquestador de contenedores.",
                "source_refs": refs or ["SRC-002"],
            }
        ],
        "clarification_question": None,
    }


def valid_not_covered_reply_dict() -> dict:
    return {
        # v1.3.0 (segundo gap-closure): en modo ampliado, "not_covered" ya
        # es estructuralmente inválido salvo que scope_relation="unrelated"
        # también sea ilegal para ese response_type (ver tutor_service._validate,
        # que rechaza "not_covered" incondicionalmente en modo ampliado) --
        # estos valores solo importan para el uso en modo estricto (que los
        # acepta tal cual) y para simular, en modo ampliado, un intento
        # inválido del modelo que debe rechazarse y reintentarse (tests L/M
        # de test_tutor_service.py).
        "scope_relation": "current_topic",
        "topic_coverage": "insufficient",
        "course_coverage": "insufficient",
        "response_type": "not_covered",
        "answer_chunks": [],
        "clarification_question": None,
    }


def valid_clarification_reply_dict() -> dict:
    return {
        # scope_relation/topic_coverage/course_coverage no se cruzan contra
        # "clarification" (ver _validate_course_grounded_shape) -- cualquier
        # valor cerrado válido sirve acá.
        "scope_relation": "current_topic",
        "topic_coverage": "insufficient",
        "course_coverage": "insufficient",
        "response_type": "clarification",
        "answer_chunks": [],
        "clarification_question": "¿A cuál de los conceptos de esta escena te referís?",
    }


# --------------------------------------------------------------------------
# v1.3.0 (bloque "Classroom UX" -- Tutor Expanded Mode)
# --------------------------------------------------------------------------


def valid_unrelated_reply_dict() -> dict:
    return {
        "scope_relation": "unrelated",
        "topic_coverage": "insufficient",  # no se valida cuando scope_relation=unrelated
        "course_coverage": "insufficient",
        "response_type": "unrelated",
        "answer_chunks": [],
        "clarification_question": None,
        "general_knowledge_used": False,
    }


def valid_general_related_reply_dict(scope_relation: str = "current_topic") -> dict:
    """Pregunta relacionada con el tema/dominio, pero NO cubierta por
    ninguna fuente curricular (ni el tópico actual ni el resto del curso):
    toda la respuesta viene de conocimiento general (general_knowledge_chunks,
    sin ningún answer_chunk/course_answer_chunk grounded) --
    topic_coverage="insufficient" y course_coverage="insufficient" (ambos
    chunks grounded deben quedar vacíos, ver _validate_course_grounded_shape).
    `scope_relation` es parametrizable: "current_topic" (default) o
    "course_domain" (pregunta de otro tópico/módulo del mismo curso -- ver
    CourseScope)."""
    return {
        "scope_relation": scope_relation,
        "topic_coverage": "insufficient",
        "course_coverage": "insufficient",
        "response_type": "answer",
        "answer_chunks": [],
        "general_knowledge_chunks": [
            "En general, este tipo de comparación suele evaluarse por velocidad y costo."
        ],
        "clarification_question": None,
        "general_knowledge_used": True,
    }


def valid_topic_plus_general_reply_dict(refs: list[str] | None = None) -> dict:
    """Pregunta relacionada, con cobertura PARCIAL de la fuente: mezcla un
    answer_chunk grounded (con source_refs reales) y un
    general_knowledge_chunk (texto plano, sin source_refs) --
    topic_coverage="partial", course_coverage="insufficient"."""
    return {
        "scope_relation": "current_topic",
        "topic_coverage": "partial",
        "course_coverage": "insufficient",
        "response_type": "answer",
        "answer_chunks": [
            {
                "text": "Kubernetes es un orquestador de contenedores.",
                "source_refs": refs or ["SRC-002"],
            },
        ],
        "general_knowledge_chunks": [
            "Como referencia general, suele compararse con otras plataformas similares."
        ],
        "clarification_question": None,
        "general_knowledge_used": True,
    }


# --------------------------------------------------------------------------
# v1.4.0 (Bloque 2 -- "COURSE-GROUNDED TUTOR + CROSS-TOPIC PROVENANCE")
# --------------------------------------------------------------------------


def valid_course_answer_reply_dict(course_refs: list[str] | None = None) -> dict:
    """Pregunta NO cubierta por el tópico actual, pero SÍ por evidencia
    real de otro tópico del mismo curso (COURSE EVIDENCE): la respuesta
    vive enteramente en course_answer_chunks, citando COURSE-SRC-XXX --
    topic_coverage="insufficient", course_coverage="sufficient". Válida
    en CUALQUIER modo (nunca depende de allow_general_knowledge, ver
    tutor_service.py)."""
    return {
        "scope_relation": "course_domain",
        "topic_coverage": "insufficient",
        "course_coverage": "sufficient",
        "response_type": "answer",
        "answer_chunks": [],
        "course_answer_chunks": [
            {
                "text": "Las skills son capacidades reutilizables del ecosistema de agentes.",
                "source_refs": course_refs or ["COURSE-SRC-001"],
            }
        ],
        "clarification_question": None,
    }


def valid_topic_plus_course_reply_dict(
    topic_refs: list[str] | None = None, course_refs: list[str] | None = None
) -> dict:
    """Pregunta con cobertura PARCIAL del tópico actual, completada con
    evidencia de otro tópico del curso -- topic_coverage="partial",
    course_coverage="sufficient". Mezcla answer_chunks (SRC-XXX) y
    course_answer_chunks (COURSE-SRC-XXX), namespaces nunca cruzados."""
    return {
        "scope_relation": "current_topic",
        "topic_coverage": "partial",
        "course_coverage": "sufficient",
        "response_type": "answer",
        "answer_chunks": [
            {
                "text": "Kubernetes es un orquestador de contenedores.",
                "source_refs": topic_refs or ["SRC-002"],
            }
        ],
        "course_answer_chunks": [
            {
                "text": "Otro tópico del curso agrega contexto adicional sobre el ecosistema.",
                "source_refs": course_refs or ["COURSE-SRC-001"],
            }
        ],
        "clarification_question": None,
    }


def valid_checkpoint_evaluation_dict(
    verdict: str = "correct", refs: list[str] | None = None
) -> dict:
    return {
        "verdict": verdict,
        "feedback": [
            {
                "text": "Tu respuesta menciona correctamente que Kubernetes orquesta contenedores.",
                "source_refs": refs or ["SRC-002"],
            }
        ],
        "ideal_answer": {
            "text": "Kubernetes es un orquestador de contenedores.",
            "source_refs": refs or ["SRC-002"],
        },
    }
