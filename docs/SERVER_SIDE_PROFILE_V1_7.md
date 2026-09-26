# Server-Side Learning Profile & PostgreSQL Persistence (v1.7.0)

Este documento se construye incrementalmente por bloque, igual que
`docs/PERFORMANCE.md`/`docs/ADAPTIVE_LEARNING.md` en versiones anteriores.
Esta primera sección cubre exclusivamente el **Bloque 1**.

## 1. Objetivo global de v1.7.0

Migrar el perfil funcional del alumno (hoy 100% en `localStorage` del
navegador: progreso curricular, tópicos iniciados/completados, historial de
Certification, evidencia usada para derivar `LearningState`) hacia
**PostgreSQL como fuente de verdad server-side** para el perfil de usuario,
el progreso curricular, el historial de Certification y la evidencia de
aprendizaje.

**Regla dura, vigente en todos los bloques de v1.7.0**: `LearningState`
(ver `docs/LEARNING_PROGRESS.md`) sigue siendo estrictamente DERIVADO. No se
persiste como tabla propia en ningún bloque — se sigue calculando a partir
de evidencia real (progreso, intentos de certificación), nunca al revés.

## 2. Bloque 1 — PostgreSQL Foundation + Application User + Identity Abstraction

### 2.1. Alcance

Implementado en este bloque: PostgreSQL en Docker Compose, SQLAlchemy 2.x
(síncrono), Alembic, `AppUser`, `UserIdentity`, `Principal`,
`IdentityProvider` (+ `DevIdentityProvider`), resolución de usuario actual
en FastAPI, readiness de DB, migraciones, tests de aislamiento de
identidad.

**Explícitamente NO migrado todavía** (bloques futuros): progreso de
tópicos, historial de Certification, `LearningState`, Guided Review,
Verification. `localStorage` sigue siendo la fuente de verdad funcional del
progreso durante este bloque — es un diseño en etapas esperado, no una
deuda accidental.

### 2.2. Separación Identidad vs. Perfil Funcional

```
Identity Provider -> Principal -> Application User Resolver -> app_user.id
                                                                   ├── topic progress (futuro)
                                                                   ├── certification attempts (futuro)
                                                                   ├── certification topic evidence (futuro)
                                                                   └── future learning profile (futuro)
```

El dominio funcional (todo lo que hoy vive en `app/services/*.py` fuera de
`identity_provider.py`/`identity_resolver.py`) solo debe conocer
`app_user.id` — nunca email, Entra Object ID, tenant ID, provider ni claims
crudos de un JWT.

```
HOY:    AUTH_MODE=dev   -> DevIdentityProvider  -> Principal -> Application User
FUTURO: AUTH_MODE=entra -> EntraIdentityProvider -> Principal -> Application User
```

Todo lo que está a la derecha de `Principal`/`Application User` debe
permanecer sin cambios cuando se agregue Entra a futuro. Este bloque NO
implementa Entra — solo prepara correctamente la abstracción
(`app/services/identity_provider.py::get_identity_provider` falla
explícitamente con `IdentityConfigurationError` si `AUTH_MODE=entra`, nunca
finge soportarlo).

### 2.3. Postgres nunca es el proveedor de identidad

`app_users`/`user_identities` son mapeos funcionales a una identidad
EXTERNA ya confiable (validada por el `IdentityProvider`, hoy trivialmente
en modo dev). Nunca son:

- una base de datos de credenciales (sin `password`/`password_hash`/
  `password_salt`/`reset_token` en ninguna columna — auditado
  automáticamente por `tests/test_no_password_schema.py` contra el
  metadata real de SQLAlchemy);
- un sistema de autenticación propio (sin login por email/password, sin
  registro tradicional, sin recuperación de contraseña).

La autenticación real seguirá siendo, a futuro, Microsoft Entra ID (SSO
corporativo de PwC) — este bloque solo deja la abstracción lista para ese
día.

### 2.4. Esquema (migración `0001`)

`app_users`: `id UUID PK`, `display_name` nullable, `email` nullable
(atributo informativo, NUNCA clave de identidad ni UNIQUE — una identidad
Entra puede tener alias, cambiar de email, o pertenecer a otro tenant con
el mismo email), `created_at`/`updated_at` `TIMESTAMPTZ NOT NULL` (UTC,
nunca timestamps naive).

`user_identities`: `id UUID PK`, `user_id UUID FK -> app_users.id ON DELETE
CASCADE`, `provider`, `issuer` (nullable), `subject`, `tenant_id`
(nullable), `external_object_id` (nullable), `created_at NOT NULL`,
`last_seen_at` nullable. `UNIQUE (provider, issuer, subject)` — la clave
estable de una identidad externa (nunca `display_name`/`email`).
Limitación conocida y aceptada: Postgres trata cada `issuer NULL` como
distinto en una `UNIQUE`, así que esa garantía estructural solo aplica
mientras `issuer` tenga un valor concreto; `DevIdentityProvider` siempre
asigna uno fijo (`"pwc-ai-tutor-local"`), por lo que esto no aplica en la
práctica en esta versión.

UUIDs generados client-side (`uuid.uuid4()`, sin extensión de Postgres
adicional). Cascade: borrar un `AppUser` borra sus `UserIdentity` (no hay
UI de borrado de usuario en esta versión).

### 2.5. `DevIdentityProvider` y el header `X-Dev-User`

Solo activo cuando `AUTH_MODE=dev` (default). Sin header: identidad estable
`dev-user-default` (la app sigue funcionando sin ningún cambio de
frontend). Con el header `X-Dev-User: <subject>`: simula múltiples alumnos
en desarrollo. Validación (nunca usado como path/SQL/HTML; la
parametrización del ORM ya protege contra inyección SQL, esto es
defensa adicional + protección básica de DoS): trim, no vacío, máx. 128
caracteres, solo `[A-Za-z0-9_-]+`. Cualquier violación → `400`.

`X-Dev-User` solo puede afectar la identidad cuando `AUTH_MODE=dev` — la
factory `get_identity_provider` nunca deja pasar el header hacia una
implementación distinta (con `AUTH_MODE=entra` o cualquier otro valor, la
factory falla ANTES de instanciar ningún provider que pudiera leerlo).

### 2.6. Application User Resolver

`app/services/identity_resolver.py::resolve_application_user`: busca la
identidad por `(provider, issuer, subject)`; si existe, actualiza
`last_seen_at` y sincroniza `display_name`/`email` (solo si el `Principal`
trae un valor no nulo — nunca borra un valor ya guardado por uno ausente en
una request puntual); si no existe, crea `AppUser` + `UserIdentity` en la
misma transacción ("first-seen provisioning", nunca "registro": la
identidad ya viene autenticada por el `IdentityProvider`).

**A prueba de carreras**: dos requests concurrentes para el mismo
`Principal` nunca crean dos `AppUser` — se apoya en la constraint
`uq_user_identities_provider_issuer_subject`; si el `INSERT` falla por
`IntegrityError` (la otra request ganó la carrera), se hace rollback y se
reutiliza el `AppUser` que sí quedó persistido. Probado con Postgres real y
threads concurrentes reales en `tests/test_identity_resolver.py`.

### 2.7. `get_current_app_user` — el único trust boundary

```
Request -> IdentityProvider -> Principal -> Application User Resolver -> AppUser
```

Ningún router funcional debe leer `X-Dev-User` (ni, a futuro, un JWT de
Entra) directamente — siempre a través de
`app/dependencies.py::get_current_app_user`.

### 2.8. `GET /api/me`

Endpoint de diagnóstico/desarrollo (`app/routers/me.py`): devuelve
`{id, display_name, email, provider}` — nunca columnas internas de
`user_identities` (`tenant_id`/`external_object_id`/`issuer`/`subject`),
timestamps, ni ningún detalle de DB. Se evaluó extender
`/api/system/status` y se descartó: ese endpoint es información del
SISTEMA (sin usuario), `/api/me` es inherentemente por-usuario.

### 2.9. Readiness

`GET /api/ready` gana `db_reachable: bool` (`SELECT 1` con
`connect_timeout=2s`, usando un engine efímero dedicado para no imponerle
ese timeout corto al pool normal de la app). A diferencia de la credencial
LLM/TTS (opcional, nunca afecta readiness), Postgres es una dependencia
INTERNA requerida desde este bloque: su ausencia sí se refleja como
`not_ready`. Se evaluó agregar lo mismo a `/api/system/status` y se
descartó (evita una segunda consulta a DB redundante en cada poll de
estado general; `/ready` ya es el endpoint canónico para esto).

### 2.10. Migraciones y arranque

`docker-entrypoint.sh` corre `alembic upgrade head` ANTES de levantar
uvicorn (`set -e`: fail-fast — una migración fallida nunca deja el backend
sirviendo requests contra un schema inconsistente). `docker compose run
backend pytest` reemplaza el `CMD` por completo (nunca corre este
entrypoint); los tests aplican las migraciones ellos mismos, una vez por
sesión, contra una base de datos de test dedicada (ver más abajo).

`alembic/env.py` resuelve `DATABASE_URL` siempre a través de la `Settings`
central del backend (nunca duplica la construcción de la cadena de
conexión), salvo que el caller ya haya fijado `sqlalchemy.url`
explícitamente en el `Config` (usado por los tests para apuntar a la base
de datos de test).

### 2.11. Decisión de simplicidad: SQLAlchemy síncrono

Todo el resto del backend es 100% sincrónico (endpoints `def`, servicios
sin `await`). Las operaciones de este bloque son lecturas/escrituras de una
sola fila. No hay ninguna justificación real para un segundo modelo de
concurrencia (driver async + engine async) solo por el hábito de "FastAPI
es async" — Uvicorn ejecuta los endpoints `def` en un threadpool, que es
exactamente donde una llamada de DB sincrónica corta debe vivir.

### 2.12. Estrategia de tests

`tests/conftest.py` usa **Postgres real** (nunca SQLite: la constraint
`UNIQUE`, los UUID nativos y las migraciones reales de Alembic no se pueden
validar fielmente contra otro motor). Deriva `TEST_DATABASE_URL` de la
misma `DATABASE_URL` que ya usa el container (nunca hardcodea una
credencial nueva), apuntando a una base de datos distinta
(`pwc_tutor_test`) para no tocar nunca los datos de desarrollo. Una
fixture de sesión crea esa base de datos si falta y corre `alembic upgrade
head` una vez; una fixture por-test trunca `user_identities`/`app_users`
antes de cada test para aislamiento.

**Bug real encontrado y corregido durante este bloque**: `alembic/env.py`
llamaba `fileConfig()` sin `disable_existing_loggers=False`. El default de
Python (`disable_existing_loggers=True`) deshabilita cualquier logger ya
existente no declarado en `alembic.ini` (ej. `pwc_tutor.tutor`/
`pwc_tutor.lesson`) — como las migraciones de test corren dentro del mismo
proceso de pytest, esto silenciaba esos loggers para el resto de la sesión
completa de tests (11 tests de logging fallaban con `caplog` vacío, sin
relación aparente con este bloque). Nunca afectó al comportamiento real en
runtime (el proceso del backend nunca comparte logger state con pytest).

**Segundo bug real encontrado y corregido**: la fixture de creación de la
base de datos de test usaba `str(url_de_sqlalchemy)` para construir la
cadena de conexión de un engine de mantenimiento — `str()`/`repr()` de un
objeto `URL` de SQLAlchemy **enmascaran la password como `"***"`** (pensado
para logs seguros, nunca para uso real), lo que producía un
`OperationalError: password authentication failed` reproducible. Corregido
usando `URL.render_as_string(hide_password=False)` para las cadenas que
efectivamente se usan para conectar, y pasando el objeto `URL` directamente
a `create_engine(...)` donde no hace falta stringificar en absoluto.

### 2.13. Variables de entorno nuevas

Ver `docs/CONFIGURATION.md` sección "PostgreSQL + identidad de aplicación".
Resumen: `POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD` (credenciales de
infraestructura de Postgres, nunca de un usuario funcional),
`DATABASE_URL` (leída siempre por el backend vía `Settings`, nunca
reconstruida en otro módulo), `AUTH_MODE` (`dev` únicamente soportado en
esta versión).

### 2.14. Roadmap para el próximo bloque (cerrado en el Bloque 2 — ver abajo)

## 3. Bloque 2 — Server-Side Topic Progress

### 3.1. Alcance

PostgreSQL pasa a ser la **fuente de verdad de progreso curricular por
tópico** (`not_started`/`in_progress`/`completed` + timestamps), detrás de
`app_user.id` (Bloque 1). **Certification history sigue en
`localStorage`** en este bloque — arquitectura híbrida explícitamente
TRANSITORIA: `LearningState` se sigue derivando (nunca persistiendo) a
partir de `topic progress` server-side + evidencia de Certification local.
Guided Review y Verification siguen funcionando sin cambios de algoritmo
(solo cambia de dónde viene el status curricular que consumen).

### 3.2. Esquema (migración `0002`)

`topic_progress`: `id UUID PK`, `user_id UUID FK -> app_users.id ON DELETE
CASCADE`, `course_id`/`module_id`/`topic_id` (slugs, nunca contenido),
`status` (`"in_progress"`/`"completed"` únicamente — **sin fila =
`not_started`**, decisión documentada: evita escribir una fila para la
inmensa mayoría de tópicos que un alumno nunca abre), `started_at`/
`completed_at` nullable, `created_at`/`updated_at`. `UNIQUE(user_id,
course_id, module_id, topic_id)` — su prefijo `(user_id, course_id)` ya
sirve como índice eficiente para "progreso de un curso", por lo que no se
agrega un índice adicional (evita over-indexing).

### 3.3. Ratchet, idempotencia y carreras

Mismo criterio que la identidad (Bloque 1): `start` nunca degrada
`completed`, y de hecho **nunca toca `.status` de una fila ya existente**
(solo `completed` puede cambiar el status) — esto hace la lógica
correcta ante carreras SIN necesitar `SELECT FOR UPDATE`: una carrera de
creación (fila no existe todavía) se resuelve con el mismo patrón
`IntegrityError` + retry ya probado en `identity_resolver.py`; una carrera
de actualización sobre una fila existente nunca puede perder un
`completed` porque `start` simplemente no escribe esa columna. Probado con
threads reales + Postgres real (`tests/test_topic_progress_concurrency.py`).

`completed_at`/`started_at` preservan el PRIMER valor real (nunca se
pisan por una repetición de la misma acción).

### 3.4. API

```
GET    /api/progress/{course_id}                       -> progreso persistido del curso
PUT    /api/progress/{course_id}/{module_id}/{topic_id} -> {action: "start"|"complete"}
POST   /api/progress/{course_id}/legacy-import          -> fusiona un snapshot legacy
DELETE /api/progress/{course_id}                        -> borra el progreso del curso
```

Los cuatro dependen de `get_current_app_user` (Bloque 1) — ninguno acepta
`user_id` desde el cliente ni tiene `user_id` en la URL (PASO 15: nunca
`/users/{user_id}/progress`). `module_id`/`topic_id` se validan contra el
curriculum real (`course_service.get_course_detail`) antes de escribir o
importar — nunca se permiten IDs arbitrarios en la tabla.

### 3.5. Legacy import / merge

**Trigger**: la primera vez que el frontend carga el progreso de un curso
para el usuario actual (`useServerTopicProgress`), si hay un snapshot
legacy en `localStorage` (`learningProgressStore.ts`) que todavía no se
importó, se envía a `POST .../legacy-import` antes de usar el resultado.

**Marcador de import — decisión: CLIENTE, no servidor.** El enunciado
original prefería un marcador server-side; se optó por uno cliente
(`CourseLearningProgress.serverProgressImportedAt`, mismo patrón que el ya
existente `migratedLegacyAt`) por tres razones: (1) el merge es
idempotente por diseño (reimportar nunca degrada nada), así que el único
costo de omitir el marcador sería una llamada de red redundante, nunca un
bug de datos; (2) evita una tabla nueva (`profile_migrations`) que solo
guardaría un timestamp sin otro valor de negocio; (3) el frontend real
nunca envía `X-Dev-User` por sí mismo (solo se usa para QA vía curl/tests),
así que no existe el caso "un mismo navegador alterna entre identidades" en
la práctica — el marcador por-curso en `localStorage` es seguro.

**Política de merge** (`topic_progress_service.import_legacy_progress`):
`completed` > `in_progress` > ausencia (nunca degrada); timestamps: el
valor más antiguo válido gana (representa la primera ocurrencia histórica
real, nunca `datetime.now()` reemplazando un dato histórico). Entradas que
referencian un módulo/tópico que ya no existe en el curriculum real se
descartan en silencio (nunca rompen el import completo). Entradas
mal-formadas (shape inválido, nunca enviadas por un frontend bien
comportado — el parser defensivo de `learningProgressStore.ts` ya filtra
localStorage corrupto antes de construir el payload) sí rechazan la
request completa vía Pydantic (422) — distinto del caso "tópico stale",
ver test correspondiente.

### 3.6. Frontend: arquitectura híbrida

- `learning/topicProgressClient.ts`: `markTopicStartedServer`/
  `markTopicCompletedServer` (best-effort, nunca lanzan — mismo espíritu
  que la versión local anterior: "Learning Progress nunca debe romper el
  aula") + `resetCourseProgressServer` (SÍ propaga errores: es una acción
  explícita del alumno con su propio confirm).
- `learning/useServerTopicProgress.ts`: hook de lectura + import legacy.
  `topics === null` SIEMPRE significa "cargando" (nunca "0 progreso");
  `error` se expone aparte, sin pisar el último valor conocido.
- `ClassroomPage.tsx`: "started" se dispara UNA vez por apertura de tópico
  (ya no en cada cambio de escena — currentScene/totalScenes nunca
  viajaron al servidor, siguen siendo puramente device-local vía
  `classroomStorage.ts`, Fase 4, sin cambios). `contentUpdatedSinceCompletion`
  (aviso "el contenido cambió desde que completaste esto") pasó de leer
  `learningProgressStore` a leer `classroomStorage.loadTopicProgress` —
  degradación documentada y aceptada: pasa de una comparación teóricamente
  cross-device a una estrictamente device-local (`classroomStorage` nunca
  sincronizó entre dispositivos, ni antes ni ahora).
- `LearningProgressPage.tsx`/`CertificationResultsPage.tsx`: combinan
  `useServerTopicProgress(courseId).topics` (server) con
  `getCourseLearningProgress(courseId)?.certificationAttempts` (local) en
  un objeto `CourseLearningProgress` armado en memoria — **cero cambios**
  en `courseSummary.ts`/`topicLearningSignal.ts`/`learningState.ts` (las
  funciones puras de derivación no saben ni les importa de dónde vino cada
  mitad del dato).
- `SettingsPage.tsx` ("Restablecer mi progreso"): sigue siendo UNA acción
  de producto (mismo confirm de siempre: borra topic progress +
  Certification juntos — comportamiento histórico preservado a propósito,
  la propia UI ya lo anunciaba así). Por debajo llama primero al DELETE
  server-side; si falla, aborta sin tocar Certification local (nunca un
  reset parcial ambiguo).

### 3.7. Bugs reales encontrados y corregidos en este bloque

1. **CORS no permitía PUT/DELETE.** `CORSMiddleware.allow_methods` solo
   tenía `["GET", "POST"]` desde Fase 3 — nunca se había notado porque
   ningún endpoint anterior usaba PUT/DELETE. `curl`/`TestClient` no
   aplican CORS (solo lo hace un browser real), así que ni los tests ni el
   smoke manual con curl lo habrían detectado; se encontró por auditoría
   de `main.py` antes de tocar el frontend. Corregido:
   `["GET", "POST", "PUT", "DELETE"]`.
2. **Postgres caído durante una query de progreso (no de identidad) devolvía
   un 500 crudo.** El catch de `app/dependencies.py` (Bloque 1) solo
   cubría la resolución de identidad, no las queries de
   `topic_progress_service`. Corregido con un `@app.exception_handler
   (SQLAlchemyError)` GLOBAL en `main.py` — cierra esta clase de bug para
   cualquier router futuro, no solo para progreso.

### 3.8. QA real ejecutada

Contra Postgres/Docker reales (curl): ciclo started→completed→ratchet
(start después de complete no degrada), aislamiento entre dos identidades
dev (`student-progress-a`/`-b`), 404 de curso/módulo/tópico inválido,
merge de legacy-import (server completed + legacy in_progress -> se
mantiene completed con el timestamp más antiguo), reset (DELETE) y
verificación de que solo afecta ese curso. Persistencia real: progreso
sobrevive un restart del container backend y un `docker compose down`
(sin `-v`) + `up -d` completo (mismo volumen), con el mismo `alembic
current` en `0002` tras el ciclo. Postgres caído: `/api/progress/*`
devuelve `503` limpio (nunca 500 ni datos vacíos fingidos) y se recupera
solo al volver Postgres, sin intervención manual.

**Limitación honesta**: no se ejecutó QA con un browser real (sin
Playwright/chromium-cli disponible en este entorno) — la cobertura
equivalente viene de: (a) QA real vía `curl` contra Postgres/Docker reales
para TODO el backend (idéntico a lo que un browser terminaría llamando),
y (b) la suite Vitest/RTL, que monta los componentes React reales
(`ClassroomPage`, `LearningProgressPage`, `CertificationResultsPage`,
`SettingsPage`) y ejercita el hook/cliente reales con la capa de red
mockeada — no es un click-through humano, pero sí ejecuta el código de
producción real, no un doble simplificado.

### 3.9. Roadmap para el próximo bloque (cerrado en el Bloque 3 — ver abajo)

## 4. Bloque 3 — Server-Side Certification History & Learning Evidence

### 4.1. Alcance

PostgreSQL pasa a ser la fuente de verdad de **historial de Certification
+ evidencia por tópico**, detrás de `app_user.id`. Con esto, los tres
pilares del perfil funcional (topic progress, Certification history,
Certification topic evidence) son server-side. `LearningState` sigue
DERIVADO, nunca persistido — no existe ni existirá una tabla
`learning_state`.

### 4.2. Trust boundary — decisión central del bloque

El backend YA calculaba el resultado de una Certification de forma
100% determinística (`certification_service.evaluate_simulation`, sin
LLM) **antes** de este bloque — el frontend nunca calculaba el score. Esto
hizo que la persistencia server-side fuera directa: se agrega DESPUÉS de
evaluar y ANTES de responder, en el mismo endpoint (`POST
.../certification/evaluate`), usando `get_current_app_user`. El frontend
nunca puede declarar un `score`/`practice_score_percent` como autoridad —
campos así en el body simplemente no existen en `EvaluateSimulationRequest`
y Pydantic los ignora (probado explícitamente,
`test_client_cannot_forge_score_via_extra_fields`).

**Hallazgo clave del audit**: tanto Practice como Simulation terminan
llamando al MISMO endpoint `evaluate` al finalizar (`submitExam()` en
`useCertificationExam.ts` es compartido por ambos modos) — no hizo falta
un segundo endpoint de "submit". `practice_id`/`mode` se agregaron como
campos nuevos del request (identificadores/metadata, nunca score).

### 4.3. Esquema (migración `0003`)

`certification_attempts`: `id`, `user_id` (FK), `course_id`, `practice_id`,
`mode`, agregados (`total_questions`/`correct_count`/.../`score_percent`),
`competency_breakdown` (JSONB, ver 4.4), `origin`
(`server_evaluated`/`legacy_import`), `attempted_at`, `created_at`.
`UNIQUE(user_id, practice_id)` — `practice_id` ya era un UUID4
generado por el backend en `/prepare`, identidad funcional estable de un
intento. Índice separado `(user_id, course_id, attempted_at)` para el
query de historial (no es redundante con la UNIQUE: prefijo distinto).

`certification_topic_results`: `id`, `attempt_id` (FK, `ON DELETE CASCADE`),
`module_id`+`topic_id` (nunca `topic_id` solo), agregados por tópico.
`UNIQUE(attempt_id, module_id, topic_id)`.

**Nunca se persiste**: `question_results`, answer key, respuestas
individuales — exactamente la misma regla que ya regía
`CertificationAttemptSummary` en `localStorage` antes de este bloque, solo
que ahora auditada contra el metadata real de SQLAlchemy
(`test_no_password_schema.py` extendido).

### 4.4. Decisión documentada: `competency_breakdown` como JSONB

`moduleIds`/`topicIds` del contrato público se DERIVAN de
`certification_topic_results` (nunca se guardan como columna separada —
serían datos duplicados). `competencies_to_reinforce`, en cambio, es una
dimensión ortogonal (una competencia puede abarcar preguntas de varios
tópicos) que no puede derivarse de la evidencia por tópico. Se decidió NO
crear una tabla `certification_competency_results` normalizada (nunca
pedida explícitamente, y siempre se lee/escribe como unidad completa por
intento, nunca filtrada por competencia a nivel SQL) — se persiste como
JSONB en la propia fila del intento. `topics_to_reinforce` (subconjunto
reordenado de `performance_by_topic`) se recalcula al leer, nunca se
persiste — es 100% derivable.

### 4.5. Retención: decisión sobre el límite de 50

El límite histórico de 50 intentos/curso (`MAX_CERTIFICATION_ATTEMPTS_PER_COURSE`,
v1.1.0) existía por una limitación real de `localStorage` (cuota finita).
PostgreSQL no tiene esa limitación para filas pequeñas — truncar la
persistencia perdería evidencia real para siempre sin necesidad. Decisión:
**se persisten TODOS los intentos, se SIRVEN como máximo 50** por
`get_history` (`HISTORY_SERVE_LIMIT`), reproduciendo el comportamiento
observable exacto de antes sin perder el resto del historial real
(probado con 60 intentos reales: `test_history_limit_serves_at_most_50`).

### 4.6. Idempotencia y carreras

Mismo patrón que Bloque 1/2: `UNIQUE(user_id, practice_id)` +
`IntegrityError` + retry. Un reintento de red del mismo submit (mismo
`practice_id`) nunca duplica el intento **ni degrada la evidencia ya
persistida** — el resultado se RECALCULA siempre (función pura de
`answers`, puede diferir si el cliente reenvía respuestas distintas), pero
solo la PRIMERA persistencia real gana (`test_evaluate_retry_same_practice_id_never_duplicates_or_degrades`,
más concurrencia real con threads:
`test_certification_concurrency_history.py`).

### 4.7. Legacy import + provenance

`POST .../certification/legacy-import` — mismo patrón que topic progress:
dedup por `practice_id` (nunca sobrescribe `server_evaluated` con
`legacy_import`), timestamps preservados tal cual (nunca `Date.now()`),
entradas con módulo/tópico stale se descartan por-fila (el intento se
importa igual con el resto). `origin` distingue ambas procedencias, nunca
afecta el peso pedagógico.

**Marcador de import — mismo criterio que Bloque 2, pero SEPARADO**:
`certificationHistoryImportedAt` es un campo nuevo y distinto de
`serverProgressImportedAt` (PASO 34: importar uno nunca implica que el
otro se importó — son bootstraps independientes).

**Bug real de QA encontrado y corregido**: `LearningProgressPage.tsx::handleStartVerification`
resuelve el progreso/historial de `reviewCompletion.courseId`, que puede
NO ser el `selectedCourseId` actual — llamaba directamente a
`api.getCourseProgress`/`api.getCertificationHistory` sin pasar por el
bootstrap de import legacy de los hooks. Si ese curso nunca había sido
cargado por `useServerTopicProgress`/`useServerCertificationHistory` en
esta sesión, `latestAttemptIdAtStart` podía quedar `null` aunque existiera
un intento legacy real en `localStorage` (encontrado por un test que
simulaba exactamente ese escenario). Corregido extrayendo la lógica
get-or-import de ambos hooks a funciones puntuales reusables
(`fetchCourseTopicProgress`/`fetchCourseCertificationHistory`), usadas
tanto por los hooks como por `handleStartVerification` — mismo marcador
cliente, mismo comportamiento idempotente, sin duplicar lógica.

### 4.8. Frontend: arquitectura final del bloque

- `learning/useServerCertificationHistory.ts`: hook de lectura + import
  legacy (mismo patrón que `useServerTopicProgress.ts`). Incluye un filtro
  defensivo (`isSaneForImport`) que descarta client-side cualquier entrada
  legacy que no vaya a pasar la validación atómica del backend (Pydantic
  valida el batch completo: una sola entrada corrupta rechazaría el import
  entero si no se filtrara antes).
- `useCertificationExam.ts::submitExam()`: ya no llama a
  `recordCertificationAttempt` (dual-write local eliminado, PASO 53) — solo
  envía `practice_id`/`mode` además de `answers`. `buildAttemptSummary`
  (`certificationSummary.ts`) queda como código muerto conocido y
  documentado (deuda técnica menor, ver 4.10) — se evaluó borrarlo y se
  decidió no ampliar el diff de este bloque sin necesidad real.
- `LearningProgressPage.tsx`/`CertificationResultsPage.tsx`: combinan
  `useServerTopicProgress`+`useServerCertificationHistory` en un
  `CourseLearningProgress` armado en memoria — **cero cambios** en
  `courseSummary.ts`/`topicLearningSignal.ts`/`learningState.ts`/
  `guidedReviewVerification.ts` (funciones puras, agnósticas del origen).
- `SettingsPage.tsx` ("Restablecer mi progreso"): ahora llama a DOS
  DELETE server-side (topic progress + Certification history) antes de
  limpiar el documento local; si cualquiera falla, aborta sin tocar nada
  (nunca un reset parcial).
- `certificationErrors.ts`: el copy del 503 se generalizó ("Servicio no
  disponible" en vez de "IA no configurada") — un 503 de `/evaluate` ahora
  puede ser por Postgres caído, no solo por falta de credencial de IA.

### 4.9. QA real ejecutada

Contra Postgres/Docker/LLM reales (curl, credencial OpenAI real
configurada): prepare→evaluate→history con generación real, DB inspeccionada
directamente (join `certification_attempts`/`certification_topic_results`,
sin `question_results`), aislamiento entre dos identidades dev,
Postgres caído durante un GET de historial → `503` limpio → recupera solo,
persistencia real a través de restart de backend Y `docker compose down`
(sin `-v`) + `up -d` completo (mismo volumen, `alembic current` en `0003`).

**Misma limitación honesta que Bloque 2**: sin Playwright/chromium-cli en
este entorno, no hubo click-through en un browser real — release blocker
pendiente para el hardening/RC de v1.7.0, tal como se pidió explícitamente.

### 4.10. Deuda técnica conocida

`certificationSummary.ts::buildAttemptSummary` quedó sin ningún llamador
en código de producción (antes usado por `submitExam()`, ahora la
persistencia la hace el backend) — sus tests (`certificationSummary.test.ts`)
siguen pasando porque siguen ejercitando la función directamente. Se
decidió NO eliminarla en este bloque (función pura, inofensiva, bien
testeada) para no ampliar el diff sin necesidad real; queda como candidato
de limpieza de un futuro hardening.

### 4.11. Roadmap para el próximo bloque

Con los tres pilares del perfil funcional en Postgres, un candidato natural
para un bloque futuro es evaluar si `localStorage`/`learningProgressStore.ts`
puede simplificarse aún más (ya no tiene ningún dato NUEVO escribiéndose
ahí, solo el snapshot legacy congelado pre-migración) — sin apuro, no es
un requisito funcional pendiente.
