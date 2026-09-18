"""Modelos Pydantic del tutor interactivo grounded y de los checkpoints de
comprensión (Fase 5).

Regla de fuente de verdad (ver CLAUDE.md): el Grounding Packet del tópico
actual sigue siendo la ÚNICA fuente autorizada de conocimiento.
`recent_history`, el contexto de escena generado (GENERATED CLASS CONTEXT)
y `expected_answer` de un checkpoint son exclusivamente contexto
conversacional/generado NO confiable: nunca reemplazan al Grounding Packet
ni se tratan como hechos. Ver `docs/ARCHITECTURE.md`.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator

from app.models.lesson import GroundedText


class TutorRole(str, Enum):
    """Roles permitidos en `recent_history`. `system` NUNCA se acepta: el
    alumno no puede inyectar instrucciones de sistema vía historial."""

    user = "user"
    assistant = "assistant"


class TutorMessage(BaseModel):
    role: TutorRole
    content: str = Field(min_length=1, max_length=4000)


class TutorRequest(BaseModel):
    """Lo único que el navegador puede enviar. Nunca acepta una ruta de
    filesystem, el Grounding Packet, el system prompt, una API key, un
    provider ni SourceBlocks arbitrarios: el backend siempre resuelve el
    tópico verdadero a través del repositorio seguro existente."""

    message: str = Field(min_length=1, max_length=4000)
    scene_id: str | None = None
    recent_history: list[TutorMessage] = Field(default_factory=list, max_length=10)


class TutorResponseType(str, Enum):
    answer = "answer"
    not_covered = "not_covered"
    clarification = "clarification"


class TutorReplyBody(BaseModel):
    """Lo único que el LLM del tutor produce. Validado estructuralmente acá
    (forma del contrato) y luego por `validate_tutor_reply`
    (`app/services/tutor_validation.py`, grounding real de `answer_chunks`).
    """

    response_type: TutorResponseType
    answer_chunks: list[GroundedText] = Field(default_factory=list)
    clarification_question: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _validate_shape_by_response_type(self) -> "TutorReplyBody":
        if self.response_type == TutorResponseType.answer:
            if not self.answer_chunks:
                raise ValueError(
                    "response_type='answer' requiere al menos un answer_chunk."
                )
            if self.clarification_question is not None:
                raise ValueError(
                    "response_type='answer' no debe incluir clarification_question."
                )
        elif self.response_type == TutorResponseType.not_covered:
            if self.answer_chunks:
                raise ValueError(
                    "response_type='not_covered' no debe incluir answer_chunks "
                    "(el backend no permite que el modelo invente una explicación "
                    "alternativa)."
                )
            if self.clarification_question is not None:
                raise ValueError(
                    "response_type='not_covered' no debe incluir clarification_question."
                )
        elif self.response_type == TutorResponseType.clarification:
            if self.answer_chunks:
                raise ValueError(
                    "response_type='clarification' no debe incluir answer_chunks "
                    "(no puede introducir conocimiento nuevo del dominio)."
                )
            if not self.clarification_question or not self.clarification_question.strip():
                raise ValueError(
                    "response_type='clarification' requiere clarification_question."
                )
        return self


class CheckpointRequest(BaseModel):
    """Lo único que el navegador puede enviar para evaluar un checkpoint."""

    scene_id: str = Field(min_length=1)
    answer: str = Field(min_length=1, max_length=4000)


class CheckpointVerdict(str, Enum):
    correct = "correct"
    partially_correct = "partially_correct"
    incorrect = "incorrect"
    not_assessable = "not_assessable"


class CheckpointEvaluationBody(BaseModel):
    """Lo único que el LLM evaluador produce. `verdict` mide únicamente
    consistencia con el material autorizado (nunca estilo, gramática ni
    capacidad general). `feedback` y `ideal_answer` deben estar grounded
    (source_refs válidos) — validado en `checkpoint_validation.py`."""

    verdict: CheckpointVerdict
    feedback: list[GroundedText] = Field(default_factory=list)
    ideal_answer: GroundedText | None = None

    @model_validator(mode="after")
    def _feedback_required(self) -> "CheckpointEvaluationBody":
        if not self.feedback:
            raise ValueError("feedback no puede estar vacío.")
        return self
