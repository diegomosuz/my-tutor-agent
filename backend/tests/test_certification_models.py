"""Tests de validación estructural (Pydantic) de `GeneratedQuestionBody`
(Fase 6, sección 39): tipos válidos, cantidad de opciones, unicidad de
option_id, correct_option_ids válidos y su cantidad según el tipo de
pregunta. La validación de source_refs/derivation_refs contra el
CanonicalTopicContent real vive en `test_certification_bank_generation.py`
(necesita el material real del tópico)."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.certification import GeneratedQuestionBody

from .certification_fixtures import multiple_choice_question_dict, single_choice_question_dict


def test_valid_single_choice_question():
    question = GeneratedQuestionBody.model_validate(single_choice_question_dict())
    assert question.question_type == "single_choice"
    assert question.correct_option_ids == ["A"]


def test_valid_multiple_choice_question():
    question = GeneratedQuestionBody.model_validate(multiple_choice_question_dict())
    assert question.question_type == "multiple_choice"
    assert set(question.correct_option_ids) == {"A", "C"}


def test_single_choice_with_two_correct_ids_rejected():
    data = single_choice_question_dict()
    data["correct_option_ids"] = ["A", "B"]
    with pytest.raises(ValidationError, match="single_choice requiere exactamente 1"):
        GeneratedQuestionBody.model_validate(data)


def test_multiple_choice_with_one_correct_id_rejected():
    data = multiple_choice_question_dict()
    data["correct_option_ids"] = ["A"]
    with pytest.raises(ValidationError, match="multiple_choice requiere al menos 2"):
        GeneratedQuestionBody.model_validate(data)


def test_unknown_correct_option_id_rejected():
    data = single_choice_question_dict()
    data["correct_option_ids"] = ["Z"]
    with pytest.raises(ValidationError, match="option_id inexistentes"):
        GeneratedQuestionBody.model_validate(data)


def test_duplicate_option_ids_rejected():
    data = single_choice_question_dict()
    data["options"][1]["option_id"] = "A"  # duplica el id de la opción 0
    with pytest.raises(ValidationError, match="duplicados"):
        GeneratedQuestionBody.model_validate(data)


def test_less_than_three_options_rejected():
    data = single_choice_question_dict()
    data["options"] = data["options"][:2]
    data["correct_option_ids"] = ["A"]
    with pytest.raises(ValidationError, match="al menos 3 opciones"):
        GeneratedQuestionBody.model_validate(data)


def test_three_options_is_accepted():
    data = single_choice_question_dict()
    data["options"] = data["options"][:3]
    question = GeneratedQuestionBody.model_validate(data)
    assert len(question.options) == 3


def test_invalid_question_type_enum_rejected():
    data = single_choice_question_dict()
    data["question_type"] = "essay"
    with pytest.raises(ValidationError):
        GeneratedQuestionBody.model_validate(data)


def test_invalid_question_style_enum_rejected():
    data = single_choice_question_dict()
    data["question_style"] = "trivia"
    with pytest.raises(ValidationError):
        GeneratedQuestionBody.model_validate(data)


def test_duplicate_correct_option_ids_rejected():
    data = multiple_choice_question_dict()
    data["correct_option_ids"] = ["A", "A"]
    with pytest.raises(ValidationError, match="duplicados"):
        GeneratedQuestionBody.model_validate(data)


def test_empty_explanation_rejected():
    data = single_choice_question_dict()
    data["explanation"] = []
    with pytest.raises(ValidationError, match="explanation no puede estar vacío"):
        GeneratedQuestionBody.model_validate(data)


def test_option_without_derivation_refs_rejected():
    data = single_choice_question_dict()
    data["options"][0]["derivation_refs"] = []
    with pytest.raises(ValidationError, match="derivation_refs no puede estar vacío"):
        GeneratedQuestionBody.model_validate(data)
