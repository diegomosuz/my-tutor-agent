"""Modelos Pydantic de la práctica/simulacro de certificación grounded
(Fase 6).

Aviso de producto, no solo técnico: esta funcionalidad NO reproduce ni
afirma reproducir un examen oficial de ninguna certificación externa. Es
"práctica orientada a certificación basada exclusivamente en el material
del curso" (Markdown -> CanonicalTopicContent -> Grounding Packet, igual
que el resto de la aplicación). Ningún modelo de este archivo permite
transportar un answer key al frontend antes de que el alumno responda (ver
`ExamQuestionView`, que deliberadamente NO incluye `correct_option_ids`,
`explanation` ni `derivation_refs`).
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.lesson import GroundedText


class QuestionType(str, Enum):
    single_choice = "single_choice"
    multiple_choice = "multiple_choice"


class QuestionStyle(str, Enum):
    """conceptual: pregunta directa sobre un concepto de la fuente.
    relationship: pregunta por relaciones explícitas entre conceptos de la
    fuente. application: solo válida si puede construirse enteramente con
    hechos/entidades/relaciones presentes en la fuente — NUNCA autoriza un
    caso de negocio externo inventado (ver system prompt,
    `app/prompts/certification.py`)."""

    conceptual = "conceptual"
    relationship = "relationship"
    application = "application"


class GeneratedOption(BaseModel):
    """`derivation_refs` significa "bloques fuente utilizados para
    construir esta opción" — NO significa que la opción sea verdadera. Una
    opción incorrecta (distractor) también debe declarar de qué bloques
    fuente se construyó, para que el distractor mismo sea auditable y
    nunca provenga de conocimiento externo al material."""

    option_id: str = Field(min_length=1, max_length=4)
    text: str = Field(min_length=1)
    derivation_refs: list[str] = Field(default_factory=list)

    @field_validator("option_id")
    @classmethod
    def _option_id_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("GeneratedOption.option_id no puede estar vacío")
        return value

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("GeneratedOption.text no puede estar vacío")
        return value

    @field_validator("derivation_refs")
    @classmethod
    def _derivation_refs_not_empty(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("GeneratedOption.derivation_refs no puede estar vacío")
        return value


class GeneratedQuestionBody(BaseModel):
    """Lo que el LLM debe producir por cada pregunta. `question_id` NUNCA
    lo asigna el LLM (ver `Question`, asignado por el backend tras
    validar)."""

    question_type: QuestionType
    question_style: QuestionStyle
    stem: GroundedText
    options: list[GeneratedOption]
    correct_option_ids: list[str] = Field(default_factory=list)
    explanation: list[GroundedText] = Field(default_factory=list)
    competency: GroundedText

    @field_validator("explanation")
    @classmethod
    def _explanation_not_empty(cls, value: list[GroundedText]) -> list[GroundedText]:
        if not value:
            raise ValueError("GeneratedQuestionBody.explanation no puede estar vacío")
        return value

    @model_validator(mode="after")
    def _validate_options_and_correct_ids(self) -> "GeneratedQuestionBody":
        if len(self.options) < 3:
            raise ValueError(
                f"La pregunta debe tener al menos 3 opciones (tiene {len(self.options)})."
            )
        option_ids = [opt.option_id for opt in self.options]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError(f"option_id duplicados entre las opciones: {option_ids}")

        if not self.correct_option_ids:
            raise ValueError("correct_option_ids no puede estar vacío")
        if len(self.correct_option_ids) != len(set(self.correct_option_ids)):
            raise ValueError(
                f"correct_option_ids tiene duplicados: {self.correct_option_ids}"
            )
        unknown = [cid for cid in self.correct_option_ids if cid not in option_ids]
        if unknown:
            raise ValueError(
                f"correct_option_ids referencia option_id inexistentes: {unknown}"
            )

        if self.question_type == QuestionType.single_choice and len(self.correct_option_ids) != 1:
            raise ValueError(
                "single_choice requiere exactamente 1 correct_option_id "
                f"(tiene {len(self.correct_option_ids)})."
            )
        if self.question_type == QuestionType.multiple_choice and len(self.correct_option_ids) < 2:
            raise ValueError(
                "multiple_choice requiere al menos 2 correct_option_ids "
                f"(tiene {len(self.correct_option_ids)})."
            )
        return self


class GeneratedQuestionBankBody(BaseModel):
    """Lo único que el LLM produce para un QuestionBank. Todo lo
    determinístico (bank_id, course/module/topic, content_sha256,
    provider, model, prompt_version, question_id de cada pregunta,
    generated_at) lo agrega el backend en `QuestionBank`."""

    questions: list[GeneratedQuestionBody] = Field(default_factory=list)


class Question(BaseModel):
    """Una pregunta ya asentada dentro de un `QuestionBank`, con
    `question_id` asignado por el backend (formato `Q-001`, `Q-002`, ...) —
    nunca confiar en un id producido por el LLM."""

    question_id: str
    question_type: QuestionType
    question_style: QuestionStyle
    stem: GroundedText
    options: list[GeneratedOption]
    correct_option_ids: list[str]
    explanation: list[GroundedText]
    competency: GroundedText


class QuestionBank(BaseModel):
    """Ensamblado por el BACKEND. El LLM nunca devuelve bank_id,
    course/module/topic, content_sha256, provider, model, prompt_version
    ni generated_at — solo `GeneratedQuestionBankBody`."""

    bank_id: str
    course_id: str
    module_id: str
    topic_id: str
    content_sha256: str
    provider: str
    model: str
    prompt_version: str
    questions: list[Question] = Field(default_factory=list)
    generated_at: str


class PublicOption(BaseModel):
    """Vista pública de una opción: SOLO id + texto. Nunca
    `derivation_refs` (sección 18/52 de la especificación de Fase 6)."""

    option_id: str
    text: str


class ExamQuestionView(BaseModel):
    """Lo único que el frontend recibe ANTES de que el alumno responda.
    Deliberadamente NO incluye: correct_option_ids, explanation,
    competency, derivation_refs, source_refs del stem, prompts ni
    Grounding Packet. Un test dedicado (`test_certification_no_answer_key_leak.py`)
    serializa esta respuesta completa y busca esos campos."""

    bank_id: str
    question_id: str
    course_id: str
    module_id: str
    topic_id: str
    question_type: QuestionType
    question_style: QuestionStyle
    stem: str
    options: list[PublicOption]


class CertificationScope(BaseModel):
    """Si `topic_ids` viene con elementos, se usan esos tópicos. Si no,
    y `module_ids` viene con elementos, se usan todos los tópicos de esos
    módulos. Si ambos están vacíos, se usa el curso completo. Nunca se
    acepta una ruta de filesystem: todo se resuelve contra el repositorio
    seguro de cursos."""

    module_ids: list[str] = Field(default_factory=list)
    topic_ids: list[str] = Field(default_factory=list)


class CertificationMode(str, Enum):
    practice = "practice"
    simulation = "simulation"


class CertificationPrepareRequest(BaseModel):
    mode: CertificationMode = CertificationMode.practice
    scope: CertificationScope = Field(default_factory=CertificationScope)
    question_count: int = Field(default=10, ge=1, le=30)
    shuffle: bool = True
    # Solo para tests/determinismo; nunca se expone en la UI de producción.
    seed: int | None = None


class CertificationPrepareResponse(BaseModel):
    practice_id: str
    course_id: str
    mode: CertificationMode
    requested_count: int
    actual_count: int
    questions: list[ExamQuestionView]


class AnswerSubmission(BaseModel):
    bank_id: str = Field(min_length=1)
    question_id: str = Field(min_length=1)
    selected_option_ids: list[str] = Field(default_factory=list)


class EvaluateQuestionRequest(AnswerSubmission):
    pass


class EvaluateSimulationRequest(BaseModel):
    answers: list[AnswerSubmission] = Field(default_factory=list, max_length=30)

    @field_validator("answers")
    @classmethod
    def _at_least_one_answer(cls, value: list[AnswerSubmission]) -> list[AnswerSubmission]:
        if not value:
            raise ValueError("answers no puede estar vacío")
        return value


class QuestionVerdict(str, Enum):
    correct = "correct"
    partially_correct = "partially_correct"
    incorrect = "incorrect"


class QuestionEvaluation(BaseModel):
    """Resultado de UNA pregunta ya respondida. A diferencia de
    `ExamQuestionView`, esta respuesta SÍ puede (y debe) incluir
    correct_option_ids/explanation/competency: el alumno ya respondió."""

    bank_id: str
    question_id: str
    module_id: str
    topic_id: str
    question_type: QuestionType
    selected_option_ids: list[str]
    verdict: QuestionVerdict
    correct_option_ids: list[str]
    explanation: list[GroundedText]
    competency: GroundedText


class TopicBreakdown(BaseModel):
    module_id: str
    topic_id: str
    attempted: int
    correct: int
    partially_correct: int
    incorrect: int
    unanswered: int
    practice_score_percent: float


class CompetencyBreakdown(BaseModel):
    competency: str
    attempted: int
    correct: int
    partially_correct: int
    incorrect: int
    practice_score_percent: float


class CertificationPracticeResult(BaseModel):
    """`practice_score_percent` es EXCLUSIVAMENTE el desempeño de ESTA
    práctica puntual — nunca una predicción de aprobación de una
    certificación oficial (ver REGLA de producto en
    `app/prompts/certification.py` y `docs/ARCHITECTURE.md`)."""

    total_questions: int
    correct: int
    partially_correct: int
    incorrect: int
    unanswered: int
    practice_score_percent: float
    by_topic: list[TopicBreakdown]
    by_competency: list[CompetencyBreakdown]
    question_results: list[QuestionEvaluation]
    topics_to_reinforce: list[TopicBreakdown]
