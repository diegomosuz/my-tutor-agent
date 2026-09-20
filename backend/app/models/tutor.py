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


class CourseGroundedText(BaseModel):
    """Afirmación pedagógica respaldada por evidencia de OTRO tópico del
    mismo curso (v1.4.0, Bloque 2) -- estructuralmente análoga a
    `GroundedText` (misma invariante: `source_refs` nunca vacío), pero
    deliberadamente un tipo DISTINTO en vez de reutilizar `GroundedText`:
    sus `source_refs` viven en el namespace `COURSE-SRC-XXX` (asignado
    por `app/services/course_grounding.py` para esta consulta puntual),
    nunca en el namespace `SRC-XXX` del tópico actual -- mezclar ambos
    namespaces en un solo campo haría imposible distinguir, solo mirando
    el tipo, si una afirmación viene del tópico actual o de otro tópico
    del curso. No lleva metadata de módulo/tópico duplicada: eso vive en
    `TutorCourseSource`, resuelto backend-side a partir de los bindings
    de la consulta (ver `to_tutor_reply_body`)."""

    text: str
    source_refs: list[str] = Field(min_length=1)


class TutorCourseSource(BaseModel):
    """Metadata de UNA fuente de COURSE EVIDENCE efectivamente citada en
    la respuesta (v1.4.0, Bloque 2) -- nunca los 6 candidatos que
    `course_retrieval.search_course` pudo haber encontrado, solo los que
    el LLM realmente usó en `course_answer_chunks` (filtrado backend-side,
    ver `to_tutor_reply_body`). Suficiente para navegación/provenance
    futura ("Ver tema relacionado", Bloque 3) sin exponer nada interno:
    nunca un path de filesystem, nunca el Markdown completo del bloque,
    nunca ningún dato que no sea metadata de ubicación curricular."""

    ref: str
    module_id: str
    module_title: str
    topic_id: str
    topic_title: str
    original_source_ref: str
    heading_path: list[str] = Field(default_factory=list)


class TutorReplyBody(BaseModel):
    """Lo único que el LLM del tutor produce. Validado estructuralmente acá
    (forma del contrato) y luego por `validate_tutor_reply`
    (`app/services/tutor_validation.py`, grounding real de `answer_chunks`
    y, desde v1.4.0, de `course_answer_chunks`).

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
    siempre, sin excepciones.

    v1.4.0 (Bloque 2, "COURSE-GROUNDED TUTOR + CROSS-TOPIC PROVENANCE"):
    agrega `course_answer_chunks`/`course_sources` como un TERCER canal,
    estructuralmente distinto de los otros dos -- evidencia real de OTROS
    tópicos del mismo curso (`CourseGroundedText`, namespace
    `COURSE-SRC-XXX`, 100% grounded igual que `answer_chunks`), nunca
    mezclada con el tópico actual ni con conocimiento general. Ambos
    campos nuevos default a `[]`: un request/response viejo (v1.3.0, sin
    estos campos) se sigue decodificando/sirviendo exactamente igual,
    backward compatible."""

    response_type: TutorResponseType
    answer_chunks: list[GroundedText] = Field(default_factory=list)
    # v1.4.0 (Bloque 2): evidencia grounded de OTROS tópicos del mismo
    # curso -- ver CourseGroundedText. Vacío salvo que course_coverage
    # (interno, nunca expuesto acá) haya sido sufficient/partial y el LLM
    # haya citado al menos un COURSE-SRC real.
    course_answer_chunks: list[CourseGroundedText] = Field(default_factory=list)
    # v1.4.0 (Bloque 2): metadata SOLO de las fuentes efectivamente
    # citadas en course_answer_chunks (nunca los candidatos no usados de
    # course_retrieval.search_course) -- PARTE 18: filtrado post-validación,
    # nunca antes de la generación.
    course_sources: list[TutorCourseSource] = Field(default_factory=list)
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
            course_answer_chunks=self.course_answer_chunks,
            general_knowledge_chunks=self.general_knowledge_chunks,
            clarification_question=self.clarification_question,
            general_knowledge_used=self.general_knowledge_used,
        )
        return self


def _validate_tutor_reply_shape(
    *,
    response_type: TutorResponseType,
    answer_chunks: list[GroundedText],
    course_answer_chunks: list[CourseGroundedText],
    general_knowledge_chunks: list[str],
    clarification_question: str | None,
    general_knowledge_used: bool,
) -> None:
    """Invariantes de forma compartidas entre `TutorReplyBody` y
    `StructuredTutorReplyBody` (v1.4.0, Bloque 2 -- extiende el mismo
    invariante ya compartido entre `TutorReplyBody`/`ExpandedTutorReplyBody`
    desde v1.3.0, ahora con un tercer canal de evidencia)."""
    if response_type == TutorResponseType.answer:
        if not answer_chunks and not course_answer_chunks and not general_knowledge_chunks:
            raise ValueError(
                "response_type='answer' requiere al menos un answer_chunk, "
                "course_answer_chunk o general_knowledge_chunk."
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
        if course_answer_chunks:
            raise ValueError(
                f"response_type='{response_type.value}' no debe incluir course_answer_chunks."
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
    pregunta del alumno (v1.3.0, BLOQUE 6 segundo gap-closure; desde
    v1.4.0 Bloque 2, se clasifica en TODAS las consultas, no solo en modo
    ampliado -- ver `StructuredTutorReplyBody`). Reemplaza a
    `relevance_reasoning` (texto libre, `tutor-v3.2.1`): un campo de
    razonamiento libre podía "decir" la conclusión correcta y aun así
    terminar en un `response_type` inconsistente en el mismo objeto
    (observado en QA real con "¿Qué es un LLM?"). Un ENUM cerrado permite
    validar esa consistencia de forma determinística, convirtiendo una
    inconsistencia silenciosa en un error de contrato rechazable y
    reintentable.

    v1.4.0 (Bloque 2): `course_domain` ahora puede estar respaldado por
    evidencia REAL de otro tópico (`course_answer_chunks`, ver COURSE
    EVIDENCE en el prompt) y no solo por el conocimiento general del
    modelo -- la semántica de "pertenece al dominio del curso" no cambió,
    cambió DE QUÉ puede derivarse una respuesta una vez que se pertenece
    a ese dominio (ver `TutorCourseCoverage`)."""

    current_topic = "current_topic"
    course_domain = "course_domain"
    unrelated = "unrelated"


class TutorTopicCoverage(str, Enum):
    """Cuánto de la pregunta puede responderse con evidencia real de
    AUTHORIZED SOURCE (el tópico actual, nunca otro) -- eje
    INDEPENDIENTE de `scope_relation` Y de `course_coverage` (v1.3.0,
    extendido en v1.4.0 Bloque 2). Nunca describe el curso completo --
    para eso existe `TutorCourseCoverage`, un eje separado a propósito
    (PARTE 19 del Bloque 2: nunca deformar esta semántica para que
    también hable del curso)."""

    sufficient = "sufficient"
    partial = "partial"
    insufficient = "insufficient"


class TutorCourseCoverage(str, Enum):
    """Cuánto de la pregunta puede responderse con evidencia real de
    COURSE EVIDENCE (los candidatos recuperados de OTROS tópicos del
    mismo curso, `course_retrieval.search_course`, nunca el tópico
    actual) -- v1.4.0, Bloque 2. Eje INDEPENDIENTE de `topic_coverage`:
    que el retrieval haya devuelto candidatos NO implica
    `sufficient`/`partial` (PARTE 31: "retrieval no garantiza grounding"
    -- el LLM tiene que evaluar si esos bloques recuperados realmente
    sostienen una respuesta, igual que ya hace con `topic_coverage`)."""

    sufficient = "sufficient"
    partial = "partial"
    insufficient = "insufficient"


def _validate_course_grounded_shape(
    *,
    topic_coverage: TutorTopicCoverage,
    course_coverage: TutorCourseCoverage,
    response_type: TutorResponseType,
    answer_chunks: list[GroundedText],
    course_answer_chunks: list[CourseGroundedText],
    general_knowledge_chunks: list[str],
    general_knowledge_used: bool,
) -> None:
    """Invariantes deterministas MODE-INDEPENDIENTES que cruzan
    `topic_coverage`/`course_coverage` con la forma de la respuesta --
    exclusivas de `StructuredTutorReplyBody` (v1.4.0, Bloque 2, corre en
    ambos modos: estricto Y ampliado). Nunca evalúan contenido semántico:
    solo consistencia estructural entre campos que el propio LLM ya
    declaró en la MISMA respuesta.

    Deliberadamente NO valida acá la relación `scope_relation` <->
    `response_type`: esa relación SÍ depende del modo (en estricto,
    scope_relation="unrelated" debe mapear a response_type="not_covered";
    en ampliado, a response_type="unrelated") y por lo tanto vive en
    `tutor_service._validate`, que sí conoce `allow_general_knowledge`
    (ver su docstring para el detalle completo de la matriz)."""
    if response_type == TutorResponseType.clarification:
        # REGLA 18 (pedir aclaración) es una salida ortogonal a la matriz
        # de coverage, igual que en v1.3.0 -- no se cruza con estas
        # invariantes.
        return

    # PARTE 25/27: una fuente NUNCA se cita cuando el propio LLM ya
    # declaró que esa fuente no alcanza -- esto bloquea weak attribution
    # mediante un invariante estructural, sin validador semántico, para
    # AMBOS canales grounded (no solo el tópico actual como en v1.3.0).
    if topic_coverage == TutorTopicCoverage.insufficient and answer_chunks:
        raise ValueError(
            "topic_coverage='insufficient' no debe incluir answer_chunks -- si AUTHORIZED "
            "SOURCE no sostiene realmente la respuesta, esa afirmación va en "
            "course_answer_chunks (si el curso sí alcanza) o en general_knowledge_chunks "
            "(si el modo ampliado está activo), nunca forzada como answer_chunk con una "
            "cita débil."
        )
    if course_coverage == TutorCourseCoverage.insufficient and course_answer_chunks:
        raise ValueError(
            "course_coverage='insufficient' no debe incluir course_answer_chunks -- si "
            "COURSE EVIDENCE no sostiene realmente la respuesta, esa afirmación no se cita "
            "desde otro tópico, nunca forzada como course_answer_chunk con una cita débil "
            "(mismo criterio que answer_chunks/topic_coverage)."
        )

    if response_type != TutorResponseType.answer:
        return  # el resto de las invariantes de esta función solo aplican a "answer"

    if topic_coverage == TutorTopicCoverage.sufficient and not answer_chunks:
        raise ValueError(
            "topic_coverage='sufficient' requiere al menos un answer_chunk grounded."
        )
    if (
        course_coverage == TutorCourseCoverage.sufficient
        and topic_coverage != TutorTopicCoverage.sufficient
        and not course_answer_chunks
    ):
        raise ValueError(
            "course_coverage='sufficient' requiere al menos un course_answer_chunk grounded, "
            "salvo que topic_coverage ya sea 'sufficient' (el tópico actual alcanza por sí "
            "solo -- classificar course_coverage no obliga a usarlo, PARTE 26)."
        )

    # PARTE 24/41 -- prioridad de evidencia: si CUALQUIERA de las dos
    # fuentes curriculares (tópico actual o curso) ya alcanza por
    # completo, conocimiento general nunca es necesario. Aplica en ambos
    # modos: en modo estricto esto ya es imposible de violar (otro
    # invariante, service-level, fuerza general_knowledge_chunks=[]
    # siempre); en modo ampliado es la regla real que evita
    # "conocimiento general innecesario" cuando el curso ya alcanza.
    if (
        topic_coverage == TutorTopicCoverage.sufficient
        or course_coverage == TutorCourseCoverage.sufficient
    ) and (general_knowledge_chunks or general_knowledge_used):
        raise ValueError(
            "Si topic_coverage o course_coverage ya es 'sufficient', general_knowledge_chunks "
            "debe quedar vacío (general_knowledge_used=false) -- no agregues conocimiento "
            "general cuando la evidencia curricular ya alcanza por completo."
        )


class StructuredTutorReplyBody(BaseModel):
    """Modelo INTERNO usado como `response_model` de TODA llamada LLM del
    tutor (v1.4.0, Bloque 2: reemplaza a `ExpandedTutorReplyBody`, que
    solo se usaba en modo ampliado) -- NUNCA se expone en la API pública
    (el router sigue declarando `response_model=TutorReplyBody`;
    `tutor_service.ask_tutor` convierte el resultado antes de devolverlo,
    ver `tutor_service._to_public_reply`).

    Por qué ahora se usa en AMBOS modos (estricto y ampliado): desde este
    bloque, el retrieval course-wide corre en CADA consulta
    (`course_retrieval.search_course`, sin importar el switch) -- el
    switch "Ampliar con conocimiento general" deja de controlar si se
    usa evidencia de otros tópicos del curso (eso ahora es incondicional)
    y pasa a controlar EXCLUSIVAMENTE si se puede usar conocimiento
    general del modelo cuando ni el tópico actual ni el resto del curso
    alcanzan. Como `scope_relation`/`topic_coverage` ya necesitaban
    clasificarse en modo ampliado (v1.3.0) y ahora hace falta la MISMA
    clasificación en modo estricto (para decidir si usar
    `course_answer_chunks`), dejó de tener sentido mantener dos modelos
    de respuesta distintos -- un único schema, con reglas de legalidad de
    `response_type` que sí dependen del modo (ver
    `tutor_service._validate`).

    Orden de campos (PARTE 20 del Bloque 2, mismo principio que
    `tutor-v3.3`): `scope_relation` -> `topic_coverage` ->
    `course_coverage` -> `response_type` -> chunks. Cada clasificación se
    completa ANTES de la siguiente y ANTES de decidir cómo se arma la
    respuesta -- nunca al revés."""

    scope_relation: TutorScopeRelation = Field(
        description=(
            "Clasificación cerrada (NO explicación): 'current_topic' si la pregunta es "
            "sobre el tema de AUTHORIZED SOURCE; 'course_domain' si no es del tópico actual "
            "pero pertenece razonablemente al dominio educativo amplio del curso -- ya sea "
            "porque COURSE EVIDENCE trae contenido real de otro tópico, o porque "
            "razonablemente pertenece a fundamentos/conceptos adyacentes/herramientas de ese "
            "dominio (ver REGLA 20/21/22); 'unrelated' solo si es CLARAMENTE ajena a ambos. "
            "Completá este campo PRIMERO, antes de cualquier otro campo."
        )
    )
    topic_coverage: TutorTopicCoverage = Field(
        description=(
            "Clasificación cerrada de cuánto cubre AUTHORIZED SOURCE (el tópico actual, "
            "nunca otro) la respuesta: 'sufficient' si alcanza por completo; 'partial' si "
            "alcanza para una parte real; 'insufficient' si no alcanza o alcanza solo de "
            "forma tangencial/superficial (una mención de pasada NO cuenta como coverage). "
            "Completá este campo SEGUNDO."
        )
    )
    course_coverage: TutorCourseCoverage = Field(
        description=(
            "Clasificación cerrada de cuánto cubre COURSE EVIDENCE (bloques reales de OTROS "
            "tópicos del mismo curso, si aparece ese bloque en el mensaje) la parte de la "
            "respuesta que AUTHORIZED SOURCE no cubre: 'sufficient'/'partial'/'insufficient', "
            "mismo criterio estricto que topic_coverage (una mención de pasada NO cuenta). "
            "Que existan candidatos en COURSE EVIDENCE no implica 'sufficient' ni 'partial' -- "
            "evaluá si realmente sostienen una respuesta. Si no aparece ningún bloque COURSE "
            "EVIDENCE en el mensaje, usá 'insufficient'. Completá este campo TERCERO, antes de "
            "response_type."
        )
    )
    response_type: TutorResponseType
    answer_chunks: list[GroundedText] = Field(default_factory=list)
    course_answer_chunks: list[CourseGroundedText] = Field(default_factory=list)
    general_knowledge_chunks: list[str] = Field(default_factory=list)
    clarification_question: str | None = Field(default=None, max_length=300)
    general_knowledge_used: bool = False

    @model_validator(mode="after")
    def _validate_shape_by_response_type(self) -> "StructuredTutorReplyBody":
        # Orden importa para la CALIDAD del mensaje de corrección (lección
        # de tutor-v3.3, PARTE 31 del Bloque 2: "no cambiar orden salvo
        # bug demostrado"): las invariantes de coverage corren ANTES que
        # el chequeo genérico de forma, para que una inconsistencia real
        # señale su causa raíz (qué coverage se declaró) en vez de un
        # síntoma más fácil de "corregir" sin resolver el problema de
        # fondo.
        _validate_course_grounded_shape(
            topic_coverage=self.topic_coverage,
            course_coverage=self.course_coverage,
            response_type=self.response_type,
            answer_chunks=self.answer_chunks,
            course_answer_chunks=self.course_answer_chunks,
            general_knowledge_chunks=self.general_knowledge_chunks,
            general_knowledge_used=self.general_knowledge_used,
        )
        _validate_tutor_reply_shape(
            response_type=self.response_type,
            answer_chunks=self.answer_chunks,
            course_answer_chunks=self.course_answer_chunks,
            general_knowledge_chunks=self.general_knowledge_chunks,
            clarification_question=self.clarification_question,
            general_knowledge_used=self.general_knowledge_used,
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
