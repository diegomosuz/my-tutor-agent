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
        _validate_tutor_reply_shape(
            response_type=self.response_type,
            answer_chunks=self.answer_chunks,
            general_knowledge_chunks=self.general_knowledge_chunks,
            clarification_question=self.clarification_question,
            general_knowledge_used=self.general_knowledge_used,
        )
        return self


def _validate_tutor_reply_shape(
    *,
    response_type: TutorResponseType,
    answer_chunks: list[GroundedText],
    general_knowledge_chunks: list[str],
    clarification_question: str | None,
    general_knowledge_used: bool,
) -> None:
    """Invariantes de forma compartidas entre `TutorReplyBody` y
    `ExpandedTutorReplyBody` (v1.3.0, BLOQUE 6 gap-closure) -- ambas
    exponen exactamente los mismos cinco campos de respuesta, la única
    diferencia es que `ExpandedTutorReplyBody` antepone un campo de
    razonamiento interno (ver su docstring)."""
    if response_type == TutorResponseType.answer:
        if not answer_chunks and not general_knowledge_chunks:
            raise ValueError(
                "response_type='answer' requiere al menos un answer_chunk o "
                "general_knowledge_chunk."
            )
        if clarification_question is not None:
            raise ValueError("response_type='answer' no debe incluir clarification_question.")
        if bool(general_knowledge_chunks) != general_knowledge_used:
            raise ValueError(
                "general_knowledge_used debe ser true si y solo si hay al menos un "
                "general_knowledge_chunk (nunca uno sin el otro)."
            )
    else:
        if answer_chunks:
            raise ValueError(
                f"response_type='{response_type.value}' no debe incluir answer_chunks."
            )
        if general_knowledge_chunks:
            raise ValueError(
                f"response_type='{response_type.value}' no debe incluir "
                "general_knowledge_chunks (no se generó ninguna respuesta)."
            )
        if general_knowledge_used:
            raise ValueError(
                f"response_type='{response_type.value}' no debe declarar "
                "general_knowledge_used=true (no se generó ninguna respuesta)."
            )
        if response_type == TutorResponseType.clarification:
            if not clarification_question or not clarification_question.strip():
                raise ValueError("response_type='clarification' requiere clarification_question.")
        elif clarification_question is not None:
            # not_covered / unrelated: el backend redacta el mensaje
            # fijo, nunca el LLM (mismo criterio para ambos).
            raise ValueError(
                f"response_type='{response_type.value}' no debe incluir clarification_question."
            )


class TutorScopeRelation(str, Enum):
    """Clasificación CERRADA (nunca texto libre) de a qué pertenece la
    pregunta del alumno, en modo ampliado (v1.3.0, BLOQUE 6 segundo
    gap-closure). Reemplaza a `relevance_reasoning` (texto libre,
    `tutor-v3.2.1`): un campo de razonamiento libre podía "decir" la
    conclusión correcta y aun así terminar en un `response_type`
    inconsistente en el mismo objeto (observado en QA real con
    "¿Qué es un LLM?": el propio texto reconocía relación con el dominio,
    pero `response_type` igual era "unrelated") -- un ENUM cerrado, en
    cambio, permite validar esa consistencia de forma determinística
    (ver `_validate_expanded_scope_invariants`), convirtiendo una
    inconsistencia silenciosa en un error de contrato rechazable y
    reintentable."""

    current_topic = "current_topic"
    course_domain = "course_domain"
    unrelated = "unrelated"


class TutorTopicCoverage(str, Enum):
    """Cuánto de la pregunta puede responderse con evidencia real de
    AUTHORIZED SOURCE (el tópico actual, nunca otro) -- eje
    INDEPENDIENTE de `scope_relation` (v1.3.0, BLOQUE 6 segundo
    gap-closure). Existe para separar estructuralmente "¿pertenece al
    dominio?" de "¿cuánto cubre el tópico actual?", en vez de que ambas
    decisiones se mezclen dentro de un único `response_type`."""

    sufficient = "sufficient"
    partial = "partial"
    insufficient = "insufficient"


def _validate_expanded_scope_invariants(
    *,
    scope_relation: TutorScopeRelation,
    topic_coverage: TutorTopicCoverage,
    response_type: TutorResponseType,
    answer_chunks: list[GroundedText],
    general_knowledge_chunks: list[str],
    general_knowledge_used: bool,
) -> None:
    """Invariantes deterministas que cruzan `scope_relation`/
    `topic_coverage` con la forma de la respuesta -- exclusivas de
    `ExpandedTutorReplyBody` (modo ampliado). Nunca evalúan contenido
    semántico (no hay "semantic similarity score" ni nada equivalente):
    solo consistencia estructural entre campos que el propio LLM ya
    declaró en la MISMA respuesta."""
    if response_type == TutorResponseType.clarification:
        # REGLA 18 (pedir aclaración) es una salida ortogonal a la matriz
        # scope/coverage, igual que antes de este gap-closure -- no se
        # cruza con estas invariantes.
        return

    if scope_relation == TutorScopeRelation.unrelated:
        if response_type != TutorResponseType.unrelated:
            raise ValueError(
                "scope_relation='unrelated' exige response_type='unrelated' "
                f"(recibido '{response_type.value}')."
            )
        return  # topic_coverage no aplica cuando scope_relation=unrelated

    # scope_relation in (current_topic, course_domain): en modo ampliado
    # la única salida válida es "answer" -- "not_covered" fue reemplazado
    # por general_knowledge_chunks, "unrelated" ya se descartó arriba.
    if response_type != TutorResponseType.answer:
        raise ValueError(
            f"scope_relation='{scope_relation.value}' exige response_type='answer' en modo "
            f"ampliado (nunca 'not_covered' ni 'unrelated') -- recibido '{response_type.value}'."
        )

    if topic_coverage == TutorTopicCoverage.sufficient:
        if general_knowledge_chunks or general_knowledge_used:
            raise ValueError(
                "topic_coverage='sufficient' no debe usar conocimiento general -- "
                "general_knowledge_chunks debe estar vacío y general_knowledge_used=false."
            )
        if not answer_chunks:
            raise ValueError(
                "topic_coverage='sufficient' requiere al menos un answer_chunk grounded."
            )
    elif topic_coverage == TutorTopicCoverage.insufficient:
        if answer_chunks:
            raise ValueError(
                "topic_coverage='insufficient' no debe incluir answer_chunks -- si AUTHORIZED "
                "SOURCE no sostiene realmente la respuesta, esa parte va en "
                "general_knowledge_chunks, nunca forzada como answer_chunk con una cita débil "
                "(esto bloquea weak attribution mediante un invariante estructural, sin "
                "validador semántico)."
            )
    # topic_coverage='partial': sin restricción adicional -- answer_chunks
    # y general_knowledge_chunks pueden convivir (evidencia parcial real +
    # conocimiento general completando el resto).


class ExpandedTutorReplyBody(BaseModel):
    """Modelo INTERNO usado ÚNICAMENTE como `response_model` de la llamada
    LLM cuando `allow_general_knowledge=True` (v1.3.0, BLOQUE 6
    gap-closure) -- NUNCA se expone en la API pública (el router sigue
    declarando `response_model=TutorReplyBody`; `tutor_service.ask_tutor`
    convierte el resultado a `TutorReplyBody` antes de devolverlo, ver
    `to_tutor_reply_body`).

    Causa raíz que motiva este modelo (`tutor-v3.2.1`, primer
    gap-closure): con OpenAI Structured Outputs
    (`response_format=<PydanticModel>`) y `temperature=0`, el modelo debe
    comprometerse con `response_type` como uno de los primeros campos
    generados -- anteponer alguna forma de "juicio de alcance" en el
    orden de campos del schema le da al modelo el mismo espacio de
    decisión dentro de la MISMA llamada estructurada.

    Segundo gap-closure (`tutor-v3.3`): la primera versión de este modelo
    usaba un campo de texto libre (`relevance_reasoning`). QA real mostró
    que un campo de texto libre podía "razonar bien" y aun así terminar en
    un `response_type` inconsistente con su propio texto -- el texto no
    se valida estructuralmente. Se reemplaza por dos ENUMs cerrados,
    `scope_relation` (current_topic/course_domain/unrelated) y
    `topic_coverage` (sufficient/partial/insufficient), en ese orden,
    ANTES de `response_type` -- una clasificación estructurada, no una
    explicación. Esto permite validar determinísticamente la consistencia
    entre "a qué pertenece la pregunta", "cuánto cubre el tópico actual" y
    "cómo se armó la respuesta" (`_validate_expanded_scope_invariants`),
    algo que un campo de texto libre no permitía verificar sin un
    validador semántico. Ninguno de los dos campos se expone en la API
    pública ni se persiste/loguea (podrían correlacionar con la pregunta
    del alumno)."""

    scope_relation: TutorScopeRelation = Field(
        description=(
            "Clasificación cerrada (NO explicación): 'current_topic' si la pregunta es "
            "sobre el tema de AUTHORIZED SOURCE; 'course_domain' si no es del tópico actual "
            "pero pertenece razonablemente al dominio educativo amplio del curso "
            "(fundamentos, conceptos adyacentes, herramientas/ecosistema, técnicas, "
            "prácticas -- ver REGLA 20/22); 'unrelated' solo si es CLARAMENTE ajena a "
            "ambos. Completá este campo PRIMERO, antes de cualquier otro campo."
        )
    )
    topic_coverage: TutorTopicCoverage = Field(
        description=(
            "Clasificación cerrada de cuánto cubre AUTHORIZED SOURCE (el tópico actual, "
            "nunca otro) la respuesta: 'sufficient' si alcanza por completo; 'partial' si "
            "alcanza para una parte real; 'insufficient' si no alcanza o alcanza solo de "
            "forma tangencial/superficial (una mención de pasada NO cuenta como coverage). "
            "Completá este campo SEGUNDO, antes de response_type."
        )
    )
    response_type: TutorResponseType
    answer_chunks: list[GroundedText] = Field(default_factory=list)
    general_knowledge_chunks: list[str] = Field(default_factory=list)
    clarification_question: str | None = Field(default=None, max_length=300)
    general_knowledge_used: bool = False

    @model_validator(mode="after")
    def _validate_shape_by_response_type(self) -> "ExpandedTutorReplyBody":
        # Orden importa para la CALIDAD del mensaje de corrección (no solo
        # para la validación en sí): `_validate_expanded_scope_invariants`
        # corre PRIMERO porque detecta la causa raíz real de una
        # inconsistencia (scope_relation vs. response_type) -- QA real
        # mostró que, cuando el orden era al revés, un caso real
        # (scope_relation="course_domain" + response_type="unrelated" +
        # general_knowledge_chunks poblado) disparaba primero el error
        # genérico de forma ("'unrelated' no debe incluir
        # general_knowledge_chunks"), y el modelo "corregía" vaciando los
        # chunks en vez de arreglar la contradicción real -- terminaba
        # convergiendo en "unrelated" limpio pero SEMÁNTICAMENTE
        # incorrecto. Detectar y nombrar la causa raíz primero evita que
        # el reintento converja hacia el síntoma más fácil de corregir.
        _validate_expanded_scope_invariants(
            scope_relation=self.scope_relation,
            topic_coverage=self.topic_coverage,
            response_type=self.response_type,
            answer_chunks=self.answer_chunks,
            general_knowledge_chunks=self.general_knowledge_chunks,
            general_knowledge_used=self.general_knowledge_used,
        )
        _validate_tutor_reply_shape(
            response_type=self.response_type,
            answer_chunks=self.answer_chunks,
            general_knowledge_chunks=self.general_knowledge_chunks,
            clarification_question=self.clarification_question,
            general_knowledge_used=self.general_knowledge_used,
        )
        return self

    def to_tutor_reply_body(self) -> "TutorReplyBody":
        """Descarta `scope_relation`/`topic_coverage` -- nunca cruzan
        hacia el contrato público ni hacia los logs."""
        return TutorReplyBody(
            response_type=self.response_type,
            answer_chunks=self.answer_chunks,
            general_knowledge_chunks=self.general_knowledge_chunks,
            clarification_question=self.clarification_question,
            general_knowledge_used=self.general_knowledge_used,
        )


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
