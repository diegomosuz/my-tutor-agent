# Product Audit — PwC AI Tutor (Fase 8)

Estado real del producto al momento de esta auditoría (release candidate
v1.0.0), no el producto deseado. Cada subsistema indica qué está
**Implemented**, cómo fue **Validated**, y qué **Known limitation**
queda (deliberada, documentada en `docs/ROADMAP.md` si aplica).

## Frontend

- **Implemented**: React 18 + TypeScript + Vite 6, sin librería de estado
  global. Rutas: catálogo, curso, aula, tutor/checkpoints embebidos en el
  aula, certificación (setup/práctica/simulacro/resultados),
  configuración, 404. `ErrorBoundary` raíz.
- **Validated**: 190 tests Vitest + React Testing Library, `tsc --noEmit`
  limpio, build de producción exitoso, QA visual en 5 resoluciones (1920→
  400px) sin overflow horizontal, QA E2E real contra el backend con LLM
  configurado (catálogo→curso→aula→lección real→tutor real→certificación
  real→resultados→configuración→404→catálogo, 0 errores de consola).
- **Known limitation**: sin Cypress/Playwright como dependencia del
  repo (deliberado); "Mi aprendizaje" y "Recursos" son placeholders (ver
  `docs/ROADMAP.md` Fase 10).

## Backend

- **Implemented**: FastAPI + Pydantic v2, 18 endpoints reales bajo
  `/api/*` (ver sección "API contract" abajo) + `/docs`/`/redoc`/
  `/openapi.json` de FastAPI. Routers finos: toda la lógica de negocio
  vive en `app/services/*`.
- **Validated**: 326 tests pytest, todos deterministas (sin llamadas de
  red reales; providers LLM mockeados o inyectados vía `FakeLLMProvider`).
- **Known limitation**: ninguna conocida a nivel de arquitectura backend.

## Docker

- **Implemented**: `docker-compose.yml` con dos servicios (`backend`,
  `frontend`), ambos con usuario non-root, healthchecks, `.dockerignore`.
  `frontend/Dockerfile` usa `npm ci` sobre un `package-lock.json`
  commiteado (corregido en esta fase, ver bug #4 abajo).
- **Validated**: `docker compose config` válido; build `--no-cache`
  completo exitoso en un proyecto aislado; `docker compose up/ps`
  confirmando ambos containers `healthy`.
- **Known limitation**: sin `restart:` policy explícita (aceptable para
  una app local de desarrollo; el usuario reinicia manualmente o vía
  `scripts/start.ps1`). Frontend sigue sirviéndose con el dev server de
  Vite (decisión documentada en `docs/ARCHITECTURE.md` sección 11: no se
  introduce Nginx para una app local dockerizada).

## Filesystem de cursos

- **Implemented**: `COURSES_HOST_PATH` (host) → `/content` (container,
  read-only). Resolución curso/módulo/tópico siempre por enumeración +
  comparación de slug, nunca concatenación de input crudo. Ignora
  `.DS_Store`/`Thumbs.db`/`desktop.ini`/`__MACOSX`/`node_modules`/ocultos.
- **Validated**: tests de discovery (archivos basura, cursos/módulos
  vacíos), diagnóstico read-only por curso, regresión con curso externo
  real (fuera del repo) con Markdown/PNG/JPG/link/code/table.
- **Bug real encontrado y corregido esta fase**: un curso/módulo/tópico
  podía ser un symlink apuntando fuera de `/content` (ver sección
  "Bugs encontrados" abajo) — corregido, con 3 tests de regresión nuevos.

## Canonical content / Grounding

- **Implemented**: `markdown-it-py` determinístico → `SourceBlock`
  (`SRC-001`, ...) → `CanonicalTopicContent` (+ `content_sha256`) →
  Grounding Packet de texto plano.
- **Validated**: 27 tests (`test_canonical.py`) cubriendo UTF-8,
  frontmatter presente/ausente, headings ATX y Setext, listas, código,
  tablas, blockquotes, imágenes, links, Markdown sin salto de línea final,
  líneas en blanco múltiples, y las invariantes de determinismo
  (mismo contenido → mismo hash/mismos blocks; reparseo determinístico).
- **Known limitation**: ninguna.

## LLM providers

- **Implemented**: `LLMProvider` (ABC) con `PwCGenAIProvider`
  (`POST {PWC_GENAI_BASE_URL}/chat/completions`, `temperature=0`,
  prioridad `PWC_GENAI_API_KEY` > `GEN_AI_API_KEY`) y `OpenAIProvider`
  (SDK oficial, `chat.completions.parse`, `temperature=0`). Selección
  siempre por configuración del backend (`LLM_PROVIDER`), nunca por
  request HTTP.
- **Validated**: matriz de fallos completa para ambos proveedores (sin
  key, 401/403→`LLMAuthError`, timeout/conexión/5xx→`LLMUpstreamError`,
  JSON inválido, `choices` vacío, contenido faltante, refusal) vía mocks;
  ninguno filtra la credencial en el mensaje de error.
- **Known limitation**: 403 se prueba solo por inspección de código (misma
  rama que 401 en ambos providers), no con un test HTTP dedicado — el
  camino de código es idéntico, por lo que un test adicional sería
  redundante.

## Lesson generation

- **Implemented**: `LessonGenerator` → Grounding Packet → prompt versionado
  (`lesson-v2`) → `GeneratedLessonBody` (validación Pydantic) →
  `validate_lesson_body` (grounding) → `LessonPlan` ensamblada por el
  backend. Reintentos acotados (`MAX_GENERATION_ATTEMPTS=3`).
- **Validated**: smoke test real (esta fase): generación real vía OpenAI
  (~10.4s), luego cache hit real (~0.13s, `cached: true`).
- **Known limitation**: ninguna nueva esta fase.

## Classroom

- **Implemented**: `useClassroomEngine` (progreso/playback/narración) +
  `SceneRenderer` + 11 visuals. `pause()`/`resume()` preservan
  `currentSceneIndex`/`currentNarrationIndex` por construcción.
- **Validated**: recorrido real de escenas, pausa/reanudación al preguntar
  al tutor, sin pérdida de estado (confirmado en QA E2E real).
- **Known limitation**: ninguna nueva esta fase.

## Voice

- **Implemented**: Web Speech API del navegador (siempre disponible) +
  TTS neural opcional (`SpeechService`, SDK `openai`,
  `client.audio.speech.create`), unificados en `voicePlayback.ts`
  (`cancelAllSpeech`/`pauseAllSpeech`/`resumeAllSpeech` actúan sobre ambos
  backends siempre). Cache de audio en filesystem por
  `model+voice+instructions+speed+text`.
- **Validated**: smoke test real con `POST /api/speech` (audio MP3 válido,
  cache hit confirmado con bytes idénticos); confirmado en QA E2E que el
  texto leído es exactamente `narration.text`/`stem`/`feedback.text` sin
  reformular; cleanup de `URL.revokeObjectURL` y cancelación en
  unmount/scene-change/tutor-interrupt confirmados por tests e inspección.
- **Bug real encontrado y corregido esta fase**: cache key de audio no
  tenía test explícito para cambio de `model` (los otros 4 componentes de
  la key sí lo tenían) — agregado.

## Tutor

- **Implemented**: `TutorService`, grounded exclusivamente contra el
  Grounding Packet del tópico; `recent_history`/contexto de escena nunca
  autoritativos (marcado explícitamente en el prompt).
- **Validated**: pregunta real end-to-end en QA E2E (respuesta grounded
  citando `SRC-002`, pausa/reanudación de clase reales).
- **Known limitation**: ninguna nueva esta fase.

## Checkpoints

- **Implemented**: `CheckpointService`, `expected_answer` pasado al LLM
  únicamente como contexto no autoritativo; evaluación siempre contra el
  Grounding Packet.
- **Validated**: sin cambios esta fase; suite existente (153+ tests que lo
  cubren) sigue pasando.
- **Known limitation**: ninguna nueva esta fase.

## Certification

- **Implemented**: `CertificationService`, generación por tópico,
  ensamblaje/evaluación 100% determinísticos (sin LLM).
  `ExamQuestionView` nunca incluye `correct_option_ids`/`explanation`/
  `competency`/`derivation_refs` (confirmado en el contrato Pydantic Y en
  los tipos TypeScript).
- **Validated**: práctica real generada y respondida en QA E2E (feedback
  grounded correcto); lenguaje de producto confirmado (nunca insinúa
  aprobación oficial).
- **Bug real encontrado y corregido esta fase**: `actual_count: 0` (scope
  sin material suficiente) no estaba guardado — `useCertificationExam.
  prepare()` navegaba igual a una página que rompía al acceder a
  `questions[0]` (undefined). Corregido con guard en `prepare()` +
  guard defensivo adicional en ambas páginas + 3 tests nuevos.

## Caches

- **Implemented**: `LessonPlan`/`QuestionBank`/audio TTS, todas en
  filesystem, todas con `CACHE_SCHEMA_VERSION` en la key. Lesson:
  `course/module/topic/content_sha256/provider/model/prompt_version`.
  Certification: ídem + `items_per_topic`. Speech:
  `model/voice/instructions/speed/text`.
- **Validated**: 5 tests dedicados de aislamiento (`test_cache_isolation.py`)
  + tests históricos de cache-miss por provider/model/prompt_version en
  lesson y certification + tests de cache-key por componente en speech
  (ahora completos, incluyendo `model`).
- **Known limitation**: ninguna.

## Course assets

- **Implemented**: `GET .../assets/{asset_path:path}`, allow-list
  `.png/.jpg/.jpeg/.webp/.gif`, resolución siempre vía el repositorio
  seguro de cursos, contención `is_relative_to` + ahora también exclusión
  de symlinks en el discovery (ver bug de symlink).
- **Validated**: 12 tests de traversal/tipo/MIME + 1 test nuevo de
  symlink de asset individual; regresión real con curso externo (PNG+JPG).
- **Known limitation**: sin soporte de `.svg` (deliberado, puede contener
  contenido activo).

## Windows scripts

- **Implemented**: `setup.ps1`/`start.ps1`/`stop.ps1`/`doctor.ps1`, ASCII
  puro (evita el bug de encoding UTF-8/PowerShell 5.1 de Fase 7).
- **Validated**: `doctor.ps1` corrido en vivo esta fase contra el stack
  real, todos los checks en verde.
- **Known limitation**: `setup.ps1` interactivo completo no se re-corrió
  end-to-end esta fase (ya validado exhaustivamente en Fase 7 con
  funciones aisladas); riesgo bajo, sin cambios de código en este script.

## Diagnostics / System status

- **Implemented**: `GET /api/system/course-diagnostics` (read-only, aísla
  errores por curso), `GET /api/system/status` (sin secretos).
- **Validated**: confirmado sin secretos vía test dedicado; confirmado
  aislamiento cruzado entre cursos.
- **Known limitation**: ninguna.

## Security controls

- **Implemented**: allow-list de assets, contención de filesystem +
  exclusión de symlinks, `X-Request-ID` con validación de formato/largo,
  `SecurityHeadersMiddleware` (nosniff, Referrer-Policy), `SafeMarkdown`
  (sin `dangerouslySetInnerHTML`, bloquea esquemas peligrosos en
  links/imágenes — reforzado por el propio sanitizador de URLs de
  `react-markdown`), answer key de certificación nunca antes de responder,
  logging sin secretos/texto crudo en ningún evento.
  API keys nunca llegan al navegador.
- **Validated**: búsquedas exhaustivas (XSS/eval/innerHTML/iframe/srcdoc,
  secrets en `frontend/src`, secrets en todo el historial de git,
  logging de prompts/respuestas/historial), symlink traversal (nuevo),
  request-id malformado/excesivamente largo (nuevo).
- **Known limitation**: sin CSP (decisión documentada — romper el dev
  server de Vite sin beneficio real en un contexto 100% local).
