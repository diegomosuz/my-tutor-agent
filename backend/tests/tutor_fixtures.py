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


# v1.3.0 (BLOQUE 6 gap-closure): `relevance_reasoning` es un campo extra
# ignorado por `TutorReplyBody` (modo estricto, sin `extra="forbid"`
# configurado en ningún modelo del tutor) pero EXIGIDO por
# `ExpandedTutorReplyBody` (modo ampliado, ver app/models/tutor.py) -- se
# incluye en todos los fixtures para que sirvan sin cambios en ambos
# modos, sin necesitar variantes duplicadas por modo.
_RELEVANCE_REASONING = "Pertenece al tema del tópico actual (categoría a)."


def valid_answer_reply_dict(refs: list[str] | None = None) -> dict:
    return {
        "relevance_reasoning": _RELEVANCE_REASONING,
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
        "relevance_reasoning": _RELEVANCE_REASONING,
        "response_type": "not_covered",
        "answer_chunks": [],
        "clarification_question": None,
    }


def valid_clarification_reply_dict() -> dict:
    return {
        "relevance_reasoning": _RELEVANCE_REASONING,
        "response_type": "clarification",
        "answer_chunks": [],
        "clarification_question": "¿A cuál de los conceptos de esta escena te referís?",
    }


# --------------------------------------------------------------------------
# v1.3.0 (bloque "Classroom UX" -- Tutor Expanded Mode)
# --------------------------------------------------------------------------


def valid_unrelated_reply_dict() -> dict:
    return {
        "relevance_reasoning": "Claramente ajena al dominio educativo del curso.",
        "response_type": "unrelated",
        "answer_chunks": [],
        "clarification_question": None,
        "general_knowledge_used": False,
    }


def valid_general_related_reply_dict() -> dict:
    """Pregunta relacionada con el tema, pero NO cubierta por la fuente:
    toda la respuesta viene de conocimiento general (general_knowledge_chunks,
    sin ningún answer_chunk grounded)."""
    return {
        "relevance_reasoning": _RELEVANCE_REASONING,
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
    general_knowledge_chunk (texto plano, sin source_refs)."""
    return {
        "relevance_reasoning": _RELEVANCE_REASONING,
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
