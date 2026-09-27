"""TutorInteractionPolicy — política de interacción determinística
(v1.8.0, Bloque 4: "ADAPTIVE INTERACTION & FORMATIVE MICRO-CHECKS").

Decide, de forma 100% determinística, CUÁNDO es pedagógicamente razonable
que el Tutor ofrezca una comprobación formativa (micro-check) -- nunca
QUÉ pregunta hacer (eso lo redacta el LLM, grounded) ni CUÁNDO el alumno
la responde bien (eso lo evalúa `tutor_microcheck_feedback_service.py`,
también con el LLM, nunca acá).

Deliberadamente PEQUEÑO (PARTE 7 de la especificación: "debe ser
pequeño... no introducir otro sistema pedagógico grande"): se deriva
EXCLUSIVAMENTE de `TutorTeachingPolicy.comprehension_check` (ya calculado
en v1.8.0 Bloque 3) -- nunca vuelve a leer `LearningProfile`, evidencia de
DB ni historial de Certification directamente (PARTE 8). Se auditó si
`progression_mode` aportaba algo real a esta decisión y se concluyó que
no: `comprehension_check` ya encapsula la misma señal subyacente
(status + reason_code) con el nivel de granularidad exacto que esta
política necesita -- agregar una segunda dimensión de entrada no cambiaría
ningún mapeo, solo el input de la función.

Reglas duras:
- Función pura: sin DB, sin `Request`, sin LLM, sin `datetime.now()`, sin
  `random` (PARTE 11: nunca "preguntar el 30% de las veces"). La misma
  entrada produce siempre la misma salida.
- Nunca agrega contadores/scores de interacción (PARTE 12: nada de
  "engagement score"/"confidence"/"interaction score").
- `max_micro_checks` es una invariante GLOBAL fija (siempre 1, PARTE 14),
  no una decisión pedagógica variable -- vive en el modelo como
  documentación explícita del contrato, no como un valor que este builder
  calcule de forma distinta según el contexto.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel

from app.services.tutor_teaching_policy import ComprehensionCheck, TutorTeachingPolicy


class MicroCheckMode(str, Enum):
    """Cuán proactivo debe ser el Tutor al ofrecer un micro-check:
    "encouraged" = proponé uno si la explicación se presta naturalmente;
    "optional" = podés proponer uno, sin insistir;
    "on_request_only" = solo generá uno si el alumno lo pide
    explícitamente (REGLA de prompt, ver app/prompts/tutor.py)."""

    encouraged = "encouraged"
    optional = "optional"
    on_request_only = "on_request_only"


class TutorInteractionPolicy(BaseModel):
    max_micro_checks: Literal[1] = 1
    micro_check_mode: MicroCheckMode


# PARTE 10: mapeo determinístico, 1 a 1, sin ambigüedad.
_MODE_BY_COMPREHENSION_CHECK: dict[ComprehensionCheck, MicroCheckMode] = {
    ComprehensionCheck.encouraged: MicroCheckMode.encouraged,
    ComprehensionCheck.optional: MicroCheckMode.optional,
    ComprehensionCheck.minimal: MicroCheckMode.on_request_only,
}


def build_tutor_interaction_policy(
    teaching_policy: TutorTeachingPolicy | None,
) -> TutorInteractionPolicy | None:
    """Función pura: `TutorTeachingPolicy -> TutorInteractionPolicy | None`.
    0 SQL, 0 Session, 0 HTTP, 0 llamadas a un proveedor LLM, 0 side
    effects, 0 randomness.

    `teaching_policy=None` (sin contexto adaptativo resuelto, ver v1.8.0
    Bloque 2/3) devuelve `None`: sin política de enseñanza, tampoco hay
    política de interacción -- el prompt omite el bloque INTERACTION
    POLICY por completo, comportamiento idéntico a no tener Bloque 4."""
    if teaching_policy is None:
        return None
    return TutorInteractionPolicy(
        micro_check_mode=_MODE_BY_COMPREHENSION_CHECK[teaching_policy.comprehension_check]
    )
