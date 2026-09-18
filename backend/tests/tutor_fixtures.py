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


def valid_answer_reply_dict(refs: list[str] | None = None) -> dict:
    return {
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
    return {"response_type": "not_covered", "answer_chunks": [], "clarification_question": None}


def valid_clarification_reply_dict() -> dict:
    return {
        "response_type": "clarification",
        "answer_chunks": [],
        "clarification_question": "¿A cuál de los conceptos de esta escena te referís?",
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
