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
LESSON_PROMPT_VERSION=lesson-v2
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
- **Límite conocido, resuelto en Fase 6**: el prompt de `LessonGenerator`
  (Fase 3) no pedía explícitamente un `scene.interaction`, por lo que en la
  práctica casi ninguna `LessonPlan` generada incluía `comprehension_check`.
  Fase 6 agregó la REGLA 13 al prompt (`LESSON_PROMPT_VERSION` pasó de
  `lesson-v1` a `lesson-v2`, invalidando la cache vieja): la clase DEBERÍA
  incluir razonablemente uno o más `comprehension_check` cuando el
  contenido tenga sustancia conceptual suficiente, sin ser una obligación
  absoluta (un tópico breve puede seguir sin ninguno).

## 11. Práctica de certificación grounded (Fase 6)

Fase 6 agrega una práctica/simulacro de preguntas objetivas (single/
multiple choice) generadas exclusivamente a partir del material del curso.

**Aviso de producto (NO NEGOCIABLE, igual jerarquía que la sección 2)**:
esto NO representa ni afirma reproducir un examen oficial de ninguna
certificación externa. Es "práctica orientada a certificación basada
exclusivamente en el material del curso". La UI usa siempre "Simulación
basada en el material del curso" / "Resultado de práctica", nunca lenguaje
de aprobación oficial, passing score oficial, blueprint oficial o
predicción de éxito en un examen real.

- **`CertificationService`** (`backend/app/services/certification_service.py`):
  genera/reutiliza un `QuestionBank` **por tópico** (nunca todo el curso en
  un solo Grounding Packet — evita context overflow y preguntas
  desbalanceadas), resuelve el scope (curso completo / módulos / tópicos,
  siempre contra el repositorio seguro de cursos), ensambla el examen
  (round-robin determinístico entre tópicos, SIN LLM) y evalúa respuestas
  (determinístico, SIN LLM).
- **Tipos de pregunta**: solo `single_choice`/`multiple_choice` (permite
  corrección 100% determinística). **Estilos**: `conceptual`/
  `relationship`/`application` — `application` NUNCA autoriza inventar un
  caso de negocio externo; si la fuente no alcanza para construir la
  situación sin agregar hechos, se usa `conceptual`/`relationship`.
- **Distractores**: el system prompt (`app/prompts/certification.py`)
  exige que se construyan EXCLUSIVAMENTE con conceptos/términos/relaciones
  presentes en la fuente — nunca introduciendo tecnologías, productos,
  nombres o cifras externas, aunque parezcan plausibles.
- **`derivation_refs`** en cada opción significa "bloques fuente usados
  para construir esta opción" — NO significa que la opción sea verdadera.
  Documentado explícitamente en el modelo (`app/models/certification.py`).
- **`ExamQuestionView`**: lo único que el frontend recibe ANTES de
  responder. NUNCA incluye `correct_option_ids`, `explanation`,
  `competency` ni `derivation_refs` — un test dedicado
  (`test_certification_exam_assembly.py::test_public_prepare_response_never_contains_answer_key`)
  serializa la respuesta completa y confirma la ausencia de esos campos.
  El answer key nunca se guarda en React state/sessionStorage/HTML antes
  de evaluar (ver `frontend/src/certification/certificationStorage.ts`).
- **`question_id`** (`Q-001`, `Q-002`, ...) lo asigna el backend después
  de validar, nunca el LLM. `bank_id` es el mismo hash SHA-256 usado como
  nombre del archivo de cache — permite resolver
  `evaluate-question`/`evaluate` por `bank_id + question_id` sin necesitar
  una sesión de servidor. Un `bank_id` con formato inválido (o de otro
  curso) siempre responde 404, nunca intenta construir un path de
  filesystem con él directamente (protección contra path traversal).
- **Evaluación determinística** (`app/services/certification_evaluator.py`,
  sin LLM): `single_choice` exige coincidencia exacta de conjuntos;
  `multiple_choice` distingue `correct` (coincidencia exacta) /
  `partially_correct` (intersección no vacía pero no exacta) / `incorrect`
  (sin intersección, incluida selección vacía). `practice_score_percent`
  usa 1.0 punto por correcta, 0.5 por parcialmente correcta, 0 por
  incorrecta/sin responder — documentado explícitamente, sin porcentajes
  de similaridad.
- **Cache** (filesystem, `CERTIFICATION_CACHE_DIR`, mismo patrón atómico
  que `LessonPlan`): key = `content_sha256 + provider + model +
  certification_prompt_version`. `CERTIFICATION_ITEMS_PER_TOPIC` (default
  6, acotado 1-10) es un OBJETIVO, nunca un mínimo: un tópico corto puede
  devolver menos preguntas (incluso 0), nunca rellenadas artificialmente.
- **Sin generación al cargar nada**: ningún QuestionBank se genera al
  abrir catálogo/curso/módulo/tópico — solo cuando el alumno pulsa
  "Preparar práctica" y falta cache.
- **Frontend** (`frontend/src/certification/` + `frontend/src/pages/
  Certification*Page.tsx`): pantalla dedicada, fuera de `ClassroomPage`.
  `CertificationSetupPage` (scope/modo/cantidad) → `CertificationPracticePage`
  (una pregunta a la vez, feedback inmediato, pregunta bloqueada tras
  corregir) o `CertificationSimulationPage` (sin feedback, navegación
  libre, "Entregar simulacro" con confirmación si hay pendientes) →
  `CertificationResultsPage` ("Resultado de práctica", desglose por
  tópico/competencia, tópicos a reforzar con "Revisar tópico" hacia el
  aula normal — nunca regenera la LessonPlan). Sesión en
  `sessionStorage` (nunca `localStorage`), atada a `course_id`; se limpia
  con "Nueva práctica". Ambos modos terminan llamando al mismo
  `POST .../certification/evaluate` para obtener el resultado (sin
  duplicar la fórmula de score en el cliente).
- **Sin RAG**: la selección de tópicos es determinística desde el
  filesystem/scope pedido — no hay embeddings, vector store ni similarity
  search en ningún punto de esta fase.

## 12. Convenciones

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

## 13. Comandos principales

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

# Solo los tests de Fase 6 (certificación: generación, ensamblaje, evaluador, endpoints)
docker compose run --rm backend pytest tests/test_certification_models.py tests/test_certification_bank_generation.py tests/test_certification_exam_assembly.py tests/test_certification_evaluator.py tests/test_certification_endpoints.py tests/test_certification_prompt_injection.py

# Preparar una práctica de certificación grounded (Fase 6)
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/certification/prepare \
  -H "Content-Type: application/json" \
  -d '{"mode":"practice","scope":{"module_ids":[],"topic_ids":["introduccion"]},"question_count":5}'

# Evaluar una pregunta de práctica (determinístico, sin LLM)
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/certification/evaluate-question \
  -H "Content-Type: application/json" \
  -d '{"bank_id":"<bank_id de /prepare>","question_id":"Q-001","selected_option_ids":["A"]}'

# Bajar el entorno
docker compose down
```

URLs en desarrollo:

- Backend: http://localhost:8000
- Docs interactivas (Swagger): http://localhost:8000/docs
- Frontend: http://localhost:5173

## 14. Estado de fases

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
- **Fase 6** (completa): práctica/simulacro de certificación grounded
  (`CertificationService`, endpoints `POST .../certification/prepare`,
  `evaluate-question`, `evaluate`), 100% basada en preguntas objetivas
  (single/multiple choice) generadas POR TÓPICO y evaluadas
  determinísticamente (sin LLM). `ExamQuestionView` nunca expone el answer
  key antes de responder. Cierre de dos deudas de Fase 5:
  `LESSON_PROMPT_VERSION` avanzó a `lesson-v2` (pide razonablemente
  `comprehension_check` sin obligación absoluta) y el tutor ahora exige
  texto plano sin Markdown decorativo (`TUTOR_PROMPT_VERSION` a
  `tutor-v2`). Frontend: `CertificationSetupPage` / `CertificationPracticePage`
  / `CertificationSimulationPage` / `CertificationResultsPage`, sesión en
  `sessionStorage`. 248 tests de backend y 145 de frontend (86 y 67
  específicos de Fase 6 respectivamente) pasando; validado con un smoke
  test real completo (generación, cache hit, evaluación single/multiple
  choice, simulacro con pregunta sin responder) y una inspección visual
  real de ambos modos + resultados (ver `docs/ARCHITECTURE.md`). Cero
  dependencias nuevas. Aviso de producto explícito en toda la UI: esto NO
  reproduce ni afirma reproducir un examen oficial de ninguna
  certificación externa. Sin ensayo/free-text/coding challenges, sin
  evaluación subjetiva con LLM, sin persistencia de resultados en backend,
  sin historial de intentos, sin TTS de OpenAI.

- **Fase 7** (completa): productización + hardening sobre las Fases 1-6,
  sin features experimentales nuevas. Bugfix real de colisión de cache
  (identidad de tópico ausente de la cache key de `LessonPlan`/
  `QuestionBank`, corregido con `course_id/module_id/topic_id` +
  `CACHE_SCHEMA_VERSION="cache-v2"`, reproducido con test antes del fix).
  Fix de `certificationStorage` para aislar por `practice_id` además de
  `course_id`. Assets de curso: imágenes relativas servidas por un
  endpoint contextual de solo lectura (`.../assets/{asset_path}`,
  allow-list `.png/.jpg/.jpeg/.webp/.gif`, traversal estructuralmente
  imposible), `SafeMarkdown` en el frontend (nunca `dangerouslySetInnerHTML`,
  bloquea `javascript:`/`data:`/`file:`, no auto-carga imágenes externas).
  Diagnóstico de cursos de solo lectura (`GET /api/system/course-diagnostics`)
  y estado general (`GET /api/system/status`) sin exponer secretos, ambos
  reflejados en una nueva pantalla de Configuración (`/configuracion`).
  `ErrorBoundary` raíz + pantalla 404. Fix del overflow horizontal global
  del header/nav en mobile. Voz neural opcional (`SpeechService` +
  `POST /api/speech`, SDK `openai` ya instalado, sin dependencia nueva) con
  cache en filesystem (`data/speech-cache/`), integrada sobre el mismo
  motor de reproducción que la voz del navegador vía una fachada única
  (`voicePlayback.ts`) que garantiza "nunca dos audios simultáneos";
  fallback automático a voz del navegador ante cualquier error de voz
  neural, nunca rompe la clase. `X-Request-ID` por request +
  `SecurityHeadersMiddleware` (nosniff, Referrer-Policy). `GET /api/ready`
  (solo componentes locales, nunca considera falta de credencial como "no
  listo"). Non-root user en ambos Dockerfiles + `.dockerignore`. Scripts de
  Windows (`scripts/setup.ps1` interactivo con credenciales sin eco,
  `start.ps1`, `stop.ps1`, `doctor.ps1`), documentación nueva
  (`docs/COURSE_FORMAT.md`, `docs/CONFIGURATION.md`, sección "Modelo de
  seguridad local" en `docs/ARCHITECTURE.md`, Quick Start Windows en
  README). 319 tests de backend y 187 de frontend pasando (71 tests
  nuevos de backend, 42 de frontend específicos de Fase 7); `npm audit`
  reporta únicamente vulnerabilidades de tooling de desarrollo (vitest/
  vite/esbuild, nunca ejecutadas en runtime) y una de `react-router-dom`
  (moderada, sin fix no-breaking disponible) — ninguna se resolvió con
  `--force` para no migrar de major version en esta fase. Cero
  dependencias nuevas. Sin Kubernetes, sin Redis, sin PostgreSQL, sin
  autenticación empresarial, sin RAG/embeddings/vector DB, sin LangChain/
  LangGraph.
- **Fase 8** (completa): auditoría final de producto + release candidate
  **v1.0.0** (`APP_VERSION` `0.7.0` → `1.0.0`). Sin features nuevas — solo
  auditoría y corrección de bugs reales encontrados:
  1. **Symlink escape** (seguridad, real): un curso/módulo/tópico podía
     ser un symlink apuntando fuera de `/content`, escapando el chequeo
     de contención de `resolve_topic_asset` (que terminaba comparando
     contra la raíz YA escapada). Corregido excluyendo symlinks en
     `_list_subdirs`/`_list_topic_files` (`courses.py`); 3 tests nuevos.
  2. **Certification `actual_count: 0`** (crash real de frontend): un
     scope sin material suficiente devolvía `questions: []` sin error
     HTTP; `CertificationPracticePage`/`SimulationPage` rompían al
     acceder a `questions[0]` (undefined). Corregido en
     `useCertificationExam.prepare()` (nunca persiste ni navega con 0
     preguntas) + guard defensivo en ambas páginas; 3 tests nuevos.
  3. **`frontend/package-lock.json` faltante**: el Dockerfile usaba
     `npm install` sin lockfile commiteado (build no reproducible).
     Generado y commiteado; Dockerfile pasa a `npm ci`.
  4. **`SafeMarkdown` defensa en profundidad**: una imagen `data:` caía en
     la rama "externa" sin pasar por el mismo filtro de esquemas que los
     links — nunca explotable en la práctica (react-markdown ya sanea
     `src`/`href` a esquemas `https?/ircs?/mailto/xmpp` antes de que el
     componente los vea), pero se agregó el mismo chequeo por consistencia
     y se corrigió el test que asumía lo contrario.
  5. **`.env.example`/`docs/CONFIGURATION.md`**: `CERTIFICATION_CACHE_DIR`
     existía en `Settings`/`docker-compose.yml` pero no estaba
     documentada; agregada, junto con una aclaración de que
     `LESSON_CACHE_DIR`/`CERTIFICATION_CACHE_DIR`/`SPEECH_CACHE_DIR`/
     `CONTENT_DIR` son rutas fijas del container (no se leen realmente
     desde `.env`, a diferencia de lo que su presencia en `.env.example`
     podría sugerir).
  Auditoría completa documentada en `docs/PRODUCT_AUDIT.md` (estado real
  de cada subsistema), `docs/RELEASE_NOTES_v1.0.0.md` y
  `docs/RELEASE_CHECKLIST.md` (nuevo, reproducible para releases
  futuros). Validado con: 326 tests de backend (+5 vs. Fase 7) y 190 de
  frontend (+3 vs. Fase 7) pasando; build limpio (`--no-cache`, proyecto
  Compose aislado) exitoso; regresión de curso externo real (Markdown +
  PNG + JPG + link + code + table); QA E2E real con LLM configurado
  (catálogo→curso→aula→lección real→tutor real grounded→certificación
  real grounded→resultados→configuración→404→catálogo, 0 errores de
  consola); QA responsive en 5 resoluciones sin overflow. README
  reordenado (Requisitos antes de Quick Start) y con secciones nuevas de
  Troubleshooting/Desarrollo/Seguridad.
- **v1.0.1** (release correctiva, sobre v1.0.0): resuelve un bug real
  reproducido con un curso real multi-módulo ("preparar práctica de
  certificación, curso completo, 5 preguntas" tardaba minutos y terminaba
  en `502` engañoso). Causa raíz: `OpenAIProvider.generate_structured`
  reclasificaba cualquier excepción no reconocida del SDK (incluidas
  fallas de parseo/validación DESPUÉS de un HTTP 200 real) como
  `LLMUpstreamError`; combinado con que `prepare_exam` generaba un
  `QuestionBank` para TODOS los tópicos del scope antes de ensamblar, un
  solo tópico con salida inválida abortaba toda la preparación. Fix:
  - `certification_service.prepare_exam` ahora es incremental/
    demand-driven: candidatos ordenados round-robin determinístico por
    módulo (nunca `random`, nunca LLM), cache-first, con early stop en
    cuanto hay cobertura (`min(requested_count, candidatos)` tópicos
    distintos) y cantidad suficientes.
  - Tolerancia a fallos por tópico: un tópico que falla se salta y la
    preparación sigue con el próximo candidato; solo un error sistémico
    (`LLMConfigurationError`/`LLMAuthError`) aborta de inmediato.
  - `OpenAIProvider`: la excepción defensiva final ahora clasifica como
    `LLMResponseError` (contrato/respuesta inválida), nunca
    `LLMUpstreamError`; se agregó manejo explícito de
    `LengthFinishReasonError`/`ContentFilterFinishReasonError`.
  - Nueva `CertificationInsufficientQuestionsError` (→ `422`) para "el
    proveedor respondió pero ningún tópico produjo contenido válido tras
    agotar todos los candidatos" — nunca más un `502` falso cuando el
    proveedor sí respondió.
  - `course_diagnostics.py`: `duplicate_slug` bajó de `error` a `warning`
    (un curso con slugs duplicados sigue funcionando de punta a punta —
    `error` queda solo para tópicos ilegibles); corrige el
    `doctor.ps1` contradictorio `[OK] ... diagnostico: error`.
  - `conftest.py`: el fixture `client` ahora fija explícitamente
    `llm_provider`/todas las credenciales — corrige una fuga real de
    hermeticidad donde un `.env` local de desarrollo con una key real
    filtraba hacia tests que debían ejercitar el path "sin credencial".
  Validado con un smoke REAL contra el curso que originó el reporte
  (`claude-foundations-certification`, 56 tópicos candidatos): la misma
  preparación que antes fallaba con `502` ahora responde `200 OK` en
  ~70s, tocando solo 5 de 56 tópicos (4 generaciones reales + 1 cache
  hit, 51 saltados por early stop), con las 5 preguntas repartidas en 5
  módulos distintos. 343 tests de backend (+17) pasando; 190 de frontend
  sin cambios (ningún archivo de frontend se tocó). `APP_VERSION` 1.0.0 →
  1.0.1. Cache keys sin cambios (caches de v1.0.0 se siguen reutilizando).
  Sin cambios de arquitectura, sin features nuevas, sin dependencias
  nuevas.

- **v1.1.0** (release candidate, sobre v1.0.1, rama de desarrollo
  `feat/v1.1.0-*` → `release/v1.1.0-rc`): cuatro bloques funcionales más
  un hardening final, sin cambios de arquitectura, sin dependencias
  nuevas, sin backend nuevo para adaptación pedagógica (100% frontend).
  1. **Learning Progress / "Mi aprendizaje"** (`frontend/src/learning/`):
     progreso local por curso/tópico (`localStorage`,
     `pwc-tutor:learning-progress:v1`), historial de intentos de
     certificación con sus agregados públicos, "Continuar aprendiendo"
     determinístico, migración idempotente desde el puntero legacy de
     `classroomStorage.ts`, reset por curso, aislamiento multi-curso. Ver
     `docs/LEARNING_PROGRESS.md`.
  2. **Performance**: concurrencia acotada y determinística en
     `certification_service.prepare_exam` (`CERTIFICATION_MAX_CONCURRENCY`,
     1-4, default 2; barrido cache-only primero, waves de generación,
     early stop, tolerancia a fallos por tópico), `singleflight.py`
     (colapsa requests concurrentes idénticas — Lesson/QuestionBank/
     Speech, process-local), y una UX de operaciones de IA con mensajes
     de espera honestos (`AiOperationStatus`, sin porcentajes inventados).
     Ver `docs/PERFORMANCE.md`.
  3. **Lesson rendering pedagógico** (`lesson-v3`, `LESSON_PROMPT_VERSION`
     lesson-v2 → lesson-v3): visuales estructurados nuevos/mejorados
     (`ImageVisual`, `ComparisonVisual`, `ArchitectureVisual`,
     `ProcessVisual`, `ConceptMapVisual`) con contratos Pydantic más
     estrictos (`edges` solo referencian `nodes` existentes, `image` solo
     cita un `SRC-XXX` real, sin URLs externas inventadas), narration
     distinta del texto de la slide pero igual de grounded. Cache
     distinta de lesson-v2 por diseño (misma dimensión de key:
     `content_sha256+provider+model+prompt_version`). Ver
     `docs/LESSON_RENDERING.md`.
  4. **Adaptive Learning**: motor de recomendaciones determinístico y
     100% local (`learningRecommendationEngine.ts` +
     `topicLearningSignal.ts`, sin LLM, sin backend nuevo), sección
     "Recomendado para vos" en Mi aprendizaje, preselección validada de
     tópicos para práctica/simulacro vía query params, modo "Repaso"
     puramente visual (misma `LessonPlan`, sin regenerar). Ver
     `docs/ADAPTIVE_LEARNING.md`.
  5. **Hardening / release candidate** (rama `release/v1.1.0-rc`, sin
     features nuevas): auditoría del diff acumulado `v1.0.1..HEAD`.
     Bug real encontrado y corregido: `CERTIFICATION_MAX_CONCURRENCY` y
     el default correcto de `LESSON_PROMPT_VERSION` (`lesson-v3`) nunca
     llegaban al container porque `docker-compose.yml` no los reenviaba
     en el bloque `environment` del backend (el `.env` del host nunca se
     copia a la imagen — `.dockerignore` lo excluye explícitamente — así
     que la única vía de propagación es ese bloque); la app corría
     siempre con `lesson-v2` y con concurrencia fija en 2 sin importar lo
     que el alumno configurara. Corregido en `docker-compose.yml`,
     `.env.example` y `docs/CONFIGURATION.md`. `APP_VERSION` 1.0.1 →
     1.1.0 (`backend/app/config.py`, `docker-compose.yml`,
     `.env.example`). Resto de la auditoría (identidad compuesta
     `bank_id::question_id`, React keys compuestas para el
     `duplicate_slug` real, superficie XSS, symlink/path traversal,
     taxonomía de errores del proveedor, cache keys de
     Lesson/QuestionBank/Speech, privacidad del motor adaptativo) sin
     hallazgos nuevos — ya cerrada correctamente por bloques anteriores.
     389 tests de backend / 315 de frontend, sin regresiones. Ver
     `docs/RELEASE_NOTES_v1.1.0.md`. Sin push, sin tag `v1.1.0`, sin
     merge a `master` — release gate pendiente, decisión separada.

- **v1.2.0** (release candidate, sobre v1.1.1, rama de desarrollo
  `feat/v1.2.0-*` → `release/v1.2.0-rc`): tres bloques funcionales más un
  hardening final, sin cambios de arquitectura, sin dependencias nuevas.
  1. **Visual Fidelity** (`lesson-v3` → `lesson-v3.1`): el renderer del
     aula dejó de perder contenido estructurado ya generado por el LLM
     — `HierarchyVisual`/`ArchitectureVisual`/`ConceptMapVisual` pasan a
     usar `nodes`/`edges` como fuente primaria (antes ignorados),
     conectores geométricos SVG reales calculados por React
     (`DiagramCanvas`, nunca coordenadas del LLM), `ComparisonPlan` gana
     `columns` (contenido real y distinto por columna en modo cards,
     backward-compatible). Bug real de `LESSON_PROMPT_VERSION` vía
     `.env`/`docker-compose.yml` corregido (mismo patrón ya visto en
     v1.1.0). Ver `docs/VISUAL_FIDELITY.md`.
  2. **Visual Selection Reliability** (`lesson-v3.1` → `lesson-v3.2` →
     `lesson-v3.2.1`): matriz semántica explícita en el prompt para
     elegir `visual_type` por estructura (nunca por variar), validación
     determinística de mismatch semántico interno sobre el propio
     `VisualPlan` ya generado (`hierarchy`/`concept_map` con edges 100%
     `flows_to` se rechaza; `hierarchy` con edges pero ninguna
     `contains`/`part_of` también). Corrección post-QA real (`lesson-v3.2.1`):
     una lista de entidades PARES que comparten categoría (p.ej. "niveles
     de una familia") no es `hierarchy` solo por eso — es `comparison`,
     aunque sean 3 o más entidades. QA real confirmó mejora medible
     (no 100%, documentado con honestidad: variabilidad de LLM sigue
     existiendo). Ver `docs/VISUAL_SELECTION.md`.
  3. **Pedagogical Animations v1** (100% frontend, sin cambios de
     backend/prompt/cache): visuales estructurados estáticos pasan a
     revelarse progresivamente (`process`: step→connector→step;
     `hierarchy`: root→children-grupo; `architecture`: BFS determinístico
     con fallback neutro seguro; `concept_map`: centro→nodos→relaciones;
     `comparison`: simultaneidad real, nunca un lado mucho antes que el
     otro) — derivado determinísticamente de un `VisualPlan` ya validado
     (`buildAnimationSequence`, puro, sin LLM), nunca generado por IA.
     Integrado con el único control de playback existente (Pausar/
     Reanudar/Repetir/Previo/Siguiente, sin sistema nuevo), independiente
     de la voz, con `prefers-reduced-motion` detectado en JS por primera
     vez en el proyecto (justificado: un timer no se pausa solo con CSS).
     Toda `LessonPlan` cacheada adquiere animación automáticamente al
     renderizarse. Ver `docs/PEDAGOGICAL_ANIMATIONS.md`.
  4. **Hardening / release candidate** (rama `release/v1.2.0-rc`, sin
     features nuevas): auditoría del diff acumulado `v1.1.1..HEAD` (3
     bloques completos, no solo el último commit). Bug real encontrado y
     corregido: bajo `React.StrictMode` (activo en desarrollo, ver
     `main.tsx`), el guard basado en `useRef` de
     `usePedagogicalAnimation` sobrevive el doble-montaje sintético de
     React (los refs no se reinician, solo los efectos se re-ejecutan),
     lo que hacía que el primer reveal de cada animación se programara
     con `stepIntervalMs` en vez de `initialDelayMs` — nunca visible en
     producción (StrictMode se descarta en el build de producción), pero
     sí en todo desarrollo local (`docker compose up`, el modo primario
     de trabajo de este proyecto). Corregido centralizando el criterio en
     `delayFor(fromStepIndex)`; test de regresión agregado montando el
     hook dentro de `React.StrictMode` explícitamente. `APP_VERSION`
     1.1.1 → 1.2.0. Resto de la auditoría (seguridad de SVG/diagramas,
     grounding de `AnimationSequence`, accesibilidad, layout stability,
     compatibilidad hacia atrás con `lesson-v3`/`v3.1`/`v3.2` cacheadas,
     cache sin cambios, regresión de Classroom/Learning Progress/
     Certification) sin hallazgos nuevos — ya cerrada correctamente por
     los bloques anteriores. Ver `docs/RELEASE_NOTES_v1.2.0.md`. Sin
     push, sin tag `v1.2.0`, sin merge a `master` en el momento en que se
     escribió este bloque — **publicado posteriormente**: `master`/
     `origin/master`/tag `v1.2.0` apuntan hoy a
     `71dbaaf4dc840543161c0a08eae59c229ced42fa` (el mismo commit de
     `chore: prepare v1.2.0 release candidate`, sin cambios adicionales
     entre el RC y el release).

- **v1.3.0** (release candidate, sobre v1.2.0, rama de desarrollo
  `feat/v1.3.0-*` → `release/v1.3.0-rc`): cuatro bloques funcionales
  (Classroom Navigation + Voice Lifecycle, Structure-Aware Lesson
  Generation, Lesson Generation Reliability, Content-Panel Navigation +
  Course-Scoped Expanded Tutor — este último con dos gap-closures reales
  encontrados en QA) más un hardening final. Sin cambios de arquitectura,
  sin dependencias nuevas, sin RAG, sin embeddings, sin una segunda
  llamada LLM en ningún punto.
  1. **Voice lifecycle**: invariante de reproducción única reafirmada en
     todos los puntos de navegación; protección de respuesta TTS neural
     obsoleta (`AbortController` + `playbackToken`) ante navegación
     durante una síntesis en vuelo.
  2. **Navegación**: `.scene-controls` (escena) y navegación de tópico
     (siempre distintas) se mantienen; la navegación de tópico se
     reubicó del área debajo del Tutor al panel de Markdown, como fila
     fija entre las tabs y el cuerpo con scroll (sin `position: sticky`,
     la estructura del panel ya la deja fuera del contenedor con
     scroll). Una sola instancia en el DOM.
  3. **Structure-Aware Lesson Generation** (`lesson-v3.2.1` →
     `lesson-v3.3` → `lesson-v3.3.1`): el Grounding Packet de generación
     de lecciones antepone metadata determinística por bloque
     (`type`/`list_kind`/`lang`/`heading_path`) antes del Markdown
     literal completo, exclusivo de ese consumidor (opt-in); guardas de
     fiabilidad contra `process` sin evidencia real de secuencia y
     mensajes de corrección más específicos. Ver
     `docs/STRUCTURE_AWARE_LESSONS.md`.
  4. **Tutor ampliado a nivel de curso** (`tutor-v3.1` → `tutor-v3.2` →
     `tutor-v3.2.1` → `tutor-v3.3`): nuevo `CourseScope` determinístico
     (título/descripción/módulos/tópicos del curso, resuelto server-side
     desde el repositorio seguro existente, nunca Markdown completo) que
     amplía la relevancia del modo ampliado del tutor más allá del
     tópico actual, sin RAG ni segunda llamada LLM. Contrato estructurado
     interno (`ExpandedTutorReplyBody`, nunca expuesto en la API
     pública): `scope_relation` (`current_topic`/`course_domain`/
     `unrelated`) y `topic_coverage` (`sufficient`/`partial`/
     `insufficient`), en ese orden, antes de `response_type` —
     reemplazó a un primer diseño con un campo de texto libre
     (`relevance_reasoning`, `tutor-v3.2.1`) después de que QA real
     encontrara que el texto libre podía "razonar correctamente" y aun
     así producir un `response_type` contradictorio en el mismo objeto;
     los ENUMs cerrados permiten validar esa consistencia
     determinísticamente. La invariante `topic_coverage="insufficient"`
     ⟹ `answer_chunks=[]` bloquea estructuralmente una cita débil (un
     `SourceBlock` citado sin sostener realmente la afirmación), sin
     ningún validador semántico nuevo. `TutorReplyBody` (contrato
     público) no gana ningún campo. Ver `docs/CLASSROOM_UX_V1_3.md`
     secciones 7.1-7.2 (incluye la causa raíz completa de ambos
     gap-closures y el hallazgo de que un ajuste de prompt adicional tuvo
     efecto negativo medible y se revirtió).
  5. **Hardening / release candidate** (rama `release/v1.3.0-rc`, sin
     features nuevas): auditoría del diff acumulado `v1.2.0..HEAD`. Bug
     real encontrado y corregido: overflow horizontal en mobile (390px)
     con un tópico real con imagen ancha embebida — `.classroom-grid`
     colapsa a `grid-template-columns: 1fr` por debajo de 960px, que por
     default de CSS Grid equivale a `minmax(auto, 1fr)`; el ancho mínimo
     de la columna compartida lo determina el mayor min-content de
     cualquier item en ella, y una imagen ancha contribuye su ancho
     intrínseco a ese cálculo pese a tener `max-width: 100%` para su
     tamaño renderizado. `.classroom-stage` ya tenía `min-width: 0` (fix
     de una fase anterior) pero `.content-panel` no — como comparten la
     misma columna en mobile, `.classroom-stage` terminaba igual de
     ancho por el stretch por defecto del grid pese a su propio
     `min-width: 0`. Corregido agregando el mismo `min-width: 0` a
     `.content-panel`; confirmado con Playwright (scrollWidth vuelve a
     coincidir con clientWidth) en los tópicos con imágenes probados.
     `APP_VERSION` 1.2.0 → 1.3.0. Resto de la auditoría (contrato del
     tutor, invariantes scope/coverage, seguridad de diagramas/SVG,
     privacidad, secret scan del diff completo, regresión de
     Certification/Learning Progress/animaciones pedagógicas/StrictMode)
     sin hallazgos nuevos. 525 tests de backend / 420 de frontend, sin
     regresiones. Ver `docs/RELEASE_NOTES_v1.3.0.md`. **Publicado
     posteriormente**: `master`/`origin/master`/tag `v1.3.0` apuntan hoy
     a `e7cb4dcfeb5a46e4bf3542a6f4b1a92dc66891f2` (el mismo commit de
     `chore: prepare v1.3.0 release candidate`, sin cambios adicionales
     entre el RC y el release).

- **v1.4.0** (release candidate, sobre v1.3.0, rama de desarrollo
  `feat/v1.4.0-*` → `release/v1.4.0-rc`): **Course-Wide Grounded Tutor**,
  en tres bloques funcionales más un hardening final. Sin cambios de
  arquitectura, sin dependencias nuevas, sin embeddings, sin vector DB,
  sin una segunda llamada LLM.
  1. **Course-Wide Retrieval Foundation** (`app/services/course_retrieval.py`,
     nuevo): búsqueda lexical determinística (BM25-like con boost de
     campo `topic_title` ×3 / `heading_path` ×2 / cuerpo ×1, IDF, bonus
     de frase exacta, piso de cobertura mínima de términos — corrección
     real que eliminó falsos positivos de QA negativa) sobre TODOS los
     `SourceBlock`s de un curso, cruzando módulos y tópicos, 100%
     in-process y sin persistencia. `CourseEvidenceCandidate` nunca
     asume que `source_ref` es único a nivel de curso (se reinicia por
     tópico). `exclude_topic_id` + diversidad entre tópicos + `top_k`
     (default 6). Optimización real de performance
     (`course_service.iter_all_canonical_topics`, resuelve el curso una
     sola vez en vez de repetir el listado de directorios por tópico:
     ~4.6s → ~0.6-1.6s en un curso de 53 tópicos).
  2. **Course-Grounded Tutor + Cross-Topic Provenance**
     (`app/services/course_grounding.py`, nuevo): namespace temporal
     `COURSE-SRC-XXX` por consulta (nunca persistido, nunca confundible
     con el `SRC-XXX` del tópico actual), packet `COURSE EVIDENCE`
     enviado al LLM junto al Grounding Packet del tópico actual. Decisión
     de producto central: el switch "Ampliar con conocimiento general"
     deja de controlar el uso de evidencia de otros tópicos del curso
     (corre siempre, en ambos modos) y pasa a controlar exclusivamente el
     conocimiento general del modelo. Modelo interno unificado
     `StructuredTutorReplyBody` (reemplaza a `TutorReplyBody`/
     `ExpandedTutorReplyBody` como dos modelos separados) con un tercer
     eje `course_coverage`, independiente de `topic_coverage` — que el
     retrieval encuentre candidatos NO implica cobertura suficiente, el
     LLM sigue clasificando independientemente. `course_answer_chunks`/
     `course_sources` nuevos en el contrato público (backward compatible,
     default `[]`), filtrados a solo las fuentes efectivamente citadas.
     `TUTOR_PROMPT_VERSION` `tutor-v3.3` → `tutor-v4`.
  3. **Provenance UX + Related Topic Navigation** (100% frontend): el
     alumno distingue "Basado en este tema" / "Basado en el curso" /
     "Ampliado con conocimiento general", con una sección "Temas
     relacionados" deduplicada por tópico y un CTA "Ver tema
     relacionado" que reutiliza `goToTopic` (cero routing nuevo) — por
     lo que voice/animation cleanup, reset del switch y la garantía de
     no-completion llegan gratis de la navegación curricular existente.
     Bug real encontrado y corregido: la voz nunca incluía
     `course_answer_chunks` (una respuesta cross-topic pura quedaba en
     silencio).
  4. **Hardening / release candidate** (rama `release/v1.4.0-rc`, sin
     features nuevas): auditoría del diff acumulado `v1.3.0..HEAD` (los
     tres bloques). Sin bugs nuevos encontrados en este hardening final
     (los dos bugs reales del release — voz incompleta y copy obsoleto
     del switch — se encontraron y corrigieron durante el Bloque 3, no
     acá). Confirmado con QA real repetida (caso central cross-topic con
     switch OFF, deep provenance verificada byte a byte, regresión de
     Skill 3/3 corridas consistentes, fallback a conocimiento general
     ON/OFF, prompt injection en las tres superficies posibles, límite
     lexical inglés/español sigue vigente por diseño, performance de
     retrieval ~0.6-1.6s frente a ~1.2-3.4s del proveedor LLM — sin cache
     nuevo), overflow mobile con títulos de peor caso, y aislamiento
     confirmado de Certification/Checkpoint/Lesson Generation (el
     retrieval nunca se referencia fuera del código del tutor).
     `APP_VERSION` 1.3.0 → 1.4.0. 585 tests de backend (sin cambios) /
     443 de frontend (+4, completar la cobertura de voz), sin
     regresiones; build Docker `--no-cache` limpio; `doctor.ps1` → "Todo
     en orden". Ver `docs/RELEASE_NOTES_v1.4.0.md` y
     `docs/COURSE_GROUNDED_TUTOR_V1_4.md`. **Publicado posteriormente**:
     `master`/`origin/master`/tag `v1.4.0` apuntan hoy a
     `3542a40438677f54abcd2b50e86d794fecb577c4` (el mismo commit de
     `chore: prepare v1.4.0 release candidate`, sin cambios adicionales
     entre el RC y el release).

- **v1.5.0** (release candidate, sobre v1.4.0, rama de desarrollo
  `feat/v1.5.0-guided-read-aloud` → `release/v1.5.0-rc`): **Guided
  Markdown Read Aloud**, en tres commits de desarrollo más un hardening
  final. Sin cambios de arquitectura, sin dependencias nuevas, sin
  modelo nuevo, sin forced alignment, sin speech-to-text, sin segunda
  llamada LLM. `Tutor`/`Course Retrieval`/`Lesson Generation` sin tocar
  en ningún commit de la cadena.
  1. **Feature** (`0ce36c7`): el alumno puede escuchar el Markdown de un
     tópico (nunca la clase generada por IA) leído en voz alta,
     reutilizando la misma arquitectura de voz ya existente (TTS neural
     OpenAI de Fase 7 / Web Speech API del navegador de Fase 4).
     `readAloudSegments.ts` segmenta el DOM ya renderizado por
     `SafeMarkdown` (`Intl.Segmenter` con fallback determinístico, sin
     vocabulario técnico hardcodeado); `readAloudHighlight.ts` resalta
     la frase activa con la CSS Custom Highlight API (nunca
     `dangerouslySetInnerHTML`); `readAloudPlayer.ts` es un player
     dedicado con prefetch acotado (máx. 2 segmentos adelante);
     `readAloudPriority.ts` garantiza que la IA siempre tiene prioridad
     absoluta. Velocidad 0.75×–2× persistida en `localStorage`.
  2. **Fix** (`6ea1bb1`, bug real): "Leer tema" quedaba deshabilitado
     con Markdown legible y ninguna narración de IA sonando, solo por
     tener `voiceEnabled=true` persistido de una sesión anterior sin
     ninguna escena/lección generada en la sesión actual —
     `aiAudioSessionActive` no replicaba la condición real de audio de
     `useClassroomVoice.ts` (`enabled && scene`, no solo `enabled`).
  3. **Fix** (`7e9af55`, bug real): Stop dejaba al Reader inutilizado —
     `clearAll()` (reutilizada por Stop y por la prioridad de IA)
     vaciaba los `SpeechSegment`s y el marcado DOM, algo correcto solo
     para un cambio de tópico. Separado en `stopPlaybackSession()`
     (audio/highlight/índice, lo único que Stop debe hacer) y
     `clearAll()` (exclusiva de cambio de tópico/unmount).
  4. **Hardening / release candidate** (rama `release/v1.5.0-rc`, sin
     features nuevas): auditoría del diff acumulado `v1.4.0..HEAD`. Dos
     hallazgos: (a) código muerto real (`setAiAudioActive`/
     `isAiAudioActive` en `readAloudPriority.ts`, sin productor ni
     consumidor desde el commit original), eliminado; (b) bug real de
     overlap de audio, encontrado DESPUÉS de eliminar (a) — la voz del
     tutor/checkpoint/certificación solo dispara el evento puntual
     `claimAiAudioPriority()` al arrancar, sin ningún equivalente
     persistente a `aiAudioSessionActive` que mantuviera al Reader
     deshabilitado durante TODA la secuencia (que puede tener varios
     chunks/párrafos) — confirmado con instrumentación real de
     `HTMLAudioElement` en QA de navegador. Corregido reintroduciendo
     `setAiAudioActive`/`isAiAudioActive` (esta vez cableadas de
     verdad: productor en `voicePlayback.ts`, el único choque
     compartido por todos los consumidores de voz de IA; consumidor en
     `useReadAloud.ts`). Se agregó también un test de `React.StrictMode`
     para `useReadAloud` (no existía ninguno; mismo patrón de riesgo que
     el bug real de v1.2.0 en `usePedagogicalAnimation`) — sin hallazgos.
     `APP_VERSION` 1.4.0 → 1.5.0. `LESSON_PROMPT_VERSION`/
     `TUTOR_PROMPT_VERSION` sin cambios (`lesson-v3.3.1`/`tutor-v4`).
     585 tests de backend (sin cambios) / 528 de frontend (+5),
     sin regresiones; build Docker `--no-cache` limpio; `doctor.ps1` →
     "Todo en orden". Ver `docs/RELEASE_NOTES_v1.5.0.md` y
     `docs/GUIDED_READ_ALOUD_V1_5.md`. Sin push, sin tag `v1.5.0`, sin
     merge a `master` — release gate pendiente, decisión separada.

Cualquier trabajo futuro debe respetar este documento y actualizar la
sección correspondiente del roadmap al avanzar de fase.
