# Adaptive Tutor — v1.8.0

Este documento describe la evolución del Tutor hacia "Adaptive Tutor" a
lo largo de v1.8.0, en bloques incrementales:

- **Bloque 1 — Context Foundation** (ver más abajo): una fundación de
  datos determinística (`TutorLearningContext`), sin ningún cambio de
  comportamiento del Tutor y sin enviar nada a un LLM todavía.
- **Bloque 2 — Adaptive Tutor Prompting** (sección dedicada más abajo):
  primera integración real de `TutorLearningContext` en el prompt del
  Tutor (`tutor-v5`) -- el Tutor empieza a adaptar CÓMO enseña, nunca QUÉ
  sabe el alumno.

## Bloque 1: Context Foundation

Esta sección describe exclusivamente el **Bloque 1** de v1.8.0
("ADAPTIVE TUTOR CONTEXT FOUNDATION"): una fundación de datos
determinística que un futuro Tutor adaptativo podrá usar. **Este bloque
no cambia el comportamiento del Tutor actual** (`tutor-v4`, sin cambios)
ni envía ningún dato nuevo a un LLM.

### Principio no negociable

> El LLM nunca decide `LearningState`.

`LearningState` (estado de aprendizaje de un alumno en un tópico) sigue
siendo, exactamente como desde v1.7.0 Bloque 4, un cálculo 100%
determinístico derivado de evidencia real en PostgreSQL
(`topic_progress` + `certification_attempts`), sin ningún LLM
involucrado. Bloque 1 no agrega un estado nuevo, no recalcula
`recent_average`, y no introduce ningún camino por el cual un modelo de
lenguaje pueda influir en ese cálculo.

### Flujo de datos aprobado (Bloque 1)

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

### Qué es `TutorLearningContext`

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

### Selección/minimización de `review_topics`

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

### Privacidad (Bloque 1: el modelo de datos en sí)

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

### Arquitectura del builder

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

### Qué NO cambiaba en Bloque 1 (histórico -- ver Bloque 2 para el estado actual)

- `tutor-v4` (prompt, contrato `TutorRequest`/`TutorReplyBody`,
  comportamiento del Tutor) — sin cambios EN BLOQUE 1 (Bloque 2 sí lo
  cambia: ver más abajo, `tutor-v5`).
- El frontend (`useTutor.ts`, `TutorPanel`, `TutorConversation`) — sin
  cambios en Bloque 1 NI en Bloque 2 (ver PARTE 84/85 del Bloque 2).
- Lesson Generation, Certification, reglas de `LearningState`, Guided
  Review, Recommendations — sin cambios en ningún bloque de v1.8.0.
- En Bloque 1, `TutorLearningContext` no llegaba a ningún LLM todavía, y
  no existía ningún endpoint público que lo expusiera.

### Punto de integración (implementado en Bloque 2)

La sección de Bloque 1 originalmente anticipaba este punto de inyección
como trabajo futuro; el Bloque 2 (ver abajo) lo implementó exactamente
como se preveía: `build_tutor_messages`/`build_tutor_user_prompt`
(`backend/app/prompts/tutor.py`) ganaron un parámetro
`learning_context: TutorLearningContext | None`, siguiendo el mismo
patrón que los bloques ya existentes (historial, contexto de escena,
`CourseScope`, `COURSE EVIDENCE`) — datos citables o no-citables según
corresponda, nunca instrucciones, nunca por encima del Grounding Packet
como fuente de verdad.

### Limitaciones conocidas del Bloque 1 (resueltas o reevaluadas en Bloque 2)

- ~~El único caller de `tutor_learning_context_service.build` hoy son sus
  propios tests~~ -- resuelto en Bloque 2: `tutor_service.ask_tutor` es
  ahora un caller real (vía `_resolve_learning_context`), invocado desde
  el router productivo `POST .../tutor`.
- `review_topics` sigue sin distinguir "tópicos del mismo módulo" de
  "tópicos de otros módulos" -- se mantiene la misma decisión: no hay una
  definición determinística no inventada que agregue valor real sobre el
  orden ya provisto por `get_review_candidates`.
- Sigue sin cache (Bloque 2 confirma que el Tutor nunca cacheó
  respuestas, así que esto no es una limitación nueva -- ver su sección
  "Cache" más abajo).

---

## Bloque 2: Adaptive Tutor Prompting

Esta sección describe el **Bloque 2** de v1.8.0 ("ADAPTIVE TUTOR
PROMPTING"): primera vez que `TutorLearningContext` (Bloque 1) llega
realmente al LLM, dentro del prompt del Tutor. Bump de versión:
`tutor-v4` → **`tutor-v5`**.

### Principio central

> El LLM adapta **CÓMO enseñar**. El LLM nunca decide **QUÉ sabe el
> alumno**.

`LearningState` sigue siendo, exactamente igual que en Bloque 1 y en
v1.7.0 Bloque 4, un cálculo 100% determinístico sobre PostgreSQL. Este
bloque no le agrega al LLM ninguna forma de leer, escribir o influir
sobre esa base de datos: solo le entrega, como metadata de solo lectura,
el resultado YA CALCULADO, para que ajuste tono y profundidad.

### `TutorService`: punto de integración

`app/services/tutor_service.py::ask_tutor` gana dos parámetros nuevos,
**opcionales** (`session: Session | None = None`, `user_id: uuid.UUID |
None = None`):

```python
def _resolve_learning_context(*, settings, session, user_id, course_id, module_id, topic_id):
    if session is None or user_id is None:
        return None
    return tutor_learning_context_service.build(
        settings=settings, session=session, user_id=user_id,
        course_id=course_id, module_id=module_id, topic_id=topic_id,
    )
```

- **Server-side only** (PARTE 7-9): `ask_tutor` llama directamente a
  `tutor_learning_context_service.build` (Bloque 1) -- nunca HTTP, nunca
  una segunda llamada al propio backend.
- **Opcionales por diseño, no por descuido**: igual que el parámetro
  `provider: LLMProvider | None` ya existente, `session`/`user_id`
  permiten que los tests que ejercitan `ask_tutor` de forma aislada
  (`test_tutor_service.py`, `test_tutor_course_grounding.py`,
  `test_tutor_expanded_relevance.py`, `test_tutor_prompt_injection.py`,
  `test_tutor_plain_text.py` -- ninguno tocado en Bloque 2) sigan
  funcionando exactamente igual que en tutor-v4, sin ningún bloque
  adaptativo. El único caller PRODUCTIVO (`app/routers/courses.py`)
  **siempre** provee ambos, así que en producción el Tutor real SIEMPRE
  intenta resolver contexto adaptativo.
- **Se resuelve SIEMPRE, sin importar `allow_general_knowledge`** (mismo
  principio que `CourseScope`/`COURSE EVIDENCE` desde v1.4.0 Bloque 2):
  el switch de conocimiento general nunca controló esto tampoco.
- **No atrapa excepciones** (a diferencia de `_resolve_scene_context`/
  `_resolve_course_scope`, que sí lo hacen): un fallo real de Postgres
  durante la resolución del contexto se propaga tal cual, exactamente
  igual que `_resolve_course_evidence` ya hacía.

### Identidad / current user

El router (`app/routers/courses.py::ask_topic_tutor`) gana las mismas dos
dependencias que `GET .../learning-profile` ya usa:

```python
def ask_topic_tutor(
    ...,
    session: Session = Depends(get_db_session),
    user: AppUser = Depends(get_current_app_user),
) -> TutorReplyBody:
    ...
    return tutor_service.ask_tutor(..., session=session, user_id=user.id)
```

Mismo trust boundary que el resto de la aplicación desde v1.7.0: nunca
se acepta un `user_id` del request. `AUTH_MODE=dev` sigue resolviendo un
usuario dev estable (`X-Dev-User` opcional) exactamente igual que en
cualquier otro endpoint identificado.

### Contrato del frontend: sin cambios (PARTE 10/84/85)

`TutorRequest` no ganó ningún campo. El frontend (`useTutor.ts`,
`TutorPanel`, `TutorConversation`) sigue enviando exactamente lo mismo
que en tutor-v4: `message`/`scene_id`/`recent_history`/
`allow_general_knowledge`. Cero cambios de UI. `TutorReplyBody` (la
respuesta pública) tampoco ganó ningún campo -- el alumno no ve
`learning_status`/`reason_code`/estrategia en la respuesta HTTP; la
adaptación ocurre exclusivamente dentro del prompt enviado al LLM.

**Client tampering estructuralmente imposible**: `TutorRequest` no
declara `learning_status`/`reason_code`/`recent_average`/`mastery`, así
que Pydantic (`extra="ignore"` por default) descarta silenciosamente
cualquier intento del cliente de enviarlos --
`test_tutor_request_schema_has_no_learning_state_fields` y
`test_tutor_client_cannot_inject_learning_state_via_extra_fields` lo
confirman: el estado real, resuelto server-side, nunca coincide con lo
que un cliente malicioso intenta inyectar.

### `tutor-v5`: qué se agregó al prompt

**Versión**: `TUTOR_PROMPT_VERSION` `tutor-v4` → `tutor-v5`
(`app/prompts/tutor.py`). Como el Tutor nunca se cachea, este bump no
invalida ninguna cache -- existe puramente para trazabilidad (igual
criterio que todos los bumps anteriores de esta constante).

**Bloque de datos nuevo** (`_build_learning_context_block`, inyectado en
el USER prompt, entre `COURSE DOMAIN` y `COURSE EVIDENCE` -- PARTE 52):

```
=== ADAPTIVE LEARNING CONTEXT (metadata pedagógica generada por el
backend -- nunca fuente de conocimiento ni citable, ver REGLA 28) ===
current_topic:
  learning_status: needs_review
  reason_code: LOW_CERTIFICATION_SCORE
  recent_average: 45.0
  observation_count: 2
course_summary:
  not_started: 10
  progressing: 7
  needs_review: 3
  mastered: 12
review_topics:
  - learning_status: needs_review
    module_title: Fundamentos
    topic_title: Introducción
=== END ADAPTIVE LEARNING CONTEXT ===
```

Si `learning_context` es `None` (sin identidad resuelta, ver arriba), el
bloque se omite POR COMPLETO -- el prompt queda byte-por-byte compatible
con lo que tutor-v4 ya enviaba en ese caso (backward compatible). Si
`current_topic` es `None` dentro de un contexto presente (caso defensivo
de curriculum inconsistente, ver Bloque 1 PARTE 44), se renderiza
explícitamente `current_topic: (sin datos -- enseñá con tu criterio
pedagógico por defecto, sin asumir ningún estado)`.

**Reglas nuevas del system prompt** (siempre activas, en ambos modos --
a diferencia de REGLA 22/23 que solo viven en modo ampliado):

| Regla | Contenido |
|---|---|
| REGLA 24 | Matriz de estrategia por `learning_status` (not_started/progressing/needs_review/mastered) + modulación secundaria por `reason_code` |
| REGLA 25 | El pedido explícito del alumno ("explicámelo desde cero", "quiero algo avanzado") tiene prioridad sobre el contexto adaptativo |
| REGLA 26 | Sin anuncios de estado/score por defecto; sin inferencias psicológicas; sin promesas de dominio garantizado |
| REGLA 27 | `review_topics`/`course_summary` son metadata de fondo -- `needs_review` y `progressing` NUNCA se etiquetan colectivamente como "debilidades" |
| REGLA 28 | El bloque nunca es fuente ni citable (SRC-XXX/COURSE-SRC-XXX); sin bloque o sin `current_topic`, enseñar con criterio por defecto |

### Estrategia por `learning_status` (REGLA 24)

| Status | Estrategia |
|---|---|
| `not_started` | Fundamentos primero, introducir conceptos antes de asumirlos, evitar saltar a detalle avanzado (salvo pedido explícito, REGLA 25) |
| `progressing` | Construir sobre lo ya visto, conectar con conceptos previos, no repetir introducción completa, comprobación de comprensión opcional. Nunca "ya dominás esto" |
| `needs_review` | Más scaffold, concepto central antes de avanzar, ejemplo alternativo si ayuda. Nunca regañar, nunca "fallaste", nunca mencionar el score sin que lo pidan |
| `mastered` | Conciso en lo dominado, conecta con aplicaciones/profundidad/casos límite. Explicación básica igual disponible si la piden. Nunca asume dominio perfecto o permanente |

`reason_code` modula (scaffold más explícito para
`REPEATED_LOW_CERTIFICATION_SCORE` que para `LOW_CERTIFICATION_SCORE`;
`COMPLETED_NO_ASSESSMENT` se trata como visto, nunca como `mastered`) sin
crear una estrategia nueva por cada uno de los 7 códigos.

### `review_topics`: distinción semántica preservada (REGLA 27, PARTE 31-34)

Bloque 1 ya documentaba que `get_review_candidates` puede devolver
`needs_review` **y** `progressing` en la misma lista. Bloque 2 refuerza
esa distinción explícitamente en el prompt: un ítem `progressing` es "un
tema todavía en desarrollo", nunca "una debilidad" ni "un tema fallado".
`test_prompt_never_collectively_labels_review_topics_as_weakness`
confirma que el bloque de DATOS nunca agrega una etiqueta colectiva --
esa interpretación vive únicamente en la instrucción de REGLA 27, nunca
inyectada en la serialización misma.

### Precedencia de grounding (PARTE H, sin cambios de comportamiento)

REGLA 2-21 (grounding de tutor-v4) permanecen **exactamente intactas** --
confirmado por `test_system_prompt_grounding_rules_untouched` (ninguna
renumerada ni removida) y por la batería completa de
`test_tutor_course_grounding.py`/`test_tutor_expanded_relevance.py`/
`test_tutor_prompt_injection.py` pasando sin ningún cambio de código en
esos archivos. El contexto adaptativo:

- nunca autoriza inventar contenido fuera del curso;
- nunca se cita como `SRC-XXX`/`COURSE-SRC-XXX` (REGLA 28,
  `test_learning_context_block_never_uses_src_namespaces`);
- nunca habilita conocimiento general por sí solo (el switch sigue
  siendo la única puerta, REGLA 22/23 sin cambios);
- si el perfil dice `mastered` pero la evidencia curricular no alcanza,
  el Tutor sigue las reglas de grounding normales (`not_covered`/
  `unrelated` según corresponda) -- `mastered` nunca autoriza inventar.

### Fallas: Learning Profile vs. topic inexistente (PARTE I/43-44)

Política explícita, con dos casos deliberadamente distintos:

- **A. Evidencia legítimamente ausente** (alumno nuevo, tópico sin
  intentos de Certification): NO es un error. `TutorLearningContext`
  simplemente trae `current_topic.status="not_started"` — un resultado
  válido y esperado de `LearningProfileService`, nunca una excepción.
- **B. Fallo técnico real** (Postgres caído): `_resolve_learning_context`
  **no atrapa la excepción** -- se propaga tal cual (`SQLAlchemyError`),
  capturada por el handler global ya existente en `app/main.py` (mismo
  que ya protege `GET .../learning-profile` desde v1.7.0), que responde
  `503` limpio sin filtrar detalles de conexión.
- **Topic ID inválido**: sin cambios -- `course_service.get_grounding_packet`
  sigue resolviendo el tópico ANTES de tocar Postgres para el contexto
  adaptativo (mismo orden que ya validaba tópico antes de exigir
  credencial LLM), así que un 404 real nunca depende de Postgres.

Verificado con una demostración real: `test_db_outage_never_produces_silent_non_adaptive_fallback`
apunta la Session a un puerto inalcanzable y confirma `SQLAlchemyError`
real, con **cero** llamadas al proveedor LLM (la falla ocurre antes de
construir el prompt).

### Cache (PARTE J, sin cambios: no hay cache de Tutor)

El Tutor **nunca tuvo** cache de respuestas (documentado desde Fase 5:
"cada pregunta depende del contexto conversacional"). Bloque 2 no agrega
ninguna -- por lo tanto no hay cache key que fingerprintear, no hay
riesgo de cross-user leakage vía cache, y no hay invalidación que
diseñar. `TUTOR_PROMPT_VERSION="tutor-v5"` sigue existiendo únicamente
para trazabilidad, nunca como dimensión de una cache key (a diferencia
de `LESSON_PROMPT_VERSION`/`certification_prompt_version`, que sí
cachean).

### Privacidad del prompt completo (PARTE S)

`test_full_messages_never_contain_pii_or_identity_metadata` serializa
`system` + `user` prompt completos (con un `TutorLearningContext` real,
no vacío) y confirma la ausencia de: email, `user_id`, `display_name`,
`subject`, `issuer`, `tenant`, `object_id`, `provider`, `password`,
`token`, `bearer`, `x-dev-user`, `app_user`. Los logs (`tutor_query_*`)
ganan un único campo nuevo, `learning_status` (un ENUM cerrado o `"-"`),
nunca el `TutorLearningContext` completo -- mismo criterio que los campos
ya existentes `scope_relation`/`topic_coverage`/`course_coverage`.

### Performance (PARTE T)

- **Costo agregado**: una llamada a `LearningProfileService` (misma que
  ya paga `GET .../learning-profile`) -- lecturas indexadas por
  `user_id`/`course_id` sobre `topic_progress`/`certification_attempts`,
  sin N+1 (confirmado por los tests de solo-lectura reutilizados de
  Bloque 1).
- **Frente al LLM**: esa consulta a Postgres es del orden de milisegundos
  (mismo orden que el resto de las resoluciones ya existentes --
  `_resolve_scene_context`/`_resolve_course_scope`/
  `_resolve_course_evidence`); la latencia dominante del Tutor sigue
  siendo la llamada al proveedor LLM (típicamente 1-3s), sin cambio
  perceptible de punta a punta.
- **Overhead de tokens**: el bloque `ADAPTIVE LEARNING CONTEXT` es
  estructurado y compacto por diseño (Bloque 1: máx. 5 `review_topics`).
  `test_learning_context_adds_small_prompt_overhead` confirma que el
  bloque completo (con `current_topic` + `course_summary` + 1
  `review_topic`) se mantiene bajo ~800 caracteres -- unas pocas decenas
  de tokens, insignificante frente al Grounding Packet/COURSE EVIDENCE
  ya existentes.

### Regresión confirmada

- Backend: 853/853 (825 baseline de v1.8.0 Bloque 1 + 28 tests nuevos de
  Bloque 2: 18 de prompt puro, 9 de comportamiento/integración real, 1 de
  client-tampering HTTP), 0 fallos.
- Frontend: sin cambios de código (cero archivos tocados) -- 719/719
  reconfirmado.
- Grounding/course-wide retrieval/provenance/Related Topics/general
  knowledge switch: sin hallazgos nuevos, batería completa pasando sin
  ningún cambio de código en esos archivos de test.
- Learning Profile / Topic Progress / Certification / Guided Review /
  Verification / Reader-Voice: sin tocar ningún archivo relacionado.

### QA real con LLM (PARTE O) -- resultado observado, honesto

Con el proveedor real configurado (`openai`/`gpt-4o-mini`, `temperature=0`
en ambos providers -- ver `app/services/llm_provider.py`), se crearon dos
identidades dev reales (`X-Dev-User: adaptive-qa-review` /
`adaptive-qa-mastered`) contra el Postgres de desarrollo real, se importó
evidencia real de Certification para cada una (`certification_history_service.
import_legacy_attempts`, score 15-20 vs. 95-100) y se confirmó vía
`GET .../learning-profile` que el estado real difería (`needs_review` vs.
`mastered`, con `recent_average`/`reason_code` reales). Los logs del
backend confirman `learning_status=needs_review`/`learning_status=mastered`
en `tutor_query_started`/`completed` para cada request, con una llamada
HTTP real a `api.openai.com` en cada caso.

**Hallazgo 1 (tópico introductorio corto, "Introducción a la IA")**: para
una pregunta factual simple ("¿Qué es la IA?" / "Explicame en profundidad
los conceptos clave"), ambos perfiles produjeron `answer_chunks`
prácticamente IDÉNTICOS palabra por palabra. Con `temperature=0` y un
tópico corto (pocos `SourceBlock`s), el modelo convergió a la misma
extracción grounded independientemente del contexto adaptativo -- REGLA
24 es una instrucción de tono/profundidad, no una restricción dura, y
para contenido muy compacto no siempre hay margen real para que se
manifieste una diferencia observable.

**Hallazgo 2 (tópico con más contenido, "Patrones técnicos y componentes
de referencia")**: con una pregunta más abierta, la respuesta SÍ difirió
de forma real y observable: el perfil `needs_review` recibió una
respuesta más corta y compacta (un único chunk, cuatro oraciones); el
perfil `mastered` recibió una respuesta más elaborada, con una oración
conectora adicional por componente y un chunk de cierre adicional
(citando un `SRC-XXX` distinto) que agrega una síntesis. Ambas citaron
`SRC-XXX` reales y válidos (grounding intacto, sin necesidad de
reintento). Ninguna de las dos respuestas anunció el estado/score por
defecto (REGLA 26 se sostuvo en ambos casos).

**Lectura honesta de la dirección observada**: la diferencia real no
coincidió perfectamente con la dirección "ideal" de REGLA 24 en su
lectura más literal (se esperaría MÁS scaffold para `needs_review`, no
menos) -- es más ajustado describirla como "`mastered` recibió más
profundidad/síntesis adicional" que como "`needs_review` recibió más
refuerzo". Esto es una variación real de un LLM ante una instrucción de
tono (no una restricción estructural validable, a diferencia del
grounding), documentado con la misma honestidad que v1.2.0 ya estableció
para la selección de visuales: la adaptación pedagógica es una guía
prescriptiva sobre el prompt, no una garantía determinística de
resultado.

**Override explícito (REGLA 25)**: se le pidió al perfil `mastered`
"explicámelo desde cero como si no supiera nada del tema" sobre el
tópico introductorio -- la respuesta reformuló ligeramente la primera
oración con una conjunción explicativa adicional ("Esto incluye
actividades como...") y omitió un chunk de cierre presente en la
respuesta sin ese pedido explícito; un efecto real pero MODESTO, no una
reestructuración dramática a "modo principiante". Con este modelo
(`gpt-4o-mini`) y `temperature=0`, el pedido explícito del alumno tuvo un
efecto medible pero acotado -- consistente con el resto de los hallazgos:
la instrucción de tono es real y medible, no absoluta.

**Nota no relacionada, pre-existente**: la respuesta `mastered` del
Hallazgo 2 usó `**negrita**` (Markdown decorativo) pese a REGLA 19
("texto plano, sin Markdown decorativo") -- una imperfección de
adherencia del modelo a una regla YA EXISTENTE desde Fase 6, no
introducida ni agravada por Block 2 (`test_system_prompt_forbids_decorative_markdown`
sigue verde porque valida la PRESENCIA de la regla en el prompt, nunca
la adherencia real de un LLM -- el mismo patrón de limitación que ya
documentaba `test_prompt_injection.py`).

### Limitaciones conocidas (honestas)

- La adaptación es una instrucción de PROMPT, no una restricción
  estructural: un LLM real puede, en un caso raro, ignorar parcialmente
  REGLA 24-28 (igual que puede desviarse de cualquier otra regla del
  prompt) -- no hay una validación determinística que rechace una
  respuesta "no suficientemente adaptada" (a diferencia del grounding,
  que sí se valida estructuralmente vía `source_refs`). Esto es
  consistente con la naturaleza del problema (tono/profundidad
  pedagógica no es verificable con un chequeo de contrato Pydantic).
- No hay wiring hacia Checkpoint/Certification -- Bloque 2 es
  exclusivamente el Tutor conversacional, tal como pedía el alcance.
- `review_topics` sigue sin mencionarse obligatoriamente en cada
  respuesta (deliberado, REGLA 27) -- no hay una forma de forzar/probar
  determinísticamente que el LLM los use cuando son relevantes.
