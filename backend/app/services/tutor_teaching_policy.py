"""TutorTeachingPolicy — política pedagógica determinística (v1.8.0,
Bloque 3: "DETERMINISTIC ADAPTIVE TEACHING POLICY").

El QA real de Bloque 2 demostró algo importante: `TutorLearningContext`
llega correctamente al LLM y lo influye, pero un prompt en prosa libre
("REGLA 24: si needs_review, reforzá fundamentos...") no siempre se
traduce en una estrategia pedagógica consistente -- un tópico corto con
`temperature=0` puede converger a la misma extracción grounded sin
importar el contexto, y la dirección observada en un tópico más rico no
siempre coincidió con la lectura ideal de la regla. Esto NO es un bug del
modelo: es un límite de "steerability" (qué tan bien un LLM sigue una
instrucción de tono/prosa) inherente a instrucciones en lenguaje natural.

La respuesta de este bloque NO es agregar más prosa, ni un segundo LLM,
ni un "LLM judge", ni una heurística post-hoc que puntúe la respuesta ya
generada. La respuesta es mover la DECISIÓN de estrategia -- nunca su
EXPRESIÓN -- a código determinístico:

    LearningProfile (PostgreSQL, v1.7.0 Bloque 4)
        -> TutorLearningContext (v1.8.0 Bloque 1)
        -> TutorTeachingPolicy (este módulo, Bloque 3) -- QUÉ estrategia
        -> Tutor Prompt (app/prompts/tutor.py, tutor-v6) -- instrucción de sistema
        -> LLM -- CÓMO expresar esa estrategia en español natural

Principio no negociable (idéntico en espíritu a Bloque 1/2): el LLM
nunca decide qué política corresponde a un alumno, igual que nunca decide
su `LearningState`. Este módulo es la única autoridad para esa decisión
-- 100% determinística, sin LLM, sin DB, sin randomness, sin side
effects. La única entrada es `TutorLearningContext` (ya derivado); la
única salida es `TutorTeachingPolicy | None`.

Reglas duras:
- `current_topic.status` (`LearningStateStatus`) es la señal PRIMARIA.
  `reason_code` solo MODULA una dimensión puntual (nunca reemplaza la
  política base ni reclasifica el status -- ver `_apply_reason_code_modulation`).
- `review_topics`/`course_summary` NUNCA participan de esta política: son
  contexto de apoyo sobre OTROS tópicos, nunca alteran la estrategia del
  tópico actual (ver `app/services/tutor_learning_context.py`).
- `current_topic=None` (caso defensivo, ver Bloque 1 PARTE 44) nunca
  produce una política inventada a partir de un estado que no existe:
  usa `STANDARD_FALLBACK_POLICY`, una política neutral y no-asuntiva.
- `learning_context=None` (sin identidad resuelta, ver Bloque 2) produce
  `None`: sin contexto, sin política -- el prompt omite el bloque por
  completo, comportamiento idéntico a no tener Bloque 3 en absoluto.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel

from app.services.learning_state import LearningStateReasonCode, LearningStateStatus
from app.services.tutor_learning_context import TutorLearningContext


class ScaffoldLevel(str, Enum):
    """Cuánto apoyo estructural dar en la explicación. Orden de más a
    menos apoyo: foundation > guided > standard > minimal (ver
    `SCAFFOLD_LEVEL_RANK`, que hace esa relación explícita y verificable
    en código -- no solo documentada en prosa)."""

    foundation = "foundation"
    guided = "guided"
    standard = "standard"
    minimal = "minimal"


class ExplanationDepth(str, Enum):
    foundational = "foundational"
    standard = "standard"
    advanced = "advanced"


class PrerequisiteReinforcement(str, Enum):
    required = "required"
    when_relevant = "when_relevant"
    minimal = "minimal"


class ExampleComplexity(str, Enum):
    basic = "basic"
    intermediate = "intermediate"
    advanced = "advanced"


class ComprehensionCheck(str, Enum):
    encouraged = "encouraged"
    optional = "optional"
    minimal = "minimal"


class ProgressionMode(str, Enum):
    reinforce_before_advancing = "reinforce_before_advancing"
    balanced = "balanced"
    advance_when_relevant = "advance_when_relevant"


class TutorTeachingPolicy(BaseModel):
    """Seis dimensiones pedagógicas cerradas (PARTE B/8 de la
    especificación: "preferir 4-6 dimensiones simples antes que modelo
    complejo"). Se auditaron las seis propuestas originalmente y se
    mantuvieron todas: cada una corresponde a un concepto operativo
    distinto que aparece explícitamente en la tabla de mapeo (PARTE C) y
    ninguna es derivable de otra sin perder información real (`scaffold_level`
    es "cuánto apoyo dar AHORA", `progression_mode` es "cuándo avanzar
    AL SIGUIENTE concepto" -- correlacionados pero no intercambiables)."""

    scaffold_level: ScaffoldLevel
    explanation_depth: ExplanationDepth
    prerequisite_reinforcement: PrerequisiteReinforcement
    example_complexity: ExampleComplexity
    comprehension_check: ComprehensionCheck
    progression_mode: ProgressionMode


# Relación de orden explícita y verificable en código (PASO 70: "esto sí
# debe ser deterministically provable ahora") -- de más a menos apoyo
# estructural. Nunca se usa para RECALCULAR una política, solo para que
# los tests (y cualquier auditoría futura) puedan afirmar "needs_review
# tiene más scaffold que mastered" sin comparar strings arbitrariamente.
SCAFFOLD_LEVEL_RANK: dict[ScaffoldLevel, int] = {
    ScaffoldLevel.minimal: 0,
    ScaffoldLevel.standard: 1,
    ScaffoldLevel.guided: 2,
    ScaffoldLevel.foundation: 3,
}


# PARTE C (11-14): mapeo base por `learning_status`. Curricular/pedagógico,
# nunca psicológico (PARTE 15) -- "mastered" no significa "experto", ni
# "needs_review" "principiante", ni "not_started" "baja capacidad": cada
# valor describe una estrategia de ENSEÑANZA, no un juicio sobre la
# persona.
_BASE_POLICY_BY_STATUS: dict[LearningStateStatus, TutorTeachingPolicy] = {
    "not_started": TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.foundation,
        explanation_depth=ExplanationDepth.foundational,
        prerequisite_reinforcement=PrerequisiteReinforcement.when_relevant,
        example_complexity=ExampleComplexity.basic,
        comprehension_check=ComprehensionCheck.optional,
        progression_mode=ProgressionMode.reinforce_before_advancing,
    ),
    "progressing": TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.guided,
        explanation_depth=ExplanationDepth.standard,
        prerequisite_reinforcement=PrerequisiteReinforcement.when_relevant,
        example_complexity=ExampleComplexity.intermediate,
        comprehension_check=ComprehensionCheck.optional,
        progression_mode=ProgressionMode.balanced,
    ),
    "needs_review": TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.foundation,
        explanation_depth=ExplanationDepth.foundational,
        prerequisite_reinforcement=PrerequisiteReinforcement.when_relevant,
        example_complexity=ExampleComplexity.basic,
        comprehension_check=ComprehensionCheck.encouraged,
        progression_mode=ProgressionMode.reinforce_before_advancing,
    ),
    "mastered": TutorTeachingPolicy(
        scaffold_level=ScaffoldLevel.minimal,
        explanation_depth=ExplanationDepth.advanced,
        prerequisite_reinforcement=PrerequisiteReinforcement.minimal,
        example_complexity=ExampleComplexity.advanced,
        comprehension_check=ComprehensionCheck.minimal,
        progression_mode=ProgressionMode.advance_when_relevant,
    ),
}


# PARTE D (16-24): reason_code MODULA, nunca reemplaza. Solo dos códigos
# ("LOW_CERTIFICATION_SCORE"/"REPEATED_LOW_CERTIFICATION_SCORE", los
# únicos que `derive_topic_learning_state` -- app/services/learning_state.py
# -- alguna vez pairea con status="needs_review") mueven una dimensión;
# el resto son no-ops EXPLÍCITOS y documentados, no omisiones:
#   - NOT_STARTED: PASO 17, "sin cambio especial adicional".
#   - STARTED_NOT_COMPLETED/MEDIUM_CERTIFICATION_SCORE (progressing):
#     PASO 18/22, la política base de "progressing" ya es
#     "continuity-oriented"/"moderate scaffold" -- no hace falta otra.
#   - COMPLETED_NO_ASSESSMENT (progressing): PASO 19, la política base de
#     "progressing" NUNCA usa los valores de "mastered" (scaffold_level
#     mínimo, etc.) -- ya no asume mastery por construcción, sin
#     necesidad de un ajuste adicional.
#   - HIGH_CERTIFICATION_SCORE (mastered): PASO 23, la política base de
#     "mastered" YA tiene el scaffold_level más bajo posible -- no hay
#     margen para "disminuir" más, y el status sigue siendo la autoridad
#     final (PASO 24: nunca se recalcula el status acá).
# LOW/REPEATED_LOW llevan `prerequisite_reinforcement` a su valor máximo
# ("required") -- el mismo techo para ambos, deliberadamente (PASO 21:
# REPEATED_LOW debe ser "el máximo reinforcement permitido por policy",
# nunca menos que LOW; con un techo cerrado de 3 valores, ambos llegan al
# mismo límite superior en vez de inventar un cuarto valor sin
# justificación pedagógica real -- ver test que confirma que REPEATED_LOW
# nunca es "menos" que LOW en ninguna dimensión).
_REQUIRED_PREREQUISITE_REASON_CODES: frozenset[str] = frozenset(
    {"LOW_CERTIFICATION_SCORE", "REPEATED_LOW_CERTIFICATION_SCORE"}
)


def _apply_reason_code_modulation(
    policy: TutorTeachingPolicy, reason_code: LearningStateReasonCode
) -> TutorTeachingPolicy:
    if reason_code in _REQUIRED_PREREQUISITE_REASON_CODES:
        return policy.model_copy(
            update={"prerequisite_reinforcement": PrerequisiteReinforcement.required}
        )
    return policy


# PARTE O (82): `current_topic=None` (curriculum inconsistente entre la
# resolución del tópico actual y la del profile, caso defensivo ya
# documentado en Bloque 1 PARTE 44) nunca inventa un `learning_status` --
# usa esta política neutral, explícitamente NO-asuntiva: ni asume que el
# alumno domina el tema, ni que lo necesita repasar con urgencia.
STANDARD_FALLBACK_POLICY = TutorTeachingPolicy(
    scaffold_level=ScaffoldLevel.standard,
    explanation_depth=ExplanationDepth.standard,
    prerequisite_reinforcement=PrerequisiteReinforcement.when_relevant,
    example_complexity=ExampleComplexity.intermediate,
    comprehension_check=ComprehensionCheck.optional,
    progression_mode=ProgressionMode.balanced,
)


def build_tutor_teaching_policy(
    learning_context: TutorLearningContext | None,
) -> TutorTeachingPolicy | None:
    """Función pura: `TutorLearningContext -> TutorTeachingPolicy | None`.
    0 SQL, 0 Session, 0 HTTP, 0 llamadas a un proveedor LLM, 0 side
    effects, 0 randomness -- la misma entrada produce siempre la misma
    salida (PARTE G: `build_tutor_teaching_policy(x) ==
    build_tutor_teaching_policy(x)` para cualquier `x`).

    `learning_context=None` (sin identidad resuelta -- ver
    `tutor_service._resolve_learning_context`, Bloque 2) devuelve `None`:
    sin contexto, no hay política, el prompt omite el bloque por completo
    (mismo criterio que Bloque 2 ya aplicaba a `ADAPTIVE LEARNING
    CONTEXT`)."""
    if learning_context is None:
        return None

    current = learning_context.current_topic
    if current is None:
        return STANDARD_FALLBACK_POLICY

    base_policy = _BASE_POLICY_BY_STATUS[current.status]
    return _apply_reason_code_modulation(base_policy, current.reason_code)
