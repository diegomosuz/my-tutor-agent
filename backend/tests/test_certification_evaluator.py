"""Tests del evaluador determinístico de certificación (Fase 6, sección
57): single/multiple choice, agregados de simulación, by_topic,
by_competency y tópicos a reforzar. NINGÚN test de este archivo usa LLM —
`certification_evaluator.py` es una comparación de conjuntos pura."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.config import Settings
from app.models.certification import AnswerSubmission, QuestionType, QuestionVerdict
from app.services import certification_service
from app.services.certification_evaluator import evaluate_answer

from .certification_fixtures import valid_question_bank_body_dict
from .fakes import FakeLLMProvider
from .lesson_fixtures import SAMPLE_TOPIC_MARKDOWN


# --------------------------------------------------------------------------
# evaluate_answer(): pura, sin filesystem ni LLM
# --------------------------------------------------------------------------


def test_single_choice_correct():
    verdict = evaluate_answer(
        question_type=QuestionType.single_choice,
        correct_option_ids=["A"],
        selected_option_ids=["A"],
    )
    assert verdict == QuestionVerdict.correct


def test_single_choice_incorrect():
    verdict = evaluate_answer(
        question_type=QuestionType.single_choice,
        correct_option_ids=["A"],
        selected_option_ids=["B"],
    )
    assert verdict == QuestionVerdict.incorrect


def test_single_choice_empty_selection_is_incorrect():
    verdict = evaluate_answer(
        question_type=QuestionType.single_choice,
        correct_option_ids=["A"],
        selected_option_ids=[],
    )
    assert verdict == QuestionVerdict.incorrect


def test_multiple_choice_exact_match_is_correct():
    verdict = evaluate_answer(
        question_type=QuestionType.multiple_choice,
        correct_option_ids=["A", "C"],
        selected_option_ids=["C", "A"],  # orden no importa
    )
    assert verdict == QuestionVerdict.correct


def test_multiple_choice_partial_overlap_is_partially_correct():
    verdict = evaluate_answer(
        question_type=QuestionType.multiple_choice,
        correct_option_ids=["A", "C"],
        selected_option_ids=["A"],
    )
    assert verdict == QuestionVerdict.partially_correct


def test_multiple_choice_no_overlap_is_incorrect():
    verdict = evaluate_answer(
        question_type=QuestionType.multiple_choice,
        correct_option_ids=["A", "C"],
        selected_option_ids=["B", "D"],
    )
    assert verdict == QuestionVerdict.incorrect


def test_multiple_choice_empty_selection_is_incorrect():
    verdict = evaluate_answer(
        question_type=QuestionType.multiple_choice,
        correct_option_ids=["A", "C"],
        selected_option_ids=[],
    )
    assert verdict == QuestionVerdict.incorrect


def test_multiple_choice_superset_selection_is_partially_correct():
    verdict = evaluate_answer(
        question_type=QuestionType.multiple_choice,
        correct_option_ids=["A", "C"],
        selected_option_ids=["A", "C", "D"],
    )
    assert verdict == QuestionVerdict.partially_correct


# --------------------------------------------------------------------------
# Fixtures de servicio: bank real cacheado para evaluate_question/simulation
# --------------------------------------------------------------------------


def _make_content_dir(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    module = content_dir / "curso-demo" / "modulo-demo"
    module.mkdir(parents=True)
    (module / "topico-demo.md").write_text(SAMPLE_TOPIC_MARKDOWN, encoding="utf-8")
    return content_dir


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        content_dir=str(_make_content_dir(tmp_path)),
        certification_cache_dir=str(tmp_path / "cert-cache"),
    )


def _seed_bank(tmp_path: Path):
    settings = _settings(tmp_path)
    provider = FakeLLMProvider(responses=[valid_question_bank_body_dict()])
    bank = certification_service.get_or_generate_question_bank(
        settings=settings,
        course_id="curso-demo",
        module_id="modulo-demo",
        topic_id="topico-demo",
        provider=provider,
    )
    return settings, bank


# --------------------------------------------------------------------------
# evaluate_question(): unknown bank / question / invalid option
# --------------------------------------------------------------------------


def test_evaluate_question_unknown_bank_raises(tmp_path):
    settings, _bank = _seed_bank(tmp_path)
    with pytest.raises(certification_service.CertificationBankNotFoundError):
        certification_service.evaluate_question(
            settings=settings,
            course_id="curso-demo",
            bank_id="0" * 64,
            question_id="Q-001",
            selected_option_ids=["A"],
        )


def test_evaluate_question_malformed_bank_id_raises_not_found(tmp_path):
    settings, _bank = _seed_bank(tmp_path)
    with pytest.raises(certification_service.CertificationBankNotFoundError):
        certification_service.evaluate_question(
            settings=settings,
            course_id="curso-demo",
            bank_id="../../etc/passwd",
            question_id="Q-001",
            selected_option_ids=["A"],
        )


def test_evaluate_question_unknown_question_raises(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    with pytest.raises(certification_service.CertificationQuestionNotFoundError):
        certification_service.evaluate_question(
            settings=settings,
            course_id="curso-demo",
            bank_id=bank.bank_id,
            question_id="Q-999",
            selected_option_ids=["A"],
        )


def test_evaluate_question_invalid_option_raises(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    with pytest.raises(certification_service.CertificationInvalidOptionError):
        certification_service.evaluate_question(
            settings=settings,
            course_id="curso-demo",
            bank_id=bank.bank_id,
            question_id="Q-001",
            selected_option_ids=["Z"],
        )


def test_evaluate_question_bank_from_another_course_not_found(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    with pytest.raises(certification_service.CertificationBankNotFoundError):
        certification_service.evaluate_question(
            settings=settings,
            course_id="otro-curso",
            bank_id=bank.bank_id,
            question_id="Q-001",
            selected_option_ids=["A"],
        )


def test_evaluate_question_returns_answer_key_after_answering(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    result = certification_service.evaluate_question(
        settings=settings,
        course_id="curso-demo",
        bank_id=bank.bank_id,
        question_id="Q-001",
        selected_option_ids=["A"],
    )
    assert result.verdict == QuestionVerdict.correct
    assert result.correct_option_ids == ["A"]
    assert result.explanation
    assert result.competency.text


# --------------------------------------------------------------------------
# evaluate_simulation(): batch, score, by_topic, by_competency, refuerzo
# --------------------------------------------------------------------------


def test_batch_simulation_evaluates_all_answers(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    result = certification_service.evaluate_simulation(
        settings=settings,
        course_id="curso-demo",
        answers=[
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-001", selected_option_ids=["A"]),
            AnswerSubmission(
                bank_id=bank.bank_id, question_id="Q-002", selected_option_ids=["A", "C"]
            ),
        ],
    )
    assert result.total_questions == 2
    assert result.correct == 2
    assert result.incorrect == 0
    assert result.unanswered == 0


def test_unanswered_question_counted_separately_from_incorrect(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    result = certification_service.evaluate_simulation(
        settings=settings,
        course_id="curso-demo",
        answers=[
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-001", selected_option_ids=[]),
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-002", selected_option_ids=["B"]),
        ],
    )
    assert result.unanswered == 1
    assert result.incorrect == 1
    assert result.total_questions == 2


def test_score_calculation_correct_1_partial_half_incorrect_zero(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    result = certification_service.evaluate_simulation(
        settings=settings,
        course_id="curso-demo",
        answers=[
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-001", selected_option_ids=["A"]),  # correct: 1.0
            AnswerSubmission(
                bank_id=bank.bank_id, question_id="Q-002", selected_option_ids=["A"]
            ),  # partially_correct: 0.5
        ],
    )
    # (1.0 + 0.5) / 2 * 100 = 75.0
    assert result.practice_score_percent == 75.0


def test_by_topic_breakdown_groups_correctly(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    result = certification_service.evaluate_simulation(
        settings=settings,
        course_id="curso-demo",
        answers=[
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-001", selected_option_ids=["A"]),
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-002", selected_option_ids=["B"]),
        ],
    )
    assert len(result.by_topic) == 1
    topic = result.by_topic[0]
    assert topic.module_id == "modulo-demo"
    assert topic.topic_id == "topico-demo"
    assert topic.attempted == 2
    assert topic.correct == 1
    assert topic.incorrect == 1


def test_by_competency_breakdown_uses_exact_text_match(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    result = certification_service.evaluate_simulation(
        settings=settings,
        course_id="curso-demo",
        answers=[
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-001", selected_option_ids=["A"]),
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-002", selected_option_ids=["A"]),
        ],
    )
    labels = {c.competency for c in result.by_competency}
    assert labels == {"Identificar qué es Kubernetes", "Distinguir componentes de Kubernetes"}


def test_topics_to_reinforce_includes_topics_with_incorrect_or_partial(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    result = certification_service.evaluate_simulation(
        settings=settings,
        course_id="curso-demo",
        answers=[
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-001", selected_option_ids=["B"]),  # incorrect
        ],
    )
    assert len(result.topics_to_reinforce) == 1
    assert result.topics_to_reinforce[0].topic_id == "topico-demo"


def test_topics_to_reinforce_excludes_fully_correct_topic(tmp_path):
    settings, bank = _seed_bank(tmp_path)
    result = certification_service.evaluate_simulation(
        settings=settings,
        course_id="curso-demo",
        answers=[
            AnswerSubmission(bank_id=bank.bank_id, question_id="Q-001", selected_option_ids=["A"]),
            AnswerSubmission(
                bank_id=bank.bank_id, question_id="Q-002", selected_option_ids=["A", "C"]
            ),
        ],
    )
    assert result.topics_to_reinforce == []


def test_simulation_with_unknown_bank_raises(tmp_path):
    settings, _bank = _seed_bank(tmp_path)
    with pytest.raises(certification_service.CertificationBankNotFoundError):
        certification_service.evaluate_simulation(
            settings=settings,
            course_id="curso-demo",
            answers=[
                AnswerSubmission(bank_id="0" * 64, question_id="Q-001", selected_option_ids=["A"])
            ],
        )
