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

### 2.14. Roadmap para el próximo bloque

Bloque 2 (no iniciado): migrar progreso de tópicos a Postgres detrás de
`app_user.id`, manteniendo `LearningState` derivado. `localStorage` deja de
ser la fuente de verdad para progreso (Certification/Guided Review/
Verification siguen sin tocarse hasta bloques posteriores).
