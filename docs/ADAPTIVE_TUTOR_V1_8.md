# Adaptive Tutor — v1.8.0, Bloque 1: Context Foundation

Este documento describe exclusivamente el **Bloque 1** de v1.8.0
("ADAPTIVE TUTOR CONTEXT FOUNDATION"): una fundación de datos
determinística que un futuro Tutor adaptativo podrá usar. **Este bloque
no cambia el comportamiento del Tutor actual** (`tutor-v4`, sin cambios)
ni envía ningún dato nuevo a un LLM.

## Principio no negociable

> El LLM nunca decide `LearningState`.

`LearningState` (estado de aprendizaje de un alumno en un tópico) sigue
siendo, exactamente como desde v1.7.0 Bloque 4, un cálculo 100%
determinístico derivado de evidencia real en PostgreSQL
(`topic_progress` + `certification_attempts`), sin ningún LLM
involucrado. Bloque 1 no agrega un estado nuevo, no recalcula
`recent_average`, y no introduce ningún camino por el cual un modelo de
lenguaje pueda influir en ese cálculo.

## Flujo de datos aprobado

```
PostgreSQL (topic_progress + certification_attempts)
    ↓  learning_profile_service.get_learning_profile (v1.7.0 Bloque 4)
LearningProfile  (LearningState[] determinístico, nunca persistido)
    ↓  tutor_learning_context_service.build (v1.8.0 Bloque 1, este documento)
TutorLearningContext  (contexto acotado, sin PII, sin evidencia cruda)
    ↓  (futuro Bloque 2 -- NO implementado en Bloque 1)
Tutor LLM
```

Explícitamente prohibido en este bloque (y en cualquier bloque futuro,
salvo decisión explícita en contrario):

```
LLM
  ↓  "creo que este usuario domina X"
  ↓
mastered
```

## Qué es `TutorLearningContext`

Definido en `backend/app/services/tutor_learning_context.py`:

```python
class TutorCurrentTopicContext(BaseModel):
    module_id: str
    topic_id: str
    status: LearningStateStatus          # not_started | progressing | needs_review | mastered
    reason_code: LearningStateReasonCode  # uno de los 7 ya existentes, sin agregar ninguno nuevo
    recent_average: float | None
    observation_count: int

class TutorReviewTopic(BaseModel):
    module_id: str
    topic_id: str
    module_title: str
    topic_title: str
    status: LearningStateStatus           # solo needs_review | progressing (nunca mastered/not_started)
    reason_code: LearningStateReasonCode
    recent_average: float | None

class TutorCourseSummary(BaseModel):
    total_topics: int
    not_started: int
    progressing: int
    needs_review: int
    mastered: int

class TutorLearningContext(BaseModel):
    course_id: str
    current_topic: TutorCurrentTopicContext | None
    course_summary: TutorCourseSummary
    review_topics: list[TutorReviewTopic]  # acotado a MAX_REVIEW_TOPICS = 5
```

`current_topic` es `None` únicamente cuando el `(module_id, topic_id)`
solicitado no pertenece al curriculum real resuelto por el
`LearningProfile` (caso defensivo; el llamador decide qué hacer, igual
que otros puntos ya existentes del Tutor que devuelven `None` sin romper
el flujo, ej. `tutor_service._resolve_scene_context`).

## Selección/minimización de `review_topics`

- Reutiliza **exactamente** `get_review_candidates` (`app/services/
  learning_state.py`), ya expuesto desde v1.7.0 Bloque 4 explícitamente
  "para uso interno futuro (ej. Adaptive Tutor)". Ningún ranking nuevo.
- Orden: `needs_review` antes que `progressing`, desempate por el orden
  curricular real (nunca alfabético, nunca por score).
- `mastered`/`not_started` nunca aparecen en `review_topics` (no son
  candidatos a repaso por definición del método reutilizado).
- El tópico actual se excluye siempre de su propia lista de repaso.
- Tope fijo `MAX_REVIEW_TOPICS = 5` — un objetivo/límite, nunca un
  mínimo: un curso sin candidatos reales produce una lista vacía, nunca
  rellenada artificialmente.
- **Sin similaridad semántica, sin embeddings, sin vector DB, sin
  ranking por LLM** — la única señal es la evidencia ya derivada por
  `LearningProfileService`.

## Privacidad

`TutorLearningContext` nunca contiene:

- Identidad: `app_user.id`, email, `display_name`, `subject`, `issuer`,
  `tenant_id`, `external_object_id`, el header `X-Dev-User`, ni ningún
  dato de autenticación.
- Evidencia cruda de Certification: `answers`, answer key,
  `question_results`, `practice_id`, timestamps de intentos individuales.
- Conversación del Tutor (`recent_history`, mensajes del alumno).

Un test de contrato (`test_tutor_learning_context.py::TestPrivacyContract`)
serializa el modelo completo a JSON y confirma la ausencia de cada uno
de estos términos como substring, cubriendo también metadata anidada que
se agregue a futuro sin querer.

## Arquitectura del builder

Espejo intencional del par ya establecido en v1.7.0 Bloque 4:

| Rol | v1.7.0 Bloque 4 | v1.8.0 Bloque 1 |
|---|---|---|
| Core puro (sin DB/LLM) | `app/services/learning_state.py` | `app/services/tutor_learning_context.py` |
| Orquestador delgado (Settings/Session/user_id) | `app/services/learning_profile_service.py` | `app/services/tutor_learning_context_service.py` |

`tutor_learning_context_service.build(*, settings, session, user_id,
course_id, module_id, topic_id)` resuelve el `LearningProfile` vía
`learning_profile_service.get_learning_profile` — **nunca** consulta
`topic_progress`/`certification_attempts` directamente ni reinterpreta
esa evidencia con una fórmula distinta. Está diseñado para que un futuro
`TutorService` (Bloque 2) lo invoque en-proceso, sin HTTP y sin
refactor, con la misma forma de parámetros que
`learning_profile_service.get_learning_profile` más
`module_id`/`topic_id`.

Un fallo real de infraestructura (Postgres caído, curso inexistente)
**se propaga como excepción real** — nunca se atrapa para devolver un
`TutorLearningContext` vacío o por defecto disfrazado de "alumno sin
progreso" (ver `test_db_failure_never_produces_a_fake_default_context`).

## Qué NO cambia en este bloque

- `tutor-v4` (prompt, contrato `TutorRequest`/`TutorReplyBody`,
  comportamiento del Tutor) — sin cambios.
- El frontend (`useTutor.ts`, `TutorPanel`, `TutorConversation`) — sin
  cambios; no necesita conocer `TutorLearningContext` todavía.
- Lesson Generation, Certification, reglas de `LearningState`, Guided
  Review, Recommendations — sin cambios.
- `TutorLearningContext` **no llega a ningún LLM todavía**. No existe
  ningún endpoint público que lo expone (decisión explícita: los tests
  ya prueban el comportamiento determinístico; no se agregó un endpoint
  de debug nuevo para esto).

## Punto de integración futuro (Bloque 2, no implementado)

Cuando exista `TutorService`, el punto natural de inyección es
`build_tutor_messages`/`build_tutor_user_prompt`
(`backend/app/prompts/tutor.py`), que hoy ya compone bloques de contexto
separados y explícitamente marcados como no autoritativos (historial,
contexto de escena, `CourseScope`, `COURSE EVIDENCE`) antes del
`AUTHORIZED SOURCE`. Un futuro bloque `ADAPTIVE CONTEXT` seguiría el
mismo patrón — datos citables, nunca instrucciones, nunca por encima del
Grounding Packet como fuente de verdad — pero esa integración es
explícitamente responsabilidad de un bloque futuro, no de este.

## Limitaciones conocidas (honestas)

- El único caller de `tutor_learning_context_service.build` hoy son sus
  propios tests — no hay wiring hacia el Tutor real ni hacia ningún
  endpoint HTTP en este bloque.
- `review_topics` no distingue "tópicos del mismo módulo" de "tópicos de
  otros módulos" — se consideró una heurística de proximidad por módulo
  y se descartó por no haber una definición determinística no inventada
  que agregara valor real sobre el orden ya provisto por
  `get_review_candidates`.
- No hay cache: cada llamada recalcula el `LearningProfile` completo
  (mismo costo ya aceptado por `GET .../learning-profile` desde v1.7.0).
