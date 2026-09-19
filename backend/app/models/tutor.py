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
    # v1.3.0 (bloque "Classroom UX", Tutor Expanded Mode): default False
    # preserva el comportamiento estricto de siempre -- un request viejo
    # (sin este campo) se decodifica exactamente igual que uno explícito
    # con allow_general_knowledge=False (backward compatible, PARTE 25).
    allow_general_knowledge: bool = False


class TutorResponseType(str, Enum):
    answer = "answer"
    not_covered = "not_covered"
    clarification = "clarification"
    # v1.3.0: la pregunta no está relacionada con el tópico actual -- solo
    # es una salida posible cuando el request pidió allow_general_knowledge
    # (ver REGLA 20 del prompt); en modo estricto el comportamiento sigue
    # siendo exactamente el de antes (not_covered cubre todo lo no
    # respaldado por la fuente, relacionado o no).
    unrelated = "unrelated"


class TutorReplyBody(BaseModel):
    """Lo único que el LLM del tutor produce. Validado estructuralmente acá
    (forma del contrato) y luego por `validate_tutor_reply`
    (`app/services/tutor_validation.py`, grounding real de `answer_chunks`).

    v1.3.0 (bloque "Classroom UX", Tutor Expanded Mode): el contenido de
    conocimiento general NUNCA se representa como `GroundedText` — ese
    tipo exige `source_refs` no vacío a nivel de Pydantic
    (`GroundedText._refs_not_empty`, invariante compartida con lecciones y
    checkpoints, ver `app/models/lesson.py`; nunca se debilita esa regla
    global solo para el tutor). En cambio, `general_knowledge_chunks` es
    un campo estructuralmente DISTINTO (`list[str]`, sin ningún campo de
    `source_refs`): es estructuralmente imposible que el LLM finja que
    conocimiento general está grounded, porque ese tipo no tiene dónde
    poner una referencia. `answer_chunks` sigue siendo 100% grounded
    siempre, sin excepciones."""

    response_type: TutorResponseType
    answer_chunks: list[GroundedText] = Field(default_factory=list)
    # v1.3.0: texto de la respuesta que proviene de conocimiento general
    # del modelo (no de AUTHORIZED SOURCE) — solo cuando
    # general_knowledge_used=True. Nunca tiene source_refs porque no está
    # grounded; PARTE 31 exige exactamente esto ("nunca crear source_refs
    # ficticios para conocimiento general").
    general_knowledge_chunks: list[str] = Field(default_factory=list)
    clarification_question: str | None = Field(default=None, max_length=300)
    # v1.3.0: true únicamente cuando response_type="answer" Y
    # general_knowledge_chunks no está vacío. El frontend lo usa para
    # mostrar el badge de transparencia (PARTE 31) — nunca se infiere del
    # lado del cliente, lo declara el propio modelo en la misma llamada
    # estructurada que ya produce la respuesta (PARTE 28: sin segunda
    # clasificación).
    general_knowledge_used: bool = False

    @model_validator(mode="after")
    def _validate_shape_by_response_type(self) -> "TutorReplyBody":
        if self.response_type == TutorResponseType.answer:
            if not self.answer_chunks and not self.general_knowledge_chunks:
                raise ValueError(
                    "response_type='answer' requiere al menos un answer_chunk o "
                    "general_knowledge_chunk."
                )
            if self.clarification_question is not None:
                raise ValueError(
                    "response_type='answer' no debe incluir clarification_question."
                )
            if bool(self.general_knowledge_chunks) != self.general_knowledge_used:
                raise ValueError(
                    "general_knowledge_used debe ser true si y solo si hay al menos un "
                    "general_knowledge_chunk (nunca uno sin el otro)."
                )
        else:
            if self.answer_chunks:
                raise ValueError(
                    f"response_type='{self.response_type.value}' no debe incluir answer_chunks."
                )
            if self.general_knowledge_chunks:
                raise ValueError(
                    f"response_type='{self.response_type.value}' no debe incluir "
                    "general_knowledge_chunks (no se generó ninguna respuesta)."
                )
            if self.general_knowledge_used:
                raise ValueError(
                    f"response_type='{self.response_type.value}' no debe declarar "
                    "general_knowledge_used=true (no se generó ninguna respuesta)."
                )
            if self.response_type == TutorResponseType.clarification:
                if not self.clarification_question or not self.clarification_question.strip():
                    raise ValueError(
                        "response_type='clarification' requiere clarification_question."
                    )
            elif self.clarification_question is not None:
                # not_covered / unrelated: el backend redacta el mensaje
                # fijo, nunca el LLM (mismo criterio para ambos).
                raise ValueError(
                    f"response_type='{self.response_type.value}' no debe incluir "
                    "clarification_question."
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
