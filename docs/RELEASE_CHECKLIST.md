# Release Checklist

Checklist reproducible para preparar cualquier release futuro de
PwC AI Tutor. Basado en el proceso real seguido para v1.0.0, extendido en
v1.7.0 con PostgreSQL/identidad/migración de perfil funcional (ver
sección "PostgreSQL / Identidad / Learning Profile" más abajo) — aplica
desde v1.7.0 en adelante, se omite completa en releases anteriores sin
persistencia server-side.

## Git

- [ ] `git status` — working tree limpio antes de empezar.
- [ ] `git log --oneline -10` — HEAD es el commit esperado.
- [ ] `git diff` / `git diff --cached` antes de cada commit — revisar
      contenido real, no solo nombres de archivo.
- [ ] Sin `.env`, API keys, caches (`data/*-cache/*`, solo `.gitkeep`),
      audio generado, capturas de QA, cursos externos temporales,
      `node_modules`, `dist`, artefactos de coverage.

## Tests

- [ ] Backend: `docker compose run --rm backend pytest` — 100% verde.
- [ ] Frontend: `docker compose run --rm frontend npm test -- --run` —
      100% verde.
- [ ] Frontend typecheck: `npx tsc --noEmit` sin errores.
- [ ] Ningún test se borró para "hacer pasar" un cambio; si una
      expectativa cambió legítimamente, está documentado por qué.
- [ ] Suite de frontend completa ejecutada al menos 3 veces consecutivas
      antes del RC — si algún test falla una sola vez, investigar en
      aislamiento (test solo, archivo solo) antes de clasificarlo como
      flakiness de infraestructura vs. bug real; nunca subir un timeout
      sin evidencia de que el contrato temporal era incorrecto.

## Build

- [ ] `docker compose run --rm frontend npm run build` exitoso.
- [ ] `docker compose config` válido.
- [ ] `docker compose build` (con cache) exitoso.
- [ ] `docker compose build --no-cache` exitoso en un proyecto Compose
      aislado (nombre de proyecto distinto, sin tocar el stack de
      desarrollo activo).

## Seguridad

- [ ] Grep de `dangerouslySetInnerHTML`/`eval(`/`new Function`/
      `innerHTML =`/`document.write`/`<iframe`/`srcdoc` en `frontend/src`
      — solo comentarios, cero usos reales.
- [ ] Grep de `OPENAI_API_KEY`/`PWC_GENAI_API_KEY`/`GEN_AI_API_KEY`/
      `sk-`/`Bearer ` en `frontend/src` — cero secretos reales.
- [ ] `git log -p --all` — sin secretos reales en ningún commit histórico.
- [ ] Traversal de assets (`../`, absoluto, encoded) y symlink escape
      (curso/módulo/tópico/asset symlinkeado fuera de `/content`) — 404
      en todos los casos.
- [ ] `ExamQuestionView`/tipos TS de certificación — sin
      `correct_option_ids`/`explanation`/`derivation_refs` antes de
      responder.
- [ ] Logging — sin API keys, Authorization, prompts completos, Grounding
      Packet completo, historial de conversación completo, respuestas
      crudas del LLM.

## Secrets / .env

- [ ] `.env.example` vs `Settings` (config.py) vs `docker-compose.yml`
      vs `docs/CONFIGURATION.md` — sin variables huérfanas en ningún
      sentido (documentada-no-usada, usada-no-documentada,
      presente-en-Settings-no-en-compose, default stale).

## Cursos

- [ ] Curso de demo incluido carga correctamente.
- [ ] Curso externo real (fuera del repo, con Markdown + imagen + link +
      código + tabla) carga correctamente vía `COURSES_HOST_PATH`.
- [ ] Diagnóstico de cursos (`/api/system/course-diagnostics`) aísla
      errores por curso sin romper el catálogo.

## LLM

- [ ] `LLM_PROVIDER=pwc` sin credencial → `configured: false`, `503` claro.
- [ ] `LLM_PROVIDER=openai` sin credencial → ídem.
- [ ] Con credencial real (si disponible): una generación real + una
      cache-hit confirmada.
- [ ] `LLM_PROVIDER` y `VOICE_PROVIDER` decoupled: probar al menos una
      combinación cruzada real (ej. `pwc` + voz `openai`).

## Voz

- [ ] Voz del navegador funciona sin ninguna credencial.
- [ ] Voz neural (si hay `OPENAI_API_KEY`): una síntesis real + cache-hit
      con bytes idénticos.
- [ ] Fallback a voz del navegador ante error de voz neural, sin romper
      la clase.

## Certificación

- [ ] Evaluación determinística (single/multiple/sin responder/parcial)
      — sin LLM en la ruta de evaluación.
- [ ] Ningún string de UI insinúa aprobación oficial de una certificación
      externa.
- [ ] `actual_count: 0` (scope sin material suficiente) no rompe la UI.

## Browser E2E real (desde v1.7.0)

- [ ] Playwright/Chromium disponible: instalar en un proyecto Node
      AISLADO dentro del scratchpad de la sesión (`npm install
      --no-save playwright` + `npx playwright install chromium`) —
      nunca como dependencia de `frontend/package.json`. Eliminar el
      proyecto del scratchpad al finalizar (nunca queda dentro del
      repo, nunca se commitea).
- [ ] Antes de correr la suite: `docker compose restart frontend`
      explícito + verificación directa (ej. `curl` sobre un módulo
      servido) de que el código activo corresponde al commit actual —
      el dev server de Vite sobre bind mount de Docker Desktop/Windows
      puede quedarse sirviendo código viejo en sesiones largas (hallazgo
      real de v1.7.0 Bloque 5/RC).
- [ ] Escenarios mínimos: fresh user, legacy upgrade, F5, topic
      completion real, Certification real, Learning Profile update,
      cross-context misma identidad, usuario distinto aislado, Guided
      Review, Verification Before/After, reset sin resurrección,
      Postgres outage/recovery, smoke de Rich Markdown (imagen + tabla +
      código real), smoke de Read Aloud donde la automatización lo
      permita.
- [ ] 0 errores de consola inesperados en todos los contextos/escenarios
      usados.
- [ ] Sin request storms: `GET .../learning-profile` ~1 vez por carga
      normal de curso (instrumentado contando requests HTTP reales),
      nunca 1 por tópico.
- [ ] Cualquier fallo de un script de QA se investiga hasta la causa
      raíz antes de aceptar un resultado como "bug real de producto" —
      un `addInitScript`/handler de diálogo/selector mal escrito en el
      propio script de QA es un falso negativo, no una regresión.

## Responsive / QA visual

- [ ] 5 resoluciones (1920/1440/1024/768/400) × pantallas principales
      (Catálogo, Curso, Aula, Tutor activo, Certificación setup/práctica/
      simulacro/resultados, Configuración, 404) — sin overflow horizontal,
      sin errores de consola.

## Docs

- [ ] README actualizado (Quick Start Windows arriba de todo).
- [ ] `docs/COURSE_FORMAT.md`, `docs/CONFIGURATION.md` reflejan la
      realidad del código.
- [ ] `docs/PRODUCT_AUDIT.md` actualizado si el estado de algún subsistema
      cambió.
- [ ] `docs/RELEASE_NOTES_v{version}.md` nuevo, con capabilities/
      limitations/security model reales de esa versión.

## Instalación limpia

- [ ] Proyecto Compose aislado, `build --no-cache`, `up -d`, sin ninguna
      credencial — confirmar backend/frontend/`/ready`/catálogo/estado
      IA-no-configurada, luego destruir el proyecto aislado sin tocar el
      stack de desarrollo real.

## PostgreSQL / Identidad / Learning Profile (desde v1.7.0)

- [ ] `alembic heads` → un único head, nunca más de una revisión con
      cero hijos (branching accidental).
- [ ] Fresh install real: Postgres + backend DESCARTABLES (container
      aparte, red del proyecto, nunca el volumen `postgres_data` de
      desarrollo) — `alembic upgrade head` desde vacío aplica todas las
      revisiones en orden; primer usuario/primer progreso/primera
      Certification/reinicio sin pérdida de datos; destruir los
      containers descartables al final.
- [ ] Upgrade simulado desde la versión anterior: `localStorage` con el
      shape real de `pwc-tutor:learning-progress:v1` (topic progress +
      Certification history), server vacío para ese usuario/curso →
      cargar el candidato → bootstrap legacy corre ANTES del primer
      `GET .../learning-profile` visible, sin flash de perfil vacío
      falso.
- [ ] Reset (Topic Progress / Certification / total si existe) → reload
      → el legacy jamás resucita (ni por el marcador cliente, ni por una
      manipulación directa de `localStorage` después del import).
- [ ] Multi-usuario real: dos identidades dev (`X-Dev-User` distinto)
      con el mismo curso/módulo/tópico → filas completamente
      independientes, verificadas con `psql` directo (`user_id`
      distinto, nunca cruzado).
- [ ] Cross-browser/cross-context real: segundo `BrowserContext` de
      Playwright, sin copiar `localStorage`/`sessionStorage`, misma
      identidad dev → mismo perfil server-side.
- [ ] Postgres detenido: `/api/ready` → `not_ready` (200, nunca 503 — es
      un probe); `/api/me`, `/api/progress/...`,
      `.../certification/history`, `.../learning-profile` → `503` real
      (nunca 500 crudo, nunca un perfil vacío fingido). Postgres
      reiniciado: recuperación automática, sin pérdida de datos, sin
      reparación manual.
- [ ] `deriveCourseLearningStates`/`deriveTopicLearningState`/
      `deriveTopicLearningSignal` (frontend): cero callers de producción
      — solo tests/oráculo de paridad. `LearningState` nunca tiene tabla
      propia en `backend/app/db/models.py`/`alembic/versions/`.
- [ ] Ningún endpoint de progreso/certificación/perfil acepta `user_id`
      del cliente — la identidad se resuelve siempre server-side.
- [ ] `AUTH_MODE=entra` sigue fallando explícito (nunca fallback
      silencioso); 0 endpoints de auth propia (`register`/`login`/
      `forgot-password`/`reset-password`); 0 columnas de password/salt/
      hash/reset_token en el schema real.

## Adaptive Tutor (desde v1.8.0)

- [ ] Alembic sigue en `0003` single head — Adaptive Tutor no agrega
      ninguna tabla persistente (`TutorLearningContext`/
      `TutorTeachingPolicy`/`TutorInteractionPolicy`/`TutorMicroCheck`/
      feedback formativo: todos derivados por request, ninguno con
      modelo en `backend/app/db/models.py`).
- [ ] `TutorTeachingPolicy`/`TutorInteractionPolicy` se derivan
      exclusivamente de `TutorLearningContext` (nunca vuelven a leer
      `topic_progress`/`certification_attempts` directamente) — 0 SQL,
      0 llamadas LLM, 0 randomness en sus builders.
- [ ] `micro_check_question`/`student_answer` tratados siempre como
      DATA no confiable en el prompt de feedback (nunca autoridad) —
      batería de prompt-injection dedicada verde.
- [ ] Salida malformada del proveedor (verdict/kind inválido, campos
      faltantes, campos extra peligrosos como `score`/`answer_key`/
      `mastered`) rechazada o ignorada de forma segura — nunca
      pass-through.
- [ ] Micro-check: máximo 1 por respuesta, grounded exclusivamente
      `SRC-XXX` del tópico actual (nunca `COURSE-SRC-XXX`, reforzado
      estructuralmente), sin answer key, sin score, opt-out y pedido
      explícito del alumno respetados.
- [ ] Responder correcta/parcial/incorrectamente un micro-check NUNCA
      muta `LearningState`/`topic_progress`/`certification_attempts` —
      probado con snapshot real de Postgres antes/después (incluyendo
      10 repeticiones consecutivas de cada veredicto).
- [ ] Aislamiento multiusuario real: dos identidades dev con
      `LearningState` distinto (Postgres real) producen
      `TutorLearningContext`/`TutorTeachingPolicy`/`TutorInteractionPolicy`
      distintos para la misma pregunta; la interacción de un alumno
      nunca contamina el perfil de otro.
- [ ] Matriz de 4 estados (`not_started`/`progressing`/`needs_review`/
      `mastered`) + overrides explícitos del alumno ("desde cero",
      "avanzado", opt-out, pedido explícito de comprobación)
      confirmados con QA real (Postgres + proveedor LLM real).
- [ ] `POST .../tutor` y `POST .../tutor/micro-check/feedback`: ambos
      responden `503` controlado ante una caída real de Postgres (nunca
      un contexto/política falsos), y ambos se recuperan sin
      intervención manual al reiniciar Postgres.
- [ ] Frontend: `MicroCheckCard` es estado 100% efímero (`useState`,
      nunca `localStorage`/`sessionStorage`/persistencia de backend); un
      refresh lo hace desaparecer por diseño, documentado explícitamente.
- [ ] Instalación desde una base de datos vacía (Postgres descartable,
      nunca el volumen real): migraciones `0001→0002→0003`, primer
      `AppUser`, Topic Progress, Learning Profile y la cadena completa
      de Adaptive Tutor (`TutorLearningContext`→`TutorTeachingPolicy`→
      `TutorInteractionPolicy`) funcionan sin ninguna migración
      adicional.

## Versión

- [ ] `APP_VERSION` actualizado en `backend/app/config.py`,
      `.env.example`, `docker-compose.yml` (default), y
      `docs/CONFIGURATION.md` — todos coherentes entre sí (test
      automático: `test_config_version_consistency.py`).
- [ ] Versión de prompts (`LESSON_PROMPT_VERSION`, etc.) NO se cambia solo
      por el release — solo cuando el prompt en sí cambió.

## Commit y tag

- [ ] Commit final con mensaje descriptivo (`chore: prepare vX.Y.Z
      release candidate` o similar).
- [ ] El tag `vX.Y.Z` se crea SOLO después de revisión humana explícita
      del informe de release — nunca automáticamente en la misma sesión
      que preparó el candidate.
