"""Fixtures compartidas para tests de Fase 6 (práctica de certificación
grounded). Reutiliza el mismo Markdown de ejemplo que `lesson_fixtures.py`
(SRC-001..SRC-004) para no duplicar contenido de prueba."""
from __future__ import annotations

import copy

from app.models.certification import GeneratedQuestionBankBody
from app.services.canonical import build_canonical_topic
from app.models.schemas import TopicMetadata

from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN


def build_sample_canonical(markdown: str = SAMPLE_TOPIC_MARKDOWN):
    return build_canonical_topic(
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        metadata=TopicMetadata(title="Introducción a Kubernetes", order=1, description=""),
        raw_markdown=markdown,
    )


def _single_choice_question() -> dict:
    return {
        "question_type": "single_choice",
        "question_style": "conceptual",
        "stem": {"text": "¿Qué es Kubernetes según el material?", "source_refs": ["SRC-002"]},
        "options": [
            {
                "option_id": "A",
                "text": "Un orquestador de contenedores.",
                "derivation_refs": ["SRC-002"],
            },
            {"option_id": "B", "text": "Un sistema operativo.", "derivation_refs": ["SRC-001"]},
            {"option_id": "C", "text": "Una base de datos.", "derivation_refs": ["SRC-001"]},
            {
                "option_id": "D",
                "text": "Un lenguaje de programación.",
                "derivation_refs": ["SRC-001"],
            },
        ],
        "correct_option_ids": ["A"],
        "explanation": [
            {
                "text": "El material define a Kubernetes como un orquestador de contenedores.",
                "source_refs": ["SRC-002"],
            }
        ],
        "competency": {"text": "Identificar qué es Kubernetes", "source_refs": ["SRC-002"]},
    }


def _multiple_choice_question() -> dict:
    return {
        "question_type": "multiple_choice",
        "question_style": "relationship",
        "stem": {
            "text": "¿Cuáles de los siguientes son componentes mencionados en el material?",
            "source_refs": ["SRC-004"],
        },
        "options": [
            {"option_id": "A", "text": "Pod", "derivation_refs": ["SRC-004"]},
            {"option_id": "B", "text": "Kubernetes", "derivation_refs": ["SRC-002"]},
            {"option_id": "C", "text": "Unidad mínima de despliegue", "derivation_refs": ["SRC-004"]},
            {"option_id": "D", "text": "Nodo maestro", "derivation_refs": ["SRC-004"]},
        ],
        "correct_option_ids": ["A", "C"],
        "explanation": [
            {
                "text": "El Pod es descripto como la unidad mínima de despliegue.",
                "source_refs": ["SRC-004"],
            }
        ],
        "competency": {"text": "Distinguir componentes de Kubernetes", "source_refs": ["SRC-004"]},
    }


def valid_question_bank_body_dict() -> dict:
    return {"questions": [_single_choice_question(), _multiple_choice_question()]}


def valid_question_bank_body() -> GeneratedQuestionBankBody:
    return GeneratedQuestionBankBody.model_validate(valid_question_bank_body_dict())


def single_choice_question_dict() -> dict:
    return copy.deepcopy(_single_choice_question())


def multiple_choice_question_dict() -> dict:
    return copy.deepcopy(_multiple_choice_question())
