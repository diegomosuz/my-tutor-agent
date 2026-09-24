"""Tests de app/services/certification_validation.py (v1.6.1, PARTE 15/18-
21): la red de seguridad conservadora contra preguntas meta-pedagógicas
(objetivos del módulo, "qué vas a aprender", estructura del curso) --
capa 3 sobre REGLA 21 del prompt (`app/prompts/certification.py`). Ningún
test hace llamadas de red ni usa un LLM real."""
from __future__ import annotations

import pytest

from app.services.certification_validation import (
    _is_meta_pedagogical_stem,
    validate_question_bank,
)
from app.services.llm_retry import ValidationFailure
from app.models.certification import GeneratedQuestionBankBody

from .certification_fixtures import build_sample_canonical, single_choice_question_dict


# --------------------------------------------------------------------------
# _is_meta_pedagogical_stem: clasificador puro (sin canonical/modelo)
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "stem",
    [
        "¿Qué aprenderás en este módulo?",
        "¿Cuál es el objetivo de este módulo?",
        "¿Cuál es el objetivo del curso?",
        "¿Qué aprenderá el estudiante al finalizar?",
        "¿Qué temas se abordarán en esta unidad?",
        "¿Qué veremos a continuación?",
        "Al finalizar este módulo podrás configurar un pipeline. ¿Qué lograrás?",
        "¿Cuál es el propósito pedagógico del módulo?",
        "¿Qué competencias se espera desarrollar en esta sección?",
    ],
)
def test_meta_pedagogical_stems_are_detected(stem):
    assert _is_meta_pedagogical_stem(stem) is True


@pytest.mark.parametrize(
    "stem",
    [
        "¿Qué es Kubernetes según el material?",
        "¿Cuáles de los siguientes son componentes mencionados en el material?",
        "Dado este escenario, ¿qué mecanismo debería utilizarse para reintentar la conexión?",
        "¿Qué resultado produce este código?",
        "¿En qué situación corresponde utilizar un checkpoint?",
        "¿Qué propiedad garantiza la convergencia descrita en el material?",
        # PARTE 9: no debe ser una heurística agresiva -- "objetivo"/
        # "aprender" en un contexto técnico legítimo (no sobre el
        # módulo/curso/tópico en sí) no debe dispararse.
        "¿Cuál es el objetivo de la función de pérdida (loss) en este algoritmo?",
        "El algoritmo puede aprender de los datos de entrenamiento. ¿Qué técnica usa para eso?",
    ],
)
def test_substantive_stems_are_never_flagged(stem):
    assert _is_meta_pedagogical_stem(stem) is False


# --------------------------------------------------------------------------
# Hardening v1.6.1 (PASO 10, "RELEASE GATE CRÍTICO"): "módulo" como
# término TÉCNICO legítimo (módulo de Python/Terraform/sistema/
# arquitectura) nunca debe confundirse con "módulo" como unidad
# curricular. Ejemplos EXACTOS de la especificación de hardening.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "stem",
    [
        "¿Qué módulo de Python permite manejar fechas y horas?",
        "¿Qué función cumple el módulo de autenticación?",
        "¿Qué módulo del sistema procesa eventos entrantes?",
        "¿Qué módulos de Terraform se utilizan para provisionar la red descrita?",
        "¿Qué módulo de una arquitectura contiene la lógica de negocio?",
    ],
)
def test_technical_module_word_is_never_a_false_positive(stem):
    assert _is_meta_pedagogical_stem(stem) is False


# PASO 11: cobertura en inglés -- las mismas frases meta-pedagógicas
# deben detectarse igual que en español (los cursos reales de este
# proyecto son mayormente en español, pero el validador no debe fallar
# silenciosamente ante contenido en inglés).
@pytest.mark.parametrize(
    "stem",
    [
        "What will you learn in this module?",
        "What is the learning objective of this module?",
        "What topics will be covered in this course?",
    ],
)
def test_english_meta_pedagogical_stems_are_detected(stem):
    assert _is_meta_pedagogical_stem(stem) is True


# PASO 13: términos potencialmente ambiguos en contexto técnico legítimo
# -- ninguno debe rechazarse solo por contener "objetivo"/"learning"/
# "módulo"/"finalizar".
@pytest.mark.parametrize(
    "stem",
    [
        "¿Cuál es el objetivo de la función de optimización utilizada en el entrenamiento?",
        "What does the objective function measure in this training setup?",
        "¿Qué controla el learning rate durante el entrenamiento del modelo?",
        "¿Qué hace el módulo `datetime` en Python?",
        "What does the authentication module do in this system?",
        "¿Qué ocurre en la finalización de un proceso según el material?",
        "¿Cuál es la diferencia entre un modelo de aprendizaje supervisado y uno no supervisado?",
    ],
)
def test_ambiguous_technical_terms_are_never_false_positives(stem):
    assert _is_meta_pedagogical_stem(stem) is False


# Límite conocido y documentado (docs/CERTIFICATION_QUALITY_V1_6_1.md):
# "objetivo" + "módulo" combinados en la MISMA pregunta puede disparar un
# falso positivo incluso cuando "módulo" es un término técnico (ej.
# Python), porque el patrón 2 no distingue esa ambigüedad. Este test
# documenta el comportamiento REAL (no lo esconde) -- mitigado por el
# retry existente, nunca "arreglado" con una heurística más compleja sin
# necesidad demostrada más allá de este único caso.
def test_known_limitation_objetivo_plus_modulo_ambiguity_is_documented():
    assert _is_meta_pedagogical_stem("¿Cuál es el objetivo del módulo `os` en Python?") is True


# --------------------------------------------------------------------------
# validate_question_bank: integración con el resto de la validación
# --------------------------------------------------------------------------


def test_validate_question_bank_rejects_meta_pedagogical_stem():
    canonical = build_sample_canonical()
    question = single_choice_question_dict()
    question["stem"] = {"text": "¿Qué aprenderás en este módulo?", "source_refs": ["SRC-002"]}
    body = GeneratedQuestionBankBody.model_validate({"questions": [question]})

    with pytest.raises(ValidationFailure) as exc_info:
        validate_question_bank(body, canonical)

    assert any("meta-pedagógica" in problem for problem in exc_info.value.problems)


def test_validate_question_bank_accepts_substantive_stem():
    canonical = build_sample_canonical()
    question = single_choice_question_dict()
    body = GeneratedQuestionBankBody.model_validate({"questions": [question]})

    # No debe lanzar: el stem real de la fixture ("¿Qué es Kubernetes
    # según el material?") es sustantivo, no meta-pedagógico.
    validate_question_bank(body, canonical)
