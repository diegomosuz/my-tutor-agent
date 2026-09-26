# Release Notes — v1.7.0

**Server-Side Learning Profile & PostgreSQL Persistence.** Release
candidate sobre v1.6.1. Mueve el perfil funcional completo del alumno —
progreso curricular por tópico, historial de Certification, y el estado
de aprendizaje derivado de ambos (`LearningState`: qué necesita repaso,
qué está dominado) — de `localStorage` del navegador a PostgreSQL,
detrás de una identidad de aplicación preparada para una futura
integración con Microsoft Entra ID. Sin features pedagógicas nuevas:
este release es exclusivamente una migración de dónde vive el dato, no
de qué dato existe o cómo se interpreta.

Seis bloques funcionales (PostgreSQL Foundation + Identity, Server-Side
Topic Progress, Server-Side Certification History & Evidence,
Server-Side Learning Profile & LearningState API, Frontend Cutover,
Migration Closure) más este hardening/RC. Ver
[`docs/SERVER_SIDE_PROFILE_V1_7.md`](./SERVER_SIDE_PROFILE_V1_7.md) para
el detalle técnico completo (schema, decisiones, QA real de cada
bloque) — este documento resume lo que importa para decidir el upgrade.

## Qué cambia

### PostgreSQL como fuente de verdad permanente

Un único Postgres 17 nuevo (`docker-compose.yml`, levantado
automáticamente por `docker compose up -d`, sin instalación manual) es,
desde este release, la única fuente permanente de:

- **Topic Progress** (`topic_progress`): `not_started`/`in_progress`/
  `completed` por `(usuario, curso, módulo, tópico)`.
- **Certification History + evidencia por tópico**
  (`certification_attempts`/`certification_topic_results`): cada
  intento de práctica/simulacro ya evaluado determinísticamente por el
  backend, con su desagregado por tópico.

`LearningState` (el estado pedagógico agregado — `not_started`/
`progressing`/`needs_review`/`mastered`, con su reason code) **nunca se
persiste**: se deriva desde cero en cada `GET
.../learning-profile`, siempre a partir de la evidencia real de arriba.
No existe ni existirá una tabla `learning_state`.

### Identidad de aplicación (`AppUser`), preparada para Entra ID — sin login propio

Cada alumno tiene un `app_user.id` estable en Postgres, resuelto server-
side en cada request (`AUTH_MODE=dev`: identidad simulada vía un header
opcional `X-Dev-User`, solo activo en desarrollo). El modelo ya separa
la identidad externa (`user_identity`: proveedor/issuer/subject/tenant/
email) del identificador funcional interno (`app_user.id`, lo único que
el resto del dominio conoce) — pensado para que una futura integración
con Microsoft Entra ID (SSO corporativo de PwC) sea un nuevo
`IdentityProvider`, sin tocar ninguna tabla de progreso/certificación.
**Entra ID no está implementado en este release** — `AUTH_MODE=entra`
falla el arranque con un error de configuración explícito, nunca un
fallback silencioso. Sin login propio, sin contraseñas, sin tablas de
credenciales (auditado: 0 columnas `password`/`password_hash`/`salt`/
`reset_token` en todo el schema).

### Frontend: `LearningProgressPage` ya no calcula el estado pedagógico

"Mi aprendizaje" y el panel "Estado después de la verificación" (tras
un Guided Review) consumen `GET .../learning-profile` como única fuente
del estado pedagógico — ya no lo recalculan a partir de datos locales.
Un fallo del Learning Profile API nunca se convierte silenciosamente en
un cálculo local desde `localStorage` (confirmado con tests dedicados
que fuerzan justamente ese escenario).

### Continuidad entre navegadores/dispositivos + aislamiento real por usuario

Mismo alumno, otro navegador o dispositivo (misma identidad, sin ningún
dato local): mismo progreso, mismo historial de Certification, mismo
estado de aprendizaje — porque ya vive en el servidor, no en ese
navegador puntual. Alumnos distintos: aislamiento total, verificado con
consultas SQL directas (`user_id` distinto en cada fila, nunca
cruzado).

### `localStorage`: solo compatibilidad de migración

`pwc-tutor:learning-progress:v1` (el documento que v1.1.0-v1.6.1 usaban
como fuente de verdad) deja de recibir escrituras productivas nuevas.
Su único rol desde este release es servir como snapshot legacy para el
import único hacia PostgreSQL la primera vez que ese navegador abre la
app — nunca se borra automáticamente después (estrategia conservadora,
facilita diagnóstico/rollback), pero deja de ser la fuente de verdad de
absolutamente nada. `sessionStorage` (`GuidedReviewSession`,
`GuidedReviewVerificationContext`) sigue siendo exclusivamente
transitorio, sin cambios.

## Migración v1.6.x → v1.7.0

**No requiere ninguna acción manual del alumno ni del operador.** La
primera vez que un navegador con datos de v1.6.x abre la app v1.7.0:

1. El frontend importa el progreso curricular y el historial de
   Certification de ese `localStorage` hacia PostgreSQL, vía dos
   endpoints dedicados (`POST .../progress/{course}/legacy-import`,
   `POST .../certification/{course}/legacy-import`) — uno por curso,
   una sola vez por navegador (marcado con dos flags cliente
   independientes).
2. Solo después de que ambos imports se consideraron (con éxito o con
   "nada que importar") se pide el Learning Profile — nunca antes, para
   no mostrar un perfil vacío falso mientras la migración todavía está
   en curso.
3. El import es idempotente y nunca degrada evidencia ya persistida:
   reabrir el navegador, recargar varias veces, o tener datos parciales
   (solo progreso, solo Certification, o ninguno) siempre converge al
   mismo resultado correcto, confirmado con QA real de las cuatro
   combinaciones.
4. Después del import, el `localStorage` original puede seguir
   existiendo físicamente, pero deja de tener ninguna autoridad — se
   confirmó explícitamente que modificarlo a mano después de la
   migración (incluyendo un intento deliberado de "downgradear" la
   evidencia, ej. de `completed` a `in_progress`) nunca cambia el
   perfil real, que sigue viniendo 100% del servidor.

**Un restablecimiento (`Configuración → Restablecer mi progreso`) borra
la evidencia server-side real y nunca resucita el snapshot legacy** —
confirmado con QA de navegador real, incluyendo un F5 inmediato después
del reset.

## Qué NO cambia (compatibilidad)

- Los 4 estados de `LearningState`, los 7 reason codes, los thresholds
  (`<60`/`60-79`/`>=80`) y la ventana de 3 observaciones recientes: sin
  cambios — el backend es un puerto EXACTO de la lógica TypeScript ya
  aprobada desde v1.1.0/v1.6.0, verificado con un fixture de paridad
  compartido entre ambos runtimes.
- El límite de 50 attempts/curso más recientes que alimentan el
  `LearningState` (antes una limitación de cuota de `localStorage`):
  se preserva EXACTO como comportamiento observable — ahora Postgres
  persiste el historial completo sin límite real, pero solo sirve/usa
  los 50 más recientes para derivar el estado pedagógico, confirmado
  con un test que prueba específicamente que el intento #51 (el más
  antiguo) nunca participa.
- Certification: generación, evaluación determinística, prevención de
  preguntas meta-pedagógicas (`certification-v2`), answer key oculto
  antes de responder, `question_results`/respuestas individuales nunca
  persistidos — sin cambios, confirmado con regresión real.
- Tutor: grounding, Course Retrieval, provenance, "Temas relacionados"
  — sin cambios. El Learning Profile **no** se envía al Tutor en este
  release (no hay integración Adaptive Tutor todavía).
- Rich Markdown Rendering, code blocks, tablas, imágenes de curso,
  Guided Read Aloud — sin cambios, confirmado con smoke real de
  navegador (imagen real cargando, tabla real con filas, bloques de
  código reales, "Leer tema" arrancando sin errores).
- Guided Review (`needs_review` únicamente, máximo 5, orden
  determinístico) y Verification (Before/After) — sin cambios de
  comportamiento, solo cambia de dónde viene el `LearningState` que
  consumen (ahora del servidor, confirmado de punta a punta con una
  lección real generada por IA, una Certification real, y el panel de
  verificación real mostrando el cambio de estado).
- Ningún endpoint HTTP existente cambió de forma incompatible.
  `APP_VERSION` es la única versión que cambia — `LESSON_PROMPT_VERSION`
  (`lesson-v3.3.1`), `TUTOR_PROMPT_VERSION` (`tutor-v4`) y
  `CERTIFICATION_PROMPT_VERSION` (`certification-v2`) quedan idénticos.

## Qué NO afirma este release (límites honestos)

- **Microsoft Entra ID / SSO corporativo**: no implementado. La
  abstracción de identidad está lista para ese trabajo, pero
  `AUTH_MODE` solo soporta `dev` hoy.
- **Adaptive Tutor**: no existe todavía. `LearningProfileService` está
  diseñado para que un módulo futuro lo reutilice sin pasar por HTTP,
  pero ese módulo no se construyó en este release.
- **Checkpoints** (`scene.interaction.comprehension_check`) siguen sin
  persistir evidencia — evaluación puntual, sin historial.
- **Guided Review Session / Verification Context** siguen siendo
  transitorios (`sessionStorage`), no cross-device — empezar un repaso
  en un dispositivo y continuarlo en otro no está soportado (a
  diferencia del progreso/evidencia permanente, que sí es cross-device
  desde este release).
- **Cursos** siguen siendo 100% filesystem (Markdown + assets) — esta
  migración es exclusivamente sobre el perfil de aprendizaje del
  alumno, nunca sobre el contenido pedagógico.
- **Sin automatización de backup de la base de datos** — Postgres
  persiste en un volumen Docker nombrado (`postgres_data`), pero no hay
  ningún mecanismo de backup/restore automatizado incluido en este
  release.
- **Sin soporte para múltiples instancias de backend compartiendo
  sesión** — no era un requisito de este release (no hay sesión de
  servidor: la identidad se resuelve stateless en cada request), pero
  tampoco se validó explícitamente un despliegue multi-instancia.
- Los helpers de escritura local ya muertos desde v1.6.x
  (`markTopicStarted`/`markTopicCompleted`/`recordCertificationAttempt`,
  `buildAttemptSummary`) se mantienen sin eliminar — siguen siendo la
  base de la convención de test existente para simular "datos legacy de
  un navegador anterior"; documentado como deuda técnica menor, no como
  bug.

## Seguridad y privacidad

- Ningún endpoint acepta `user_id` del cliente — la identidad se
  resuelve siempre server-side, confirmado con un test dedicado
  ("un `user_id` inventado en el body se ignora por completo").
- Un cliente no puede persistir un score arbitrario para una
  Certification nueva: el backend siempre evalúa determinísticamente
  antes de persistir. El import legacy es la única superficie que
  acepta un score ya calculado, y está explícitamente separada
  (`origin: legacy_import` vs. `server_evaluated`) — nunca se confunden
  ni se mezclan en la misma ruta de confianza.
- PostgreSQL nunca contiene: `question_results`, answer key, respuestas
  individuales permanentes, conversación del Tutor, audio, Markdown,
  API keys de LLM, ni contraseñas — auditado directamente contra el
  schema real de las 5 tablas.
- Con Postgres caído: `503` limpio y consistente en los cuatro
  endpoints funcionales nuevos (`/api/me`, `/api/progress/...`,
  `.../certification/history`, `.../learning-profile`) — nunca un `500`
  crudo, nunca un perfil vacío fingido. `/api/ready` reporta
  `not_ready` (siempre `200`, es un probe). Recuperación automática al
  reiniciar Postgres, sin reparación manual, sin pérdida de datos.
- Sin inyección SQL (SQLAlchemy parametrizado en todo el dominio nuevo,
  auditado), sin traversal nuevo (`course_id`/`module_id`/`topic_id`
  siempre resueltos contra el repositorio seguro de cursos existente,
  nunca contra un path de filesystem construido con input crudo).

## Notas de actualización

- `APP_VERSION`: `1.6.1` → `1.7.0` (`backend/app/config.py`,
  `docker-compose.yml`, `.env.example`, `docs/CONFIGURATION.md`).
- `LESSON_PROMPT_VERSION`/`TUTOR_PROMPT_VERSION`/
  `CERTIFICATION_PROMPT_VERSION`: sin cambios.
- **Migración de base de datos real, por primera vez en el proyecto**:
  3 revisiones Alembic (`0001` identidad, `0002` topic progress, `0003`
  Certification history/evidencia), aplicadas automáticamente por el
  backend al arrancar (`docker-entrypoint.sh`). `alembic heads` reporta
  un único head (`0003`) — sin branching.
- **Nuevo requisito de infraestructura**: un container Postgres 17
  (`docker-compose.yml`, servicio `postgres`), levantado automáticamente
  por `docker compose up -d` — no se requiere instalar PostgreSQL en el
  host bajo ninguna circunstancia.
- Ningún endpoint HTTP existente eliminado o con firma incompatible;
  cinco endpoints nuevos (`GET/PUT/POST/DELETE .../progress/*`,
  `GET/POST/DELETE .../certification/history`/`legacy-import`,
  `GET .../learning-profile`, `GET /api/me`).

## Hardening del release candidate

Auditoría del diff acumulado completo (`v1.6.1..HEAD`, 89 archivos, los
6 bloques funcionales). Hallazgos reales de esta pasada:

- **Flake de test transitorio investigado a fondo**: un test de
  frontend (`CertificationSetupPage.test.tsx`) falló una vez en la
  suite completa; reproducido 8/8 veces en aislamiento (test solo) y
  3/3 veces como archivo completo — nunca reprodujo fuera de la suite
  completa bajo carga pesada de Docker/Playwright concurrente. La
  lógica del componente es puramente síncrona (sin timers, sin
  condición de carrera real) — clasificado como contención de CPU en
  el pool de workers de Vitest, no como bug de producto ni de test. Sin
  cambios de código ni de timeout.
- **Documentación desactualizada real, corregida**: el banner de
  README todavía describía a v1.6.1 como "release candidate local, sin
  publicar" — desactualizado desde que v1.6.1 se publicó de verdad.
  `docs/CONFIGURATION.md` seguía documentando `APP_VERSION=1.6.1` como
  valor vigente. `docs/ARCHITECTURE.md` no representaba explícitamente
  la cadena Identity Provider → AppUser → PostgreSQL →
  LearningProfileService — agregada.
- Dos bugs reales encontrados **en scripts de QA de esta misma sesión**
  (nunca en el producto): un `ctx.addInitScript` de Playwright que se
  re-ejecuta en cada navegación (resucitando un documento legacy
  sembrado para la prueba, después de que el propio reset ya lo había
  borrado — falso negativo de "reset no resucita"), y un manejador de
  diálogo (`page.once`) registrado de forma frágil justo antes de un
  click puntual en vez de una sola vez por contexto. Documentados para
  que scripts de QA futuros no repitan el mismo patrón.
- Resto de la auditoría (permanent persistence, `LearningState`
  nunca persistido, cero re-derivación client-side, `localStorage`/
  `sessionStorage`, dead-writer decision, top-50, duplicate slugs,
  stale data, seguridad/privacidad, identity/Entra readiness,
  Markdown/Tutor/Certification freeze) sin hallazgos nuevos — reconfirmada
  real contra el runtime Docker vivo, con Postgres desechable aislado
  para el fresh install, y con Playwright/Chromium real para los 14
  escenarios de browser E2E (incluyendo Rich Markdown y Read Aloud,
  nuevos en esta pasada respecto a los bloques anteriores).

799 tests de backend (sin cambios sobre Bloque 6) / 719 de frontend
(sin cambios sobre Bloque 6, 3 corridas completas consecutivas limpias
para el audit de flakiness) pasando; `tsc`/`vite build` limpios; build
Docker exitoso; `doctor.ps1` → "Todo en orden"; Alembic en `0003`,
single head.
