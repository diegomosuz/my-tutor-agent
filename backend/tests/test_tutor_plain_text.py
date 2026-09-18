"""Test del cierre de deuda de Fase 5 (Fase 6, punto 1.B): el system
prompt del tutor ahora exige texto plano, sin sintaxis Markdown decorativa
dirigida al alumno. No cambia `TutorReplyBody` (sigue siendo texto libre a
nivel de contrato); la regla es puramente de contenido/estilo del prompt."""
from __future__ import annotations

from app.prompts.tutor import TUTOR_PROMPT_VERSION, TUTOR_SYSTEM_PROMPT


def test_tutor_prompt_version_bumped():
    assert TUTOR_PROMPT_VERSION == "tutor-v2"


def test_system_prompt_forbids_decorative_markdown():
    assert "REGLA 19" in TUTOR_SYSTEM_PROMPT
    assert "texto plano" in TUTOR_SYSTEM_PROMPT
    assert "Markdown decorativa" in TUTOR_SYSTEM_PROMPT
    assert "negrita" in TUTOR_SYSTEM_PROMPT
    assert "backticks" in TUTOR_SYSTEM_PROMPT or "comillas invertidas" in TUTOR_SYSTEM_PROMPT


def test_system_prompt_still_preserves_technicalities_rule():
    assert "tecnicismos" in TUTOR_SYSTEM_PROMPT.lower()
