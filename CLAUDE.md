# CLAUDE.md — Contrato del proyecto PwC AI Tutor

Este archivo es el contrato permanente para cualquier sesión futura de
Claude Code (o de cualquier ingeniero) que trabaje sobre este repositorio.
Las reglas descritas acá tienen prioridad sobre decisiones ad-hoc: si una
tarea futura entra en conflicto con este documento, el documento gana salvo
que el usuario indique explícitamente lo contrario.

## 1. Objetivo del producto

**PwC AI Tutor** es un aula virtual inteligente para cursos técnicos.

Jerarquía de contenido:

```
Curso -> Módulos -> Tópicos
```

Cada tópico es un archivo Markdown. El LLM (cuando se implemente) podrá
reorganizar pedagógicamente, resumir, explicar con otras palabras, generar
diagramas, slides, narración, preguntas, checkpoints y preguntas estilo
examen de certificación — pero **siempre y exclusivamente** a partir del
contenido del/los tópico(s) correspondientes.

## 2. Regla absoluta de grounding (NO NEGOCIABLE)

> El contenido Markdown de cada tópico es la ÚNICA fuente de verdad.

El LLM **nunca** debe incorporar conocimiento externo al Markdown del
tópico. Está explícitamente prohibido que el sistema invente:

- hechos
- ejemplos
- estadísticas
- productos
- características
- relaciones
- recomendaciones técnicas
- datos

Si una pregunta no puede responderse utilizando el contenido autorizado, el
tutor debe decir explícitamente que el tema no está cubierto por el
material disponible. Nunca debe "completar" con conocimiento general del
modelo.

Cualquier funcionalidad que implique generación de contenido (resúmenes,
diagramas, slides, narración, preguntas, exámenes) debe poder justificarse
citando o derivando directamente del Markdown de origen.

**Regla de trazabilidad (Fase 2 en adelante):**

> Every LLM-generated pedagogical assertion must ultimately be traceable to
> one or more valid SourceBlock references.

En la práctica: toda afirmación pedagógica generada por el LLM debe poder
señalar la(s) referencia(s) `SRC-XXX` del `CanonicalTopicContent` de las
que se deriva, y esas referencias deben validarse contra los
`source_blocks` reales del tópico con `validate_source_refs` /
`assert_valid_source_refs` (ver `backend/app/services/canonical.py`) antes
de aceptar la respuesta como válida. Una respuesta que cite una referencia
inexistente, o que no cite ninguna referencia, no debe considerarse
confiable. Esta validación es puramente determinística (no usa un LLM).

## 3. Stack tecnológico

- **Frontend**: React + TypeScript + Vite
- **Backend**: Python 3.11 + FastAPI + Pydantic
- **Infraestructura**: Docker + Docker Compose
- **Persistencia**: ninguna (por ahora). El contenido vive en el filesystem
  de cursos. El progreso del alumno se guardará más adelante en
  `localStorage` del navegador.

### Explícitamente prohibido (a menos que el usuario lo pida explícitamente)

Kubernetes, K3s, PostgreSQL, MongoDB, Redis, RabbitMQ, Celery, LangChain,
LangGraph, bases de datos vectoriales, microservicios, event buses.

## 4. Principios de simplicidad

- La arquitectura es intencionalmente simple: `browser -> React -> HTTP
  REST -> FastAPI -> filesystem de cursos + proveedores LLM`.
- No agregar una base de datos "por si acaso".
- No introducir un framework de orquestación de agentes para tareas que
  puede resolver una función Python simple.
- Preferir explícito sobre implícito, y pocas dependencias sobre muchas.
- Cada fase nueva debe justificar su complejidad; no se anticipan
  abstracciones que no tengan un consumidor real todavía.

## 5. Filesystem de cursos

El backend lee contenido desde un directorio montado en `/content` (ver
`docker-compose.yml`, variable `COURSES_HOST_PATH`). El backend **solo
lee**; nunca escribe ni modifica ese directorio (se monta `read_only:
true`).

Estructura:

```
/content/
    <curso>/                      (directorio de primer nivel = curso)
        <modulo>/                 (directorio dentro del curso = módulo)
            <topico>.md            (archivo .md dentro del módulo = tópico)
```

Reglas de interpretación:

- Los directorios/archivos pueden tener prefijos numéricos para definir
  orden (`01-fundamentos`, `02-arquitecturas`). El prefijo se usa para
  ordenar y se quita al mostrar el nombre.
- Guiones y underscores se convierten en espacios al mostrar el título.
- El identificador (`id`) usado en las URLs de la API es un slug derivado
  del nombre de archivo/directorio (sin prefijo numérico, en minúsculas).
  El backend **nunca** construye una ruta de filesystem directamente a
  partir del `id` recibido en un request: siempre enumera las entradas
  reales del directorio y compara sus slugs contra el id solicitado. Esto
  es lo que impide el path traversal por diseño (ver
  `backend/app/services/courses.py`).
- Cada tópico puede tener (opcionalmente) YAML frontmatter:

  ```markdown
  ---
  title: Arquitectura de IA
  order: 1
  description: ...
  ---
  ```

  Si no hay frontmatter, el título y el orden se infieren del nombre de
  archivo. El diseño debe ser siempre tolerante a la ausencia de
  frontmatter.
- El contenido Markdown se devuelve **sin modificar** (no se convierte a
  HTML ni se resume en el backend).

## 6. Modelo canónico y Grounding Packet (Fase 2)

El Markdown de un tópico se transforma, de forma **100% determinística**
(sin ningún LLM involucrado), en un modelo canónico usado para preparar el
contexto que en una fase futura recibirá un LLM:

```
Markdown (sin frontmatter)
    ↓  app/services/canonical.py (markdown-it-py, determinístico)
SourceBlocks (SRC-001, SRC-002, ...)
    ↓
CanonicalTopicContent (+ content_sha256)
    ↓  build_grounding_packet(...)
Grounding Packet (texto plano)
    ↓  (fase futura)
LLM
```

Piezas clave (`backend/app/services/canonical.py`,
`backend/app/models/schemas.py`):

- **`SourceBlock`**: unidad canónica de contenido (heading, paragraph,
  list, code, table, blockquote, image, horizontal_rule, other), con
  `source_ref` estable (`SRC-001`, `SRC-002`, ...) asignado según el orden
  real del documento, `markdown` (texto fuente literal, nunca reformulado),
  `plain_text` (representación auxiliar sin sintaxis Markdown),
  `heading_path` (jerarquía de headings vigente) y `start_line`/`end_line`
  (numeración humana, 1-indexada, sobre el Markdown sin frontmatter).
- **`CanonicalTopicContent`**: agrupa todos los `SourceBlock` de un tópico
  junto con `raw_markdown` y `content_sha256` (SHA-256 del Markdown
  pedagógico exacto en UTF-8; cambia si y solo si cambia el contenido, sin
  usar timestamps).
- **`build_grounding_packet(...)`**: genera el texto determinístico
  `=== AUTHORIZED SOURCE: TOPIC === ... === END AUTHORIZED SOURCE ===` que
  será el único contexto pedagógico entregado a un LLM. Cada sección
  `[SRC-XXX]` contiene exclusivamente Markdown fuente; la aplicación nunca
  inyecta explicaciones ni instrucciones de prompting dentro de esas
  secciones.
- **`validate_source_refs` / `assert_valid_source_refs`**: utilidades para
  detectar referencias `SRC-XXX` inexistentes (ver regla de trazabilidad en
  la sección 2). Se usarán en la fase de integración real del LLM para
  rechazar respuestas que citen fuentes que no existen.

Expuesto en la API (ver sección 9 / `docs/ARCHITECTURE.md`):
`GET .../topics/{topic_id}` incluye un campo `canonical` (resumen: hash +
bloques); `GET .../topics/{topic_id}/grounding` es un endpoint de
inspección/desarrollo que devuelve el Grounding Packet completo (sin
secretos).

## 7. Proveedores LLM (Fase 3: integración real)

El backend soporta dos proveedores intercambiables mediante una interfaz
común (`backend/app/services/llm_provider.py`):

```
LLMProvider (ABC)
  .is_configured() -> bool
  .model -> str
  .generate_structured(*, messages, response_model) -> BaseModel

  PwCGenAIProvider   # POST {PWC_GENAI_BASE_URL}/chat/completions (httpx)
  OpenAIProvider     # SDK oficial openai, client.chat.completions.parse(...)
```

`LessonGenerator` (`backend/app/services/lesson_generator.py`) solo conoce
esta interfaz: no sabe nada de HTTP, headers ni SDKs específicos de cada
proveedor. La selección de proveedor es **siempre configuración del
backend** (`LLM_PROVIDER`); nunca se acepta un provider enviado desde un
request HTTP. Cualquier valor de `LLM_PROVIDER` distinto de `pwc` u
`openai` produce un `LLMConfigurationError` claro (nunca un fallback
silencioso).

Variables de entorno relevantes (ver `.env.example`):

```
LLM_PROVIDER=pwc                 # "pwc" | "openai"
PWC_GENAI_BASE_URL=...
PWC_GENAI_API_KEY=
PWC_GENAI_MODEL=...
GEN_AI_API_KEY=                  # fallback de compatibilidad de PWC_GENAI_API_KEY
OPENAI_API_KEY=
OPENAI_MODEL=
LESSON_CACHE_DIR=/app/data/lesson-cache
LESSON_PROMPT_VERSION=lesson-v1
VOICE_PROVIDER=browser
```

**Regla dura**: las API keys nunca deben llegar al navegador. Todo llamado
a un proveedor LLM ocurre exclusivamente desde el backend. La aplicación
completa (catálogo, cursos, tópicos, Markdown) debe seguir funcionando sin
ninguna credencial configurada; en ese caso `GET /api/ai/status` devuelve
`configured: false` y `POST .../lesson` devuelve `503` (nunca rompe el
arranque de los containers).

## 8. Generación de LessonPlan con LLM (Fase 3)

Pipeline completo:

```
CanonicalTopicContent (Fase 2)
    ↓
Grounding Packet (Fase 2)
    ↓
Prompt Builder (app/prompts/lesson.py) — system prompt + user prompt
    ↓
LLMProvider.generate_structured(...)  — PwCGenAIProvider | OpenAIProvider
    ↓
GeneratedLessonBody  (validación Pydantic automática)
    ↓
validate_lesson_body(...)  (app/services/lesson_validation.py — grounding)
    ↓
LessonPlan  (ensamblada por el BACKEND: ids, content_sha256, provider,
             model, cached — el LLM NUNCA produce estos campos)
    ↓
Cache en filesystem (JSON, LESSON_CACHE_DIR)
    ↓
React (ClassroomPage — vertical slice: título, escena actual, key_points,
       narration, navegación Previo/Siguiente entre escenas)
```

Modelos clave (`backend/app/models/lesson.py`):

- **`GroundedText`**: `{ text, source_refs }`. `source_refs` demuestra
  **trazabilidad estructural** (las referencias citadas existen realmente
  en el `CanonicalTopicContent`) — **no** es una prueba semántica de que el
  texto se infiere correctamente de esos bloques. Ver la distinción exacta
  en `docs/ARCHITECTURE.md` sección "Grounding: qué garantiza y qué no".
- **`VisualPlan`**: especificación **declarativa** (`visual_type` de un
  enum cerrado, `layout_hint`, `source_refs`, `description`). El LLM
  **nunca** puede producir HTML/JS/React/SVG/scripts ejecutables como
  visual — estructuralmente imposible dado el contrato Pydantic (enum
  cerrado + texto libre nunca interpretado como markup).
- **`InteractionPlan`**: `comprehension_check` | `reflection`, sin scoring,
  sin dificultad, sin banco de preguntas, sin persistencia (eso es de una
  fase futura, no de Fase 3).
- **`LessonScene`**: `scene_id` (`SCENE-001`, `SCENE-002`, ... secuencial),
  `scene_type` (enum cerrado), `title`/`key_points`/`narration`
  (`GroundedText`), `visual`, `interaction` opcional.
- **`GeneratedLessonBody`**: lo ÚNICO que el LLM produce
  (`lesson_title`, `learning_objectives`, `scenes`, `recap`). Nunca
  `course_id`/`module_id`/`topic_id`/`content_sha256`/`provider`/`model`/
  cache keys: esos los agrega el backend en `_assemble_lesson_plan`.
- **`LessonPlan`**: `GeneratedLessonBody` + metadata determinística +
  `cached: bool`.

**Validación de grounding** (`app/services/lesson_validation.py`):
recorre TODAS las instancias de `GroundedText` (lesson_title,
learning_objectives, cada scene.title/key_points/narration/interaction,
recap) y cada `VisualPlan.source_refs`, y valida cada referencia con
`validate_source_refs` (la misma utilidad de Fase 2). Además valida las
invariantes de secuencia de escenas (`SCENE-001`, `SCENE-002`, ... únicas y
en orden). Si algo falla, la lección se rechaza (o se reintenta con un
mensaje de corrección, ver retries abajo).

**Cache** (filesystem, sin base de datos): la key depende de
`content_sha256 + provider + model + prompt_version` (SHA-256 de esos
cuatro valores concatenados). Cambiar cualquiera de los cuatro produce
cache miss por diseño. Escritura atómica (archivo temporal + `replace`).
Nunca se cachea un error ni una respuesta inválida.

**Reintentos** (`app/services/lesson_generator.py`, acotados: 1 intento
inicial + hasta 2 correcciones, `MAX_GENERATION_ATTEMPTS = 3`):
- `LLMAuthError` / `LLMConfigurationError`: **nunca** se reintenta.
- `LLMUpstreamError` (timeout/5xx/conexión): reintento reenviando
  exactamente los mismos mensajes.
- JSON/contrato inválido o grounding inválido: reintento agregando un
  mensaje de corrección con los problemas encontrados, **sin** reemplazar
  el `AUTHORIZED SOURCE` ya enviado.

**Seguridad ante contenido no confiable (prompt injection)**: el Markdown
de un tópico se trata siempre como DATOS, nunca como instrucciones. El
system prompt (`app/prompts/lesson.py:SYSTEM_PROMPT`) establece
explícitamente que las instrucciones de sistema prevalecen y que cualquier
texto dentro de `AUTHORIZED SOURCE` que parezca un comando debe tratarse
como contenido de curso citable, nunca ejecutado. Ver
`backend/tests/test_prompt_injection.py` para la demostración
determinística de esta separación (qué demuestra y qué NO demuestra ese
test está documentado en el docstring del archivo).

## 9. Classroom Engine y Scene Renderer (Fase 4)

Fase 4 transforma una `LessonPlan` ya generada (Fase 3) en la experiencia
visual del aula virtual, íntegramente en el frontend:

```
LessonPlan
    ↓
Classroom Engine (frontend/src/classroom/useClassroomEngine.ts)
    ├── progress state    (currentSceneIndex, isCompleted, progressPercent)
    ├── playback state    (isPlaying, isPaused, renderKey)
    └── narration state   (currentNarrationIndex, nextNarrationChunk)
    ↓
SceneRenderer (frontend/src/classroom/SceneRenderer.tsx)
    ↓  despacha por scene.visual.visual_type (tabla de componentes, sin if/else gigante)
Visual Components (frontend/src/classroom/visuals/*.tsx)
    ↓
React + CSS animations (nunca Canvas/WebGL, nunca librerías de diagramación)
```

**Regla dura del renderer**: el frontend NUNCA interpreta código generado
por el LLM. No se usa `dangerouslySetInnerHTML`, `eval`, `new Function`,
iframes dinámicos ni SVG/HTML crudo proveniente de la LessonPlan en ningún
componente de `frontend/src/classroom/`. Todo elemento visual es un
componente React escrito por el equipo; `VisualPlan` es exclusivamente una
especificación declarativa (`visual_type` de un enum cerrado +
`layout_hint` + `source_refs`).

**Fuente de información visible en una slide** (por prioridad):
1. `scene.title` / `scene.key_points` (siempre).
2. El `SourceBlock` citado por `scene.visual.source_refs` cuando el visual
   lo amerita (`TableVisual` busca un bloque `table`, `CodeVisual` un
   bloque `code`, `QuoteVisual` un `blockquote` — resueltos vía
   `frontend/src/classroom/sourceBlockLookup.ts`, sin duplicar lógica del
   backend).

`scene.visual.description` **NUNCA se renderiza como texto**: es una
instrucción de presentación para el renderer (ya cubierta explícitamente
por `layout_hint`), no conocimiento pedagógico nuevo. Ningún componente en
`frontend/src/classroom/visuals/` lee `.description` para mostrar
contenido al alumno (ver el docstring de
`frontend/src/classroom/visuals/types.ts`).

**Cero alucinación introducida por el renderer**: `ProcessVisual`,
`HierarchyVisual`, `ArchitectureVisual` y `ConceptMapVisual` nunca dibujan
una conexión/relación entre dos conceptos que los datos no establezcan
explícitamente (`GroundedText` es una lista plana, sin relaciones
codificadas entre sus elementos) — se muestran como componentes/nodos
dentro de un marco visual, sin flechas semánticas inventadas.
`ComparisonVisual` solo arma dos columnas cuando hay exactamente 2
`key_points` (lo único que permite identificar "dos lados" sin inventar una
clasificación); en cualquier otro caso usa cards paralelas neutrales.

**Progreso local** (`frontend/src/classroom/classroomStorage.ts`): por
tópico se guarda solo `{ courseId, moduleId, topicId, contentSha256,
currentSceneIndex, completed, updatedAt }` en `localStorage` — nunca la
`LessonPlan` completa (esa ya tiene su cache en el backend, Fase 3). Si
`contentSha256` no coincide con el de la `LessonPlan` activa, el progreso
guardado se ignora (el motor arranca desde la escena 0).

**Voz (Web Speech API, `frontend/src/classroom/speech.ts` +
`useClassroomVoice.ts`)**: primera implementación funcional de "Activar
Voz" usando exclusivamente `window.speechSynthesis` del navegador — **no**
es integración con un TTS avanzado (eso es una fase posterior, ver
`docs/ROADMAP.md`). Reglas duras:
- feature detection explícita (`isSpeechSupported()`); sin soporte, el
  botón se deshabilita con un estado claro, nunca rompe la app;
- selección de voz: `es-AR` exacto > cualquier `es-*` > voz default del
  navegador — nunca se asume el nombre de una voz específica instalada;
- el texto leído es SIEMPRE `narration.text` tal cual, sin modificar
  tecnicismos (API Gateway, embedding, fine-tuning, Kubernetes, RAG, etc.);
  la calidad de pronunciación depende de las voces disponibles en el
  SO/navegador del usuario, no de la aplicación;
- sin autoplay: la síntesis solo arranca tras una interacción explícita
  ("Activar Voz"), nunca al simplemente entrar a un tópico;
- Pause/Resume/Repetir/Previo/Siguiente/Salir controlan la síntesis en
  curso (`pause()`/`resume()`/`cancel()`) para evitar voces superpuestas;
- preferencia de velocidad (0.85x/1.0x/1.15x/1.3x) y de voz activada se
  persisten en `localStorage` como valores simples (nunca un objeto
  `SpeechSynthesisVoice`).

Tests: `frontend/src/classroom/__tests__/` (Vitest + React Testing
Library, `jsdom`). Ningún test hace llamadas de red ni depende de un
navegador real: HTTP y `window.speechSynthesis` se mockean explícitamente.

## 10. Tutor bidireccional grounded + Checkpoints (Fase 5)

Fase 5 agrega un tutor conversacional y checkpoints interactivos sobre la
base de Fases 2-4, reutilizando `LLMProvider` sin crear una segunda
abstracción de proveedor.

**Regla dura (idéntica en espíritu a la sección 2)**: el historial de
conversación reciente (`recent_history`), el "contexto de clase generado"
(título/`source_refs` de la escena activa) y `scene.interaction.
expected_answer` **nunca** son fuente de verdad. La única fuente de verdad
sigue siendo el Grounding Packet del `CanonicalTopicContent` (Fase 2). Ver
`docs/ARCHITECTURE.md` sección 8 para los dos flujos completos
(pregunta al tutor / respuesta a un checkpoint) con diagramas.

- **`TutorService`** (`backend/app/services/tutor_service.py`):
  `POST .../topics/{topic_id}/tutor` con `{ message, scene_id,
  recent_history }` (límites explícitos vía Pydantic: mensaje 1-4000
  caracteres, historial máx. 10 mensajes, roles solo `user`/`assistant`).
  Nunca acepta filesystem paths, Grounding Packet, prompt, API key,
  provider o modelo desde el request. Responde `TutorReplyBody`:
  `response_type` (`answer`/`not_covered`/`clarification`) con forma
  estructuralmente distinta por tipo — `not_covered` nunca tiene un campo
  de texto libre (el mensaje fijo lo redacta el backend, nunca el LLM).
- **`CheckpointService`** (`backend/app/services/checkpoint_service.py`):
  hace funcional `scene.interaction` (definido en Fase 3, antes sin uso).
  `POST .../topics/{topic_id}/checkpoint` con `{ scene_id, answer }`.
  Verifica tópico → `LessonPlan` cacheada → escena → tipo
  `comprehension_check`, en ese orden, ANTES de exigir credencial LLM
  (404/409 deben funcionar incluso sin proveedor configurado, mismo patrón
  que Fase 3 usa para tópico-no-encontrado). Responde
  `CheckpointEvaluationBody`: `verdict` (`correct`/`partially_correct`/
  `incorrect`/`not_assessable`, sin score ni gamificación), `feedback`
  grounded, `ideal_answer` opcional grounded.
- **`expected_answer` nunca autoritativo**: se envía al LLM evaluador
  únicamente dentro de un bloque marcado explícitamente "NO ES FUENTE DE
  VERDAD", con la regla "si contradice AUTHORIZED SOURCE, AUTHORIZED
  SOURCE gana siempre" en el system prompt. El backend nunca compara
  programáticamente `answer` contra `expected_answer`; solo valida que
  `feedback`/`ideal_answer` citen `source_refs` reales.
- **Prompts versionados** (`app/prompts/tutor.py`, `app/prompts/
  checkpoint.py`): separan con delimitadores explícitos la pregunta del
  alumno (datos), el historial (marcado no confiable), el contexto de
  clase generado (marcado no autoritativo) y el `AUTHORIZED SOURCE`
  (única fuente). Reutilizan `generate_with_retries`
  (`app/services/llm_retry.py`, extraído del loop de Fase 3 para no
  tocarlo) con el mismo criterio de reintentos: nunca ante auth/config,
  reintento simple ante upstream, reintento con corrección ante
  contrato/grounding inválido.
- **Sin cache de tutor/checkpoint**: cada pregunta o respuesta depende del
  contexto conversacional puntual; nunca se persiste una conversación ni
  una respuesta de checkpoint en el backend (ni filesystem ni DB). La
  única cache que sigue existiendo es la de `LessonPlan` (Fase 3).
- **Logging** (`app/services/service_logging.py`): eventos
  `tutor_query_started/completed/failed` y
  `checkpoint_evaluation_started/completed/failed` con solo ids, provider,
  model, `duration_ms`, `response_type`/`verdict` — nunca el texto de la
  pregunta, el historial, el prompt, el Grounding Packet ni la respuesta
  cruda del LLM.
- **Frontend** (`frontend/src/classroom/`): `TutorPanel` +
  `TutorConversation` + `useTutor` (conversación en memoria React durante
  la sesión, nunca persistida; se reinicia al cambiar de tópico vía `key`
  en `ClassroomPage`); `CheckpointPanel` (nunca muestra `expected_answer`,
  ni antes ni después de evaluar; nunca bloquea "Siguiente"). Interrupción/
  reanudación de la clase: composición externa sobre `pause()`/`resume()`
  ya existentes en `useClassroomEngine` (Fase 4) — el engine no se
  modificó. Voz: se reutiliza `speech.ts` (nueva función `speakSequence`);
  nunca suena la narración de la clase y la respuesta del tutor a la vez.
  Reconocimiento de voz opcional (`speechRecognition.ts`, nuevo): envoltorio
  fino sobre `window.SpeechRecognition`/`webkitSpeechRecognition`, sin
  paquete npm nuevo, deshabilitado con tooltip claro si no hay soporte.
  `source_refs` del tutor solo visibles con `import.meta.env.DEV`. Ningún
  componente usa `dangerouslySetInnerHTML`/`eval`/`new Function` para el
  texto del tutor o del checkpoint.
- **Límite conocido**: el prompt de `LessonGenerator` (Fase 3) nunca pide
  explícitamente un `scene.interaction`; en la práctica la mayoría de las
  `LessonPlan` generadas no incluyen `comprehension_check`. El
  `CheckpointService`/`CheckpointPanel` están completos y probados, pero
  necesitan que una fase futura actualice el prompt de Fase 3 para que un
  checkpoint aparezca de forma consistente en contenido generado real —
  deliberadamente fuera de alcance de Fase 5.

## 11. Convenciones

- Backend en español para nombres de dominio de negocio cuando aporte
  claridad (cursos, módulos, tópicos), pero código, nombres de funciones y
  comentarios técnicos en el idioma que ya predomina en cada archivo
  (actualmente: comentarios en español, identificadores en inglés).
- Los modelos Pydantic viven en `backend/app/models/schemas.py` y son el
  contrato de la API. Los tipos TypeScript en
  `frontend/src/types/api.ts` deben mantenerse como espejo manual de esos
  modelos.
- El backend no reformula, resume ni corrige el contenido pedagógico. El
  parseo canónico (`app/services/canonical.py`) es una transformación
  puramente sintáctica y determinística (segmentación en bloques), no una
  reescritura de contenido; el `content_markdown` que consume el frontend
  para renderizar (con `react-markdown` + `remark-gfm`) sigue siendo el
  Markdown original sin ninguna alteración.
- Toda ruta de filesystem se resuelve enumerando directorios reales, nunca
  concatenando input de usuario directamente (ver sección 5). Lo mismo
  aplica al modelo canónico: nunca acepta una ruta de archivo desde HTTP,
  siempre resuelve curso/módulo/tópico a través del repositorio seguro
  existente antes de parsear.
- Tests de backend con `pytest`, usando `TestClient` de FastAPI y
  `app.dependency_overrides` para inyectar un `content_dir` de prueba
  (ver `backend/tests/conftest.py`). El fixture `client` también aísla
  `LESSON_CACHE_DIR` en un `tmp_path` por test: ningún test toca el
  volumen real `./data/lesson-cache`.
- Los tests de proveedores LLM y del `LessonGenerator` nunca hacen llamadas
  de red: mockean HTTP (`unittest.mock` sobre `httpx.post`) o el SDK de
  OpenAI, o inyectan un `FakeLLMProvider` (`backend/tests/fakes.py`,
  exclusivo para tests) vía el parámetro `provider=` de
  `lesson_generator.generate_lesson`.
- El prompt de generación de lecciones vive en un módulo dedicado
  (`backend/app/prompts/lesson.py`), nunca escondido en un router.
  `LESSON_PROMPT_VERSION` cambia cada vez que el prompt cambia de forma
  que pueda alterar la salida del modelo (forma parte de la cache key).
- El frontend no tiene librería de estado global (Redux/Zustand/XState):
  `useClassroomEngine` es un hook con `useState`/`useEffect` plano. No
  agregar una de estas librerías salvo necesidad real y validada.
- Tests de frontend con Vitest + React Testing Library (`frontend/src/
  classroom/__tests__/`, `frontend/vite.config.ts` sección `test`). Sin
  `globals: true`: cada test importa explícitamente de `"vitest"`: el
  cleanup de RTL entre tests se registra a mano en
  `frontend/src/test/setup.ts`. No hay Cypress ni Playwright en el
  proyecto (validación visual manual, ver `docs/ROADMAP.md`).

## 12. Comandos principales

Todo el entorno corre encapsulado en Docker. No se requiere Python ni Node
instalados en el host.

```bash
# Levantar todo el entorno (backend + frontend)
docker compose up -d --build

# Ver logs
docker compose logs -f backend
docker compose logs -f frontend

# Correr los tests del backend dentro del container
docker compose run --rm backend pytest

# Solo los tests del modelo canónico / grounding (Fase 2)
docker compose run --rm backend pytest tests/test_canonical.py tests/test_grounding.py

# Solo los tests de Fase 3 (providers LLM + LessonGenerator + prompt injection)
docker compose run --rm backend pytest tests/test_llm_provider_pwc.py tests/test_llm_provider_openai.py tests/test_lesson_generator.py tests/test_prompt_injection.py tests/test_ai_endpoints.py

# Solo los tests de Fase 5 (tutor + checkpoints + prompt injection del tutor)
docker compose run --rm backend pytest tests/test_tutor_service.py tests/test_checkpoint_service.py tests/test_tutor_prompt_injection.py tests/test_tutor_endpoints.py tests/test_checkpoint_endpoints.py

# Build de producción del frontend (verificación de tipos + bundle)
docker compose run --rm frontend npm run build

# Tests del frontend (Vitest + React Testing Library)
docker compose run --rm frontend npm test -- --run

# Estado del proveedor LLM configurado (nunca expone la API key)
curl http://localhost:8000/api/ai/status

# Generar (o recuperar de cache) la LessonPlan de un tópico
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/modules/fundamentos/topics/introduccion/lesson

# Preguntarle algo al tutor sobre un tópico (grounded, Fase 5)
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/modules/fundamentos/topics/introduccion/tutor \
  -H "Content-Type: application/json" \
  -d '{"message":"¿Qué es la IA?","scene_id":null,"recent_history":[]}'

# Evaluar la respuesta de un alumno a un checkpoint (Fase 5)
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/modules/fundamentos/topics/introduccion/checkpoint \
  -H "Content-Type: application/json" \
  -d '{"scene_id":"SCENE-001","answer":"una respuesta de prueba"}'

# Bajar el entorno
docker compose down
```

URLs en desarrollo:

- Backend: http://localhost:8000
- Docs interactivas (Swagger): http://localhost:8000/docs
- Frontend: http://localhost:5173

## 13. Estado de fases

Ver `docs/ROADMAP.md` para el detalle de fases futuras.

- **Fase 1** (completa): catálogo de cursos, detalle de curso, aula virtual
  básica (sin LLM, sin TTS, sin generación de slides/preguntas/exámenes) y
  la API REST de lectura de contenido.
- **Fase 2** (completa): modelo canónico de contenido 100% determinístico
  (`SourceBlock`, `CanonicalTopicContent`), Grounding Packet, validación de
  referencias `SRC-XXX`, endpoint de inspección `/grounding`. Sigue sin
  existir ninguna llamada real a un LLM.
- **Fase 3** (completa): primera integración REAL con un LLM.
  `PwCGenAIProvider` / `OpenAIProvider` reales, generación de `LessonPlan`
  grounded (`GeneratedLessonBody` → validación Pydantic → validación de
  grounding → `LessonPlan`), cache en filesystem, reintentos acotados,
  endpoints `GET /api/ai/status` y
  `POST .../topics/{topic_id}/lesson`, e integración vertical mínima en el
  frontend (estado del agente IA, botón "Preparar clase con IA", navegación
  de escenas). Validado con un smoke test real (ver
  `docs/ARCHITECTURE.md`). Sin TTS, sin reconocimiento de voz, sin
  simulador de certificación, sin RAG/embeddings/vector DB, sin agentes
  autónomos.
- **Fase 4** (completa): Classroom Engine (`useClassroomEngine`) +
  `SceneRenderer` + 11 visual renderers (hero, bullets, process,
  comparison, hierarchy, architecture, concept_map, table, code, quote,
  none), animaciones CSS con soporte real de pausa y de
  `prefers-reduced-motion`, progreso local en `localStorage`, primera
  implementación funcional de voz (Web Speech API del navegador),
  controles Previo/Siguiente/Pausa/Repetir/Voz/Salir reales, pantalla de
  finalización con `recap`, pestañas Explicación/Puntos clave/Recursos en
  la columna derecha. Validado con Vitest (30 tests) y con una inspección
  visual real (Playwright headless, ver `docs/ARCHITECTURE.md`). Sin TTS
  de OpenAI, sin chat bidireccional, sin simulador de certificación.
- **Fase 5** (completa): tutor bidireccional grounded (`TutorService`,
  `POST .../topics/{topic_id}/tutor`) con interrupción/reanudación real de
  la clase, y checkpoints interactivos (`CheckpointService`,
  `POST .../topics/{topic_id}/checkpoint`) que hacen funcional
  `scene.interaction` de Fase 3. `expected_answer` nunca autoritativo en la
  evaluación (regla dura, ver sección 10). Frontend: `TutorPanel` +
  `TutorConversation` + `useTutor` + `CheckpointPanel`, voz reutilizando
  `speech.ts` de Fase 4, reconocimiento de voz opcional nuevo
  (`speechRecognition.ts`, sin paquete npm nuevo). 153 tests de backend y
  78 de frontend (39 específicos de Fase 5) pasando; validado con un smoke
  test real (preguntas cubiertas/no cubiertas, prompt injection) y una
  inspección visual real (ver `docs/ARCHITECTURE.md` sección 8). Sin
  resúmenes/reorganización de contenido, sin persistencia de
  conversaciones, sin RAG/embeddings/vector DB, sin simulador de
  certificación, sin TTS de OpenAI.

Cualquier trabajo futuro debe respetar este documento y actualizar la
sección correspondiente del roadmap al avanzar de fase.
