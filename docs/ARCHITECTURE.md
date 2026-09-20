# Arquitectura — PwC AI Tutor

## 1. Visión general

Arquitectura deliberadamente simple, de tres capas, sin base de datos ni
microservicios:

```
┌──────────────┐      HTTP REST       ┌──────────────┐      filesystem     ┌────────────────────┐
│   Browser    │ ───────────────────► │   FastAPI    │ ───────────────────► │  /content (cursos)  │
│  (React SPA) │ ◄─────────────────── │   (backend)  │                     │  read-only mount     │
└──────────────┘        JSON          └──────┬───────┘                     └────────────────────┘
                                              │
                                              │ POST .../lesson (Fase 3, real)
                                              ▼
                                     ┌──────────────────┐      filesystem     ┌──────────────────────┐
                                     │  LessonGenerator  │ ───────────────────► │ LESSON_CACHE_DIR      │
                                     │  (app/services/   │ ◄─────────────────── │ (JSON, read-write)     │
                                     │  lesson_generator) │                     └──────────────────────┘
                                     └──────────┬─────────┘
                                                │
                                                ▼
                                     ┌──────────────────┐
                                     │  LLMProvider      │
                                     │  PwCGenAIProvider  │───► POST {PWC_GENAI_BASE_URL}/chat/completions
                                     │  OpenAIProvider    │───► SDK openai (chat.completions.parse)
                                     └──────────────────┘
```

Todo corre en contenedores Docker orquestados por `docker-compose.yml`. No
hay base de datos: el contenido de los cursos vive en el filesystem
(montado como bind mount de solo lectura), la cache de lecciones generadas
vive en el filesystem (bind mount read-write separado, `LESSON_CACHE_DIR`)
y el progreso del alumno se guardará en el futuro en `localStorage` del
navegador.

## 2. Componentes

### 2.1 Frontend (`frontend/`)

- **React + TypeScript + Vite.**
- `src/api/client.ts`: único punto de acceso HTTP al backend. Centraliza
  manejo de errores (`ApiError`) y la URL base (`VITE_API_BASE_URL`).
- `src/types/api.ts`: espejo manual de los modelos Pydantic del backend.
- `src/components/`: `AppHeader` (header principal con navegación) y
  `Breadcrumb` (navegación contextual Curso > Módulo > Tópico).
- `src/pages/`:
  - `CatalogPage`: catálogo de cursos (`GET /api/courses`).
  - `CourseDetailPage`: detalle de un curso con sus módulos y tópicos
    (`GET /api/courses/{course_id}`).
  - `ClassroomPage`: aula virtual. Combina el detalle del curso (para el
    selector de módulo) con el detalle del tópico activo (`GET
    /api/courses/{course_id}/modules/{module_id}/topics/{topic_id}`).
    Renderiza el Markdown del tópico con `react-markdown` + `remark-gfm` en
    la pestaña "Explicación" de la columna derecha (junto a "Puntos clave"
    y "Recursos", Fase 4), sin ninguna transformación adicional. Consulta
    `GET /api/ai/status` (estado del agente IA, nunca la credencial);
    ofrece un botón "Preparar clase con IA" que dispara `POST .../lesson`
    bajo demanda (nunca automáticamente al entrar al tópico). Una vez
    generada la `LessonPlan`, delega el renderizado de cada escena al
    Classroom Engine + `SceneRenderer` (Fase 4, ver sección 7): título,
    escena activa vía componentes visuales reales, narración en un panel
    auxiliar, indicador "Escena X de Y" con barra de progreso, controles
    Previo/Siguiente/Pausa/Repetir/Voz/Salir reales, y una pantalla de
    finalización con el `recap`. Sin `LessonPlan` activa, Previo/Siguiente
    siguen navegando tópicos del curso (comportamiento de Fase 1).
  - `AulaLandingPage`, `PlaceholderPage`: pantallas auxiliares de Fase 1.
- `src/classroom/` **(Fase 4)**: Classroom Engine, Scene Renderer y los 11
  componentes visuales. Ver detalle completo en la sección 7.
- `src/components/GroundingPanel.tsx`: panel colapsable visible solo en
  desarrollo (`import.meta.env.DEV`, mecanismo nativo de Vite). Permite
  inspeccionar las `source_refs` citadas por la escena activa de la
  lección y ver el `SourceBlock` correspondiente al hacer click en una
  referencia `SRC-XXX`.
- El LLM nunca genera HTML/JS/SVG ejecutable: ningún componente de
  `src/classroom/` usa `dangerouslySetInnerHTML`, `eval` ni `new Function`
  sobre contenido de la `LessonPlan`. Todo elemento visual es un
  componente React propio (ver sección 7).
- Todo el contenido Markdown se renderiza en el cliente; el backend nunca
  lo convierte a HTML.

### 2.2 Backend (`backend/`)

- **FastAPI + Pydantic**, Python 3.11.
- `app/config.py`: configuración centralizada vía variables de entorno
  (`pydantic-settings`). Único lugar que conoce rutas de filesystem,
  credenciales de LLM (no usadas todavía) y el origen CORS permitido.
- `app/models/schemas.py`: contratos Pydantic de la API (`CourseSummary`,
  `CourseDetail`, `ModuleSummary`, `TopicSummary`, `TopicResponse`, etc).
- `app/services/naming.py`: utilidades puras para interpretar nombres de
  filesystem (prefijos numéricos, slugs, títulos legibles). Sin efectos
  secundarios, fácil de testear en aislamiento.
- `app/services/courses.py`: repositorio de cursos. Es la única capa que
  toca el filesystem de `/content`. Responsable de:
  - Enumerar cursos, módulos y tópicos ordenados.
  - Resolver un `id` de la URL contra las entradas reales del filesystem
    (nunca al revés): esto es lo que elimina el riesgo de path traversal,
    porque jamás se concatena input de usuario en una ruta de archivo.
  - Parsear YAML frontmatter (vía `python-frontmatter`) de forma tolerante
    a su ausencia.
  - Construir, para cada tópico, su `CanonicalTopicContent` (delegando en
    `app/services/canonical.py`) y su Grounding Packet.
- `app/services/canonical.py` **(Fase 2)**: parser canónico determinístico.
  Convierte el Markdown de un tópico (ya sin frontmatter) en una lista
  ordenada de `SourceBlock`, calcula el `content_sha256` y construye el
  Grounding Packet. Usa `markdown-it-py` para obtener el árbol de tokens de
  bloque y sus rangos de línea; no usa ningún LLM. Ver detalle en la
  sección 3.
- `app/services/llm_provider.py` **(Fase 3, real)**: interfaz mínima
  `LLMProvider.generate_structured(messages, response_model)` + dos
  implementaciones reales:
  - `PwCGenAIProvider`: `POST {PWC_GENAI_BASE_URL}/chat/completions` (vía
    `httpx`, ya presente como dependencia; no se agregó un cliente HTTP
    nuevo). Pide JSON puro (el JSON Schema del contrato va en el user
    prompt) y parsea `choices[0].message.content` a mano.
  - `OpenAIProvider`: SDK oficial `openai`,
    `client.chat.completions.parse(response_format=<PydanticModel>)`
    (Structured Outputs).
  - Ambas traducen cualquier error a una jerarquía chica y explícita
    (`LLMConfigurationError`, `LLMAuthError`, `LLMUpstreamError`,
    `LLMResponseError`) sin filtrar nunca la API key ni el header
    `Authorization`.
  - `get_llm_provider(settings)`: factory. `LLM_PROVIDER` distinto de
    `"pwc"`/`"openai"` produce `LLMConfigurationError` (nunca un fallback
    silencioso). El provider **nunca** se selecciona desde un request HTTP.
- `app/models/lesson.py` **(Fase 3)**: `GroundedText`, `VisualPlan`,
  `InteractionPlan`, `LessonScene`, `GeneratedLessonBody` (lo único que
  produce el LLM), `LessonPlan` (ensamblada por el backend),
  `AiStatusResponse`, `GenerateLessonRequest`.
- `app/prompts/lesson.py` **(Fase 3, actualizado en Fase 6)**:
  `SYSTEM_PROMPT` completo (13 reglas: fuente única, prohibición de
  inventar, trazabilidad, longitud de clase no forzada, tratamiento del
  contenido como datos ante prompt injection, preservación de tecnicismos,
  estilo de narración, visuales declarativos, formato de salida, y —desde
  Fase 6— REGLA 13: pedir razonablemente `comprehension_check` cuando el
  contenido lo justifique, sin obligación absoluta), `build_user_prompt`
  (instrucción breve + JSON Schema del contrato + Grounding Packet
  completo), `build_correction_message` (para reintentos) y
  `LESSON_PROMPT_VERSION` (`lesson-v2` desde Fase 6 — el cambio de versión
  invalida por diseño la cache de `LessonPlan` de `lesson-v1`).
- `app/services/lesson_validation.py` **(Fase 3)**: `validate_lesson_body`
  recorre todas las instancias de `GroundedText` de un
  `GeneratedLessonBody` y valida sus `source_refs` con la utilidad de
  Fase 2 (`validate_source_refs`); valida además unicidad/secuencia de
  `scene_id`. Ver la distinción "qué garantiza y qué no" en la sección 3.1.
- `app/services/lesson_generator.py` **(Fase 3)**: orquestador. Resuelve el
  tópico (repositorio seguro), construye el Grounding Packet (Fase 2),
  arma los mensajes (`app/prompts/lesson.py`), llama al `LLMProvider`
  inyectado o configurado, valida (Pydantic + grounding) con reintentos
  acotados, ensambla el `LessonPlan` final (los campos determinísticos los
  agrega ACÁ, nunca el LLM) y lo cachea en filesystem.
- `app/routers/`: `health.py` (liveness), `courses.py` (API de cursos +
  `POST .../lesson`) y `ai.py` **(Fase 3)** (`GET /api/ai/status`). Los
  routers son delgados: validan input HTTP, delegan en los servicios y
  traducen excepciones de dominio a `HTTPException` con el status code
  correcto (ver sección 6).

### 2.3 Filesystem de cursos (`courses/`)

- Fuente de verdad del contenido pedagógico.
- Se monta en el container backend como bind mount **read-only** en
  `/content`, usando la sintaxis *long-form* de Docker Compose para evitar
  problemas de interpretación de rutas de Windows.
- Convención: `curso/módulo/tópico.md`, con prefijos numéricos opcionales
  para ordenar y frontmatter YAML opcional para metadata explícita.

### 2.4 Cache de LessonPlans (`data/lesson-cache/`, Fase 3)

- Se monta en el container backend como bind mount **read-write** en
  `LESSON_CACHE_DIR` (`/app/data/lesson-cache` por defecto), separado del
  mount read-only de `/content`: acá el backend sí escribe.
- Un archivo JSON por `LessonPlan` cacheada, nombrado con el hash SHA-256
  de la cache key (ver sección 3.2). Escritura atómica (archivo temporal +
  `replace`).
- Nunca se cachea un error ni una respuesta que no haya pasado validación
  Pydantic + validación de grounding.
- Se versiona solo `data/lesson-cache/.gitkeep`; el contenido generado
  nunca se commitea (ver `.gitignore`).

## 3. Modelo canónico de contenido y Grounding Packet (Fase 2)

Regla de trazabilidad (ver `CLAUDE.md` sección 2 y 6):

> Every LLM-generated pedagogical assertion must ultimately be traceable to
> one or more valid SourceBlock references.

Para poder cumplirla en una fase futura, el Markdown de cada tópico se
transforma primero en una representación canónica **100% determinística**
(sin ningún LLM), con esta cadena de transformación:

```
Markdown (sin frontmatter, tal como se lee del archivo)
    │
    ▼
Canonical Parser  (app/services/canonical.py, basado en markdown-it-py)
    │  segmenta el documento en bloques semánticos de primer nivel
    ▼
SourceBlocks  (SRC-001, SRC-002, ... en orden real del documento)
    │  cada uno con: block_type, markdown literal, plain_text auxiliar,
    │  heading_path, start_line/end_line
    ▼
CanonicalTopicContent  (+ content_sha256 sobre el Markdown pedagógico)
    │
    ▼
Grounding Packet  (build_grounding_packet: texto plano determinístico)
    │
    ▼
(Fase futura) LLM
```

Puntos clave del diseño:

- **Determinismo**: mismo Markdown de entrada ⇒ exactamente el mismo
  `CanonicalTopicContent` de salida (mismos `SourceBlock`, mismo
  `content_sha256`). No hay aleatoriedad ni dependencia de un LLM en esta
  transformación. Ver invariantes A-J en
  `backend/tests/test_canonical.py`.
- **Preservación literal**: `SourceBlock.markdown` es siempre un fragmento
  literal del Markdown original (mismas líneas del archivo fuente); nunca
  se reformula, resume, corrige ni traduce contenido. `plain_text` es
  únicamente una limpieza sintáctica auxiliar (quita marcadores `#`, `*`,
  `` ` ``, etc.), no una reescritura.
- **Detección de cambios**: `content_sha256` es el SHA-256 (UTF-8) del
  Markdown pedagógico exacto (sin frontmatter, sin timestamps). Cambia si y
  solo si cambia el contenido real.
- **Grounding Packet**: texto con el formato
  `=== AUTHORIZED SOURCE: TOPIC === ... [SRC-XXX] <markdown> ... === END
  AUTHORIZED SOURCE ===`. Es, por diseño, la única información pedagógica
  que un futuro LLM recibirá para este tópico; no contiene explicaciones ni
  instrucciones generadas por la aplicación, solo Markdown fuente.
- **Validación de referencias**: `validate_source_refs` /
  `assert_valid_source_refs` permiten (en una fase futura) verificar que
  toda referencia `SRC-XXX` citada por una respuesta del LLM exista
  realmente en el `CanonicalTopicContent` del tópico, y rechazar/reportar
  las que no.
- **Seguridad**: el parser canónico nunca recibe una ruta de filesystem
  desde HTTP. Los endpoints que lo exponen (`GET .../topics/{topic_id}` y
  `GET .../topics/{topic_id}/grounding`) resuelven curso/módulo/tópico a
  través del mismo repositorio seguro de la sección 2.2 (anti path
  traversal) antes de invocar `app/services/canonical.py`.

Expuesto en la API:

- `GET /api/courses/{course_id}/modules/{module_id}/topics/{topic_id}`
  sigue devolviendo `content_markdown` completo (compatibilidad con el
  frontend de Fase 1) y agrega `canonical: { content_sha256,
  source_block_count, source_blocks }`.
- `GET /api/courses/{course_id}/modules/{module_id}/topics/{topic_id}/grounding`
  (herramienta de inspección/desarrollo de Fase 2) devuelve `content_sha256`,
  `source_block_count` y el `grounding_packet` completo. No contiene
  secretos. Se mantiene como herramienta de desarrollo; el endpoint
  `POST .../lesson` de Fase 3 **nunca** expone el Grounding Packet ni el
  system prompt al cliente.

### 3.1 Grounding: qué garantiza y qué no (Fase 3)

> Source reference validation guarantees structural traceability to
> authorized source blocks. It does not by itself prove semantic
> entailment of every generated statement.

En criollo: cuando `validate_lesson_body` confirma que las `source_refs`
de un `GroundedText` existen, lo único que garantiza matemáticamente es
que esos `SourceBlock` existen en el `CanonicalTopicContent` del tópico
(trazabilidad **estructural**). NO verifica —porque no hay forma
determinística de hacerlo sin otro modelo o una verificación semántica
mucho más cara— que el texto generado efectivamente se infiera de forma
correcta de esos bloques. El system prompt (sección 8 de `CLAUDE.md`)
reduce el riesgo de que esto ocurra (prohíbe explícitamente inventar
datos/ejemplos/relaciones), pero la validación determinística de esta
aplicación es sobre la **existencia** de las referencias, no sobre la
**fidelidad semántica** del texto que las cita.

### 3.2 De CanonicalTopicContent a LessonPlan (Fase 3)

```
CanonicalTopicContent (Fase 2)
    ↓
Grounding Packet (Fase 2)
    ↓
Prompt Builder (app/prompts/lesson.py) — system prompt + user prompt
    ↓
LLMProvider.generate_structured(...)
    ↓
GeneratedLessonBody          (validación Pydantic — forma del contrato)
    ↓
validate_lesson_body(...)    (validación de grounding — sección 3.1)
    ↓
LessonPlan                   (ensamblada por el BACKEND, nunca por el LLM)
    ↓
Cache en filesystem (data/lesson-cache/, sección 2.4)
    ↓
React (ClassroomPage)
```

Cache key: SHA-256 de `content_sha256:provider:model:prompt_version`.
Cambiar cualquiera de esos cuatro valores produce cache miss por diseño
(cambiar el Markdown, cambiar de proveedor, cambiar de modelo o cambiar
`LESSON_PROMPT_VERSION` invalidan la cache existente). Reintentos acotados
a `MAX_GENERATION_ATTEMPTS = 3` (1 inicial + hasta 2 correcciones); nunca
reintenta ante `LLMAuthError`/`LLMConfigurationError`.

## 4. Responsabilidades y límites

| Capa | Responsable de | NO responsable de |
|---|---|---|
| Frontend | Navegación, presentación, renderizado de Markdown, UX del aula, disparar generación de lección bajo demanda | Lógica de negocio de cursos, acceso a filesystem, llamadas a LLM, decidir el provider |
| Backend / routers | Validación HTTP, códigos de status, traducir errores de dominio | Lógica de resolución de filesystem, lógica de prompts |
| Backend / services (courses, canonical) | Resolución segura de filesystem, parsing de frontmatter, modelo canónico | Renderizado de Markdown, UI, llamadas HTTP a proveedores |
| Backend / services (lesson_generator, lesson_validation) | Orquestar generación grounded, validar, cachear | Autenticación/transporte HTTP específico de cada proveedor |
| Backend / llm_provider | Autenticación y transporte HTTP/SDK de cada proveedor | Decidir contenido pedagógico, reglas de grounding |
| Filesystem de cursos (`/content`) | Contenido pedagógico (única fuente de verdad), solo lectura | Nada de lógica; es contenido estático |
| Cache de lecciones (`data/lesson-cache/`) | Persistir `LessonPlan` ya validadas, lectura/escritura | Nunca contenido "fuente"; siempre derivado y regenerable |

## 5. Flujo de navegación (Fase 1)

1. El usuario entra al **Catálogo** (`/`) → `GET /api/courses`.
2. Selecciona un curso → **Detalle de curso** (`/cursos/:courseId`) →
   `GET /api/courses/{course_id}`.
3. Selecciona un tópico → **Aula Virtual**
   (`/aula/:courseId/:moduleId/:topicId`) → se piden en paralelo el
   detalle del curso (para navegación) y el tópico puntual.
4. Dentro del aula, el selector de módulo, los botones "Previo/Siguiente"
   y la navegación de tópicos recalculan la ruta y disparan una nueva
   petición `GET /api/courses/.../topics/{topic_id}`.

## 6. Flujo real de generación de LessonPlan (Fase 3)

`POST /api/courses/{course_id}/modules/{module_id}/topics/{topic_id}/lesson`
(body opcional: `{"force_regenerate": bool}`):

1. El router resuelve `course_id`/`module_id`/`topic_id` a través del
   repositorio seguro (Fase 1/2, anti path traversal) — **antes** de
   verificar si hay credencial configurada: un tópico inexistente da `404`
   incluso sin ninguna API key.
2. Si `force_regenerate=false` (default) y existe una entrada de cache
   válida para `content_sha256 + provider + model + prompt_version`, se
   devuelve esa `LessonPlan` con `cached: true`. **El provider no se
   llama.**
3. Si no hay cache (o `force_regenerate=true`): se verifica que el
   `LLMProvider` configurado tenga credencial (`is_configured()`); si no,
   `503`.
4. Se construye el Grounding Packet (Fase 2) y los mensajes
   (`app/prompts/lesson.py`).
5. Se llama a `LLMProvider.generate_structured(...)`, con reintentos
   acotados (sección 3.2) ante JSON/contrato inválido o grounding
   inválido.
6. Se valida el resultado (Pydantic + `validate_lesson_body`, sección 3.1).
7. Se ensambla el `LessonPlan` (ids/hash/provider/model los agrega el
   backend) y se cachea en filesystem.
8. Se devuelve al cliente con `cached: false`.

Mapeo de errores HTTP (nunca se filtra la API key, el header
`Authorization`, el prompt completo ni el Grounding Packet completo en
ninguna respuesta de error):

| Situación | HTTP |
|---|---|
| Curso/módulo/tópico inexistente | `404` |
| Provider sin credencial configurada, o `LLM_PROVIDER` inválido | `503` |
| Credencial rechazada por el proveedor (401/403) | `503` |
| Error del proveedor externo (timeout, 5xx, conexión) tras reintentos | `502` |
| Respuesta del LLM inválida (JSON/contrato/grounding) tras reintentos | `422` |

`GET /api/ai/status` (no sensible, nunca incluye la credencial):

```json
{ "provider": "pwc", "model": "openai.gpt-4o-2024-11-20", "configured": false, "prompt_version": "lesson-v3.3.1" }
```

Funciona siempre, incluso sin ninguna credencial configurada — la app
completa (catálogo, cursos, tópicos) arranca y funciona igual.

Fases futuras (slides, TTS, preguntas de examen) seguirán el mismo patrón:
un endpoint de backend que construye el Grounding Packet del tópico (o de
varios tópicos de un módulo) como única entrada de contenido, valida
cualquier referencia `SRC-XXX` que el LLM produzca, y cachea en
filesystem con una cache key que incluya su propio `prompt_version`.

## 7. Classroom Engine y Scene Renderer (Fase 4)

```
LessonPlan (Fase 3)
    ↓
Classroom Engine (frontend/src/classroom/useClassroomEngine.ts)
    ├── progress state    currentSceneIndex, isCompleted, progressPercent
    ├── playback state    isPlaying, isPaused, renderKey
    └── narration state   currentNarrationIndex, nextNarrationChunk()
    ↓
SceneRenderer (frontend/src/classroom/SceneRenderer.tsx)
    ↓  tabla de despacho por scene.visual.visual_type
Visual Components (frontend/src/classroom/visuals/*.tsx)
    ↓
React + transición CSS + Pedagogical Animation (v1.2.0, determinística)
```

### 7.1 Classroom Engine

Hook simple (`useState`/`useEffect`, sin librería de state machine) con
acciones determinísticas: `nextScene`, `previousScene`, `pause`, `resume`,
`repeatScene`, `goToScene`, `resetLesson`, `nextNarrationChunk`.

- "Siguiente" en la última escena no saca el índice del arreglo: marca
  `isCompleted = true` (dispara la pantalla de finalización en
  `ClassroomPage`, con el `recap` de la `LessonPlan`).
- "Repetir" mantiene `currentSceneIndex`, reinicia `currentNarrationIndex`
  a 0 e incrementa `renderKey` (los componentes visuales y la síntesis de
  voz usan `renderKey`/`scene_id` como dependencia para reiniciar
  animaciones y lectura).
- `progressPercent` es determinístico: `0` en la primera escena, `100` al
  llegar a la última o al completar (fórmula:
  `round(sceneIndex / (total - 1) * 100)`).
- Progreso local (`frontend/src/classroom/classroomStorage.ts`): por
  tópico se persiste únicamente `{ courseId, moduleId, topicId,
  contentSha256, currentSceneIndex, completed, updatedAt }` en
  `localStorage` — nunca la `LessonPlan` completa. Si `contentSha256` no
  coincide con el de la lección activa, el progreso guardado se ignora (el
  motor arranca en la escena 0). Toda lectura/escritura está en
  `try/catch`: `localStorage` no disponible nunca rompe el aula.

### 7.2 Scene Renderer y Visual Components

`SceneRenderer` resuelve `scene.visual.visual_type` contra una tabla de
componentes (`Record<VisualType, Component>`), no un `if/else` gigante:
`HeroVisual`, `BulletsVisual`, `ProcessVisual`, `ComparisonVisual`,
`HierarchyVisual`, `ArchitectureVisual`, `ConceptMapVisual`, `TableVisual`,
`CodeVisual`, `QuoteVisual`, `NoVisual`.

**Fuente de información de cada visual** (por prioridad):
1. `scene.title` / `scene.key_points` — siempre.
2. El `SourceBlock` citado por `scene.visual.source_refs`, resuelto vía
   `frontend/src/classroom/sourceBlockLookup.ts` (indexa
   `CanonicalInfo.source_blocks` ya calculado por el backend, Fase 2; no
   duplica su lógica): `TableVisual` busca un bloque `block_type="table"`
   y lo parsea con un parser Markdown propio y mínimo
   (`frontend/src/classroom/markdownTable.ts`, nunca
   `dangerouslySetInnerHTML`); `CodeVisual` busca `block_type="code"` y
   muestra `plain_text` en `<pre><code>` (sin ejecutar nada); `QuoteVisual`
   busca `block_type="blockquote"`. Sin un bloque citado del tipo
   correspondiente, cada uno cae a una representación neutral basada en
   `key_points` — nunca inventa columnas, datos ni una atribución de cita.

**`scene.visual.description` nunca se renderiza como texto.** Es una
instrucción de presentación para el renderer (ya cubierta explícitamente
por `layout_hint`), no conocimiento pedagógico nuevo; ningún componente de
`src/classroom/visuals/` la lee para mostrar contenido (contrato
documentado en `src/classroom/visuals/types.ts` y verificado en
`SceneRenderer.test.tsx`: "visual.description nunca aparece como texto
visible en ningún renderer").

**Cero alucinación introducida por el renderer**: como `GroundedText` es
una lista plana (sin relaciones codificadas entre sus elementos), ningún
visual dibuja una conexión que los datos no establezcan explícitamente.
Desde v1.2.0 (bloque "Visual Fidelity"), `HierarchyVisual` usa
`nodes`/`edges` como fuente primaria cuando vienen poblados (raíz real +
un único nivel de hijos, detectado vía `hierarchyTree.ts`; degrada a
lista plana bajo `scene.title` si las edges son ambiguas — nunca inventa
una jerarquía), y `ArchitectureVisual`/`ConceptMapVisual` dibujan
conectores SVG geométricos reales (`DiagramCanvas`, posiciones medidas
del DOM, nunca coordenadas del LLM) en vez de una lista de texto "A → B".
`ComparisonVisual` arma columnas desde `comparison.columns`/`.rows`
cuando vienen poblados (contenido real y distinto por columna); sin
contenido estructurado, cae al comportamiento legacy (dos columnas solo
con exactamente 2 `key_points`, cards neutrales en cualquier otro caso).
Detalle completo, incluida la matriz semántica que decide qué
`visual_type` elegir el LLM, en `docs/VISUAL_FIDELITY.md` y
`docs/VISUAL_SELECTION.md`.

### 7.3 Animaciones

Dos capas distintas, deliberadamente no confundidas entre sí (ver
`docs/PEDAGOGICAL_ANIMATIONS.md` sección 2):

1. **Transición visual** (sin cambios desde Fase 4): CSS puro
   (`@keyframes` + `animation-delay` escalonado por índice,
   `classroom-stagger-item`/`classroom-scene-enter`), para el resto de
   los visuals (`bullets`/`hero`/`code`/`quote`/`image`/`table`/`none`).
   `.classroom-paused` (aplicada cuando `engine.isPaused`) fija
   `animation-play-state: paused` sobre esas clases.
2. **Pedagogical Animation** (v1.2.0, bloque "Pedagogical Animations"):
   progresión real controlada por JS para los 5 visuals estructurados
   (`process`/`hierarchy`/`architecture`/`concept_map`/`comparison`).
   `frontend/src/classroom/pedagogicalAnimation.ts` deriva
   determinísticamente una `AnimationSequence` del `VisualPlan` ya
   validado (sin LLM, sin efectos secundarios); `usePedagogicalAnimation.ts`
   la reproduce con un único `setTimeout` encadenado por escena, integrado
   con el mismo `engine.isPaused` de siempre (nunca un segundo control de
   pausa). `DiagramCanvas` gana predicados de visibilidad opcionales que
   solo cambian opacidad/outline, nunca la geometría ya calculada.

Ambas capas respetan `@media (prefers-reduced-motion: reduce)`; la
Pedagogical Animation además consulta `matchMedia` en JS (primera vez en
el proyecto — un `setTimeout` encadenado no se puede pausar solo con
CSS) para saltar directo al estado final sin programar ningún timer.
Contenido siempre visible en el DOM sin depender de que la animación
corra (nunca `display:none`). Cero dependencia nueva (sin Framer
Motion). Detalle completo en `docs/PEDAGOGICAL_ANIMATIONS.md`.

### 7.4 Voz (Web Speech API)

`frontend/src/classroom/speech.ts` (envoltorio sobre
`window.speechSynthesis`) + `useClassroomVoice.ts` (orquestación:
habla el chunk de narración de la escena activa, avanza
`currentNarrationIndex` al terminar cada uno vía `onend`, nunca avanza de
escena sola). Primera implementación funcional — **no** es un TTS
avanzado; la calidad de pronunciación depende de las voces instaladas en
el SO/navegador del usuario. Selección de voz: `es-AR` exacto > cualquier
`es-*` > voz default (nunca se asume un nombre de voz específico). El
texto leído es siempre `narration.text` tal cual (nunca se modifican
tecnicismos). Sin autoplay: solo arranca tras click en "Activar Voz".
Pause/Resume/Repetir/Previo/Siguiente/Salir cancelan o pausan la síntesis
en curso para evitar voces superpuestas. Preferencia de voz activada y de
velocidad se persisten en `localStorage` como valores simples.

## 8. Tutor bidireccional grounded + Checkpoints (Fase 5)

Fase 5 agrega dos capacidades nuevas sobre la base de Fases 2/3/4: un tutor
conversacional (preguntas y respuestas sobre el tópico activo) y
checkpoints interactivos (evaluación grounded de la respuesta del alumno a
`scene.interaction`). Ambas reutilizan la interfaz `LLMProvider` de Fase 3
sin crear una segunda abstracción de proveedor.

### 8.1 Flujo: pregunta del alumno al tutor

```
Alumno escribe una pregunta en TutorPanel
    ↓
useTutor.sendMessage()
    ├── onBeforeSend() → pausa la clase (composición externa sobre
    │                     useClassroomEngine.pause(), sin tocar el engine)
    └── construye recent_history (máx. 10 mensajes, en memoria React)
    ↓
POST .../topics/{topic_id}/tutor
    { message, scene_id, recent_history }
    ↓
TutorService.ask_tutor (backend/app/services/tutor_service.py)
    ├── resuelve CanonicalTopicContent + Grounding Packet (Fase 2, SIEMPRE
    │   la fuente de verdad — nunca cambia por esta fase)
    ├── resuelve SceneContext (título + source_refs de la escena activa,
    │   vía la LessonPlan cacheada de Fase 3 — NUNCA la LessonPlan
    │   completa, y NUNCA la narración de la escena)
    ├── build_tutor_messages(...) separa con delimitadores explícitos:
    │     A) pregunta del alumno (datos, nunca instrucción)
    │     B) recent_history (marcado NO CONFIABLE)
    │     C) contexto de clase generado (marcado NO ES FUENTE DE VERDAD)
    │     D) AUTHORIZED SOURCE = Grounding Packet completo (única fuente)
    │     E) JSON Schema de TutorReplyBody
    └── generate_with_retries(...) (llm_retry.py, mismo patrón de Fase 3:
        1 intento + hasta 2 correcciones; sin retry en auth/config)
    ↓
TutorReplyBody validado (Pydantic + validate_tutor_reply: cada
answer_chunks[*].source_refs debe existir en el CanonicalTopicContent)
    ↓
Respuesta al frontend: answer (con source_refs) | not_covered (mensaje fijo
determinístico, el modelo NUNCA redacta esta respuesta) | clarification
    ↓
TutorPanel muestra la respuesta; si voiceEnabled, la lee con
speechSynthesis (cancelando cualquier lectura previa; nunca simultánea con
la narración de la clase); el alumno hace click en "Continuar clase" para
reanudar exactamente en la misma escena/punto de narración donde estaba
(el estado de progreso del engine nunca se tocó durante la pregunta).
```

**Qué NUNCA es fuente de verdad en este flujo** (para que quede explícito y
no se relaje accidentalmente en una fase futura): `recent_history`, la
`LessonPlan` completa, el `SceneContext` derivado de ella, y — en el flujo
de checkpoints, ver 8.2 — `expected_answer`. La única fuente de verdad
sigue siendo el Grounding Packet del `CanonicalTopicContent` del tópico
activo (Fase 2).

### 8.2 Flujo: respuesta del alumno a un checkpoint

```
Alumno responde la pregunta de scene.interaction en CheckpointPanel
(expected_answer NUNCA se le muestra, ni antes ni después de responder)
    ↓
POST .../topics/{topic_id}/checkpoint
    { scene_id, answer }
    ↓
CheckpointService.evaluate_checkpoint (backend/app/services/checkpoint_service.py)
    ├── 1) resuelve CanonicalTopicContent + Grounding Packet (404 si el
    │      tópico no existe — ANTES de exigir credencial LLM)
    ├── 2) busca la LessonPlan cacheada (404 si no hay una generada)
    ├── 3) busca la escena por scene_id (404 si no existe)
    ├── 4) verifica interaction_type == comprehension_check (409 si no)
    ├── 5) recién acá exige llm_provider.is_configured() (503 si no)
    └── build_checkpoint_messages(...): la pregunta + expected_answer de
        scene.interaction se envían SOLO como "contexto de clase generado,
        NO autoritativo" — con una regla explícita en el system prompt:
        "si expected_answer contradice o sobreextiende AUTHORIZED SOURCE,
        AUTHORIZED SOURCE gana siempre". El evaluador nunca compara
        programáticamente answer contra expected_answer: el LLM evalúa
        contra el Grounding Packet, y el backend solo valida que
        feedback/ideal_answer citen source_refs reales.
    ↓
CheckpointEvaluationBody validado (verdict sin score/porcentaje/
gamificación; feedback grounded; ideal_answer opcional grounded — un campo
NUEVO, distinto de expected_answer)
    ↓
CheckpointPanel muestra verdict + feedback + ideal_answer (si viene). Nunca
bloquea el botón "Siguiente" de la clase.
```

El orden de validaciones (2)→(3)→(4) antes de (5) replica a propósito el
mismo patrón ya usado en Fase 3 para `POST .../lesson` (un tópico
inexistente da 404 incluso sin credencial configurada) — ver
`backend/tests/test_checkpoint_service.py::test_checkpoint_existence_checks_happen_before_provider_config`.

### 8.3 Contrato HTTP y manejo de errores

- `POST .../topics/{topic_id}/tutor`: acepta únicamente `message` (1–4000
  caracteres), `scene_id` (opcional) y `recent_history` (máx. 10 mensajes,
  roles `user`/`assistant`, cada uno máx. 4000 caracteres) — nunca un path
  de filesystem, Grounding Packet, prompt, API key, provider o modelo.
  Errores: `404` (tópico no encontrado), `503` (LLM no configurado), `502`
  (fallo del proveedor tras agotar reintentos), `422` (respuesta inválida
  tras agotar reintentos). Nunca se filtra el prompt, el Grounding Packet,
  la respuesta cruda del proveedor ni encabezados/API keys en ningún error.
- `POST .../topics/{topic_id}/checkpoint`: acepta `scene_id` y `answer`
  (1–4000 caracteres). Errores: `404` (tópico/`LessonPlan`/escena
  inexistente), `409` (la escena no es un `comprehension_check`), `503`/
  `502`/`422` con el mismo criterio que el tutor.
- Ninguno de los dos endpoints cachea su respuesta (cada pregunta o
  respuesta de checkpoint depende del contexto conversacional puntual);
  la única cache que sigue existiendo es la de `LessonPlan` (Fase 3).
- Logging (`app/services/service_logging.py`): eventos
  `tutor_query_started/completed/failed` y
  `checkpoint_evaluation_started/completed/failed` con únicamente ids,
  provider, model, `duration_ms` y `response_type`/`verdict` — nunca el
  texto de la pregunta, el historial, el prompt, el Grounding Packet, la
  API key ni la respuesta cruda del LLM.

### 8.4 Frontend: interrupción/reanudación, voz y reconocimiento de voz

- `TutorPanel` + `TutorConversation` + `useTutor` (`frontend/src/
  classroom/`): la conversación vive en memoria React durante la sesión
  (`useState` dentro de `useTutor`), nunca persistida en `localStorage` ni
  en el backend; se reinicia sola al cambiar de tópico porque
  `ClassroomPage` monta una instancia nueva vía `key={courseId-moduleId-
  topicId}`.
- Interrupción/reanudación de la clase: composición externa en
  `ClassroomPage` sobre `pause()`/`resume()`, ya existentes en
  `useClassroomEngine` desde Fase 4 — no se agregó ningún método nuevo al
  engine. `currentSceneIndex`/`currentNarrationIndex` nunca se tocan
  durante una pregunta al tutor.
- Voz: se reutiliza `speech.ts` de Fase 4 (`speakSequence`, nueva función
  que encadena varios `GroundedText` con el mismo `speakText` de siempre);
  nunca hay narración de la clase y respuesta del tutor sonando a la vez
  (se cancela explícitamente la lectura anterior antes de empezar una
  nueva, incluso ante un reintento rápido).
- Reconocimiento de voz (`speechRecognition.ts`, nuevo): envoltorio fino
  sobre `window.SpeechRecognition`/`webkitSpeechRecognition` con feature
  detection explícita — sin paquete npm nuevo. `continuous=false`,
  `interimResults=false`, idioma preferido `es-AR`. El transcript final se
  coloca en el input del tutor SIN enviarlo automáticamente. Si el
  navegador no lo soporta, el botón de micrófono se deshabilita con un
  tooltip claro; nunca es un requisito para usar el tutor.
- `CheckpointPanel`: nunca muestra `scene.interaction.expected_answer` (ni
  antes ni después de evaluar) — el campo que sí se muestra tras evaluar es
  `result.ideal_answer`, estructuralmente distinto y producido por la
  evaluación misma.
- Seguridad de renderizado: `TutorConversation` y `CheckpointPanel`
  renderizan todo el texto del tutor/checkpoint como texto React normal
  (JSX `{texto}`), nunca `dangerouslySetInnerHTML`; el tutor nunca produce
  Markdown/HTML interpretado ni enlaces clicables arbitrarios.
- `source_refs` de una respuesta del tutor solo son visibles con
  `import.meta.env.DEV` (mismo patrón del panel de grounding de Fase 2),
  nunca al alumno en producción.

### 8.5 Límite conocido: `expected_answer` casi nunca existe en la práctica

El prompt de `LessonGenerator` (Fase 3, `app/prompts/lesson.py`) nunca
instruye explícitamente al modelo a incluir un `scene.interaction`; es un
campo opcional del esquema que el modelo puede omitir libremente. En la
práctica, la mayoría de las `LessonPlan` generadas hoy no incluyen ningún
`comprehension_check`. El `CheckpointService`/`CheckpointPanel` de Fase 5
están completos y probados (con `FakeLLMProvider` en tests, y con
fixtures reales en el smoke test), pero para que el alumno vea un
checkpoint en una clase real haría falta, en una fase futura, actualizar
el prompt de Fase 3 para pedir explícitamente al menos un
`comprehension_check` por tema — cambio deliberadamente fuera de alcance
de Fase 5 (que consumía ese campo tal como ya existía, no cambiaba cómo se
genera).

**Actualización (Fase 6)**: este límite se resolvió. El prompt de
`LessonGenerator` (`app/prompts/lesson.py`) ganó la REGLA 13, pidiendo
razonablemente uno o más `comprehension_check` cuando el contenido tenga
sustancia conceptual, sin convertirlo en obligación absoluta.
`LESSON_PROMPT_VERSION` pasó de `lesson-v1` a `lesson-v2` (invalida por
diseño la cache de `LessonPlan` existente, igual que cualquier cambio de
prompt versionado en este proyecto).

## 9. Práctica de certificación grounded (Fase 6)

Fase 6 agrega una capa de práctica/simulacro de preguntas objetivas
(single/multiple choice), generadas exclusivamente a partir del material
de cada tópico, con ensamblaje y evaluación 100% determinísticos (sin
LLM). **Aviso de producto, no solo técnico**: esto NO representa ni afirma
reproducir un examen oficial de ninguna certificación externa.

### 9.1 Flujo: generación de un QuestionBank (por tópico)

```
Topic (course_id/module_id/topic_id, resuelto por el repositorio seguro)
    ↓
CanonicalTopicContent + Grounding Packet (Fase 2 — ÚNICA fuente de verdad)
    ↓
Prompt Builder (app/prompts/certification.py, 20 reglas: sin conocimiento
general, distractores solo de la fuente, sin afirmar origen oficial, etc.)
    ↓
LLMProvider.generate_structured (Fase 3, reutilizado tal cual)
    ↓
GeneratedQuestionBankBody (validación Pydantic: tipos, ≥3 opciones,
option_id únicos, correct_option_ids válidos y en la cantidad correcta
según el tipo de pregunta)
    ↓
validate_question_bank (app/services/certification_validation.py):
source_refs/derivation_refs reales + detección de stems duplicados
(normalizados) dentro del mismo banco
    ↓
QuestionBank (ensamblada por el BACKEND: bank_id = hash de cache key,
question_id Q-001/Q-002/... asignado tras validar — el LLM NUNCA los
produce)
    ↓
Cache en filesystem (CERTIFICATION_CACHE_DIR, escritura atómica, key =
content_sha256 + provider + model + certification_prompt_version)
```

`CERTIFICATION_ITEMS_PER_TOPIC` (default 6, acotado 1-10 en el servicio)
es un OBJETIVO enviado al modelo, nunca un mínimo: un tópico sin sustancia
conceptual suficiente puede devolver menos preguntas, incluso cero — nunca
se rellena artificialmente. Un `QuestionBank` se genera únicamente cuando
falta en cache y el alumno pidió explícitamente "Preparar práctica" (nunca
al abrir catálogo/curso/módulo/tópico).

### 9.2 Flujo: examen (ensamblaje + respuesta del alumno + resultado)

```
POST .../certification/prepare { mode, scope, question_count, shuffle }
    ↓
resolve_scope(...): resuelve module_ids/topic_ids contra
course_service.get_course_detail (repositorio seguro) — nunca acepta una
ruta de filesystem; dedup preservando orden; 404 (curso) / 422 (módulo o
tópico inexistente en ESE curso)
    ↓
get_or_generate_question_bank(...) por cada tópico resuelto (9.1)
    ↓
Ensamblaje ROUND-ROBIN determinístico entre tópicos (topic A Q1, topic B
Q1, topic C Q1, topic A Q2, ...) — NUNCA un LLM elige el examen. Si un
tópico tiene menos preguntas, se continúa con los demás; si no alcanza
question_count, se devuelven las disponibles + requested_count/actual_count
(no es un error). shuffle=true reordena localmente sin volver a generar.
    ↓
ExamQuestionView[] — SOLO bank_id/question_id/course_id/module_id/topic_id/
question_type/question_style/stem/options(option_id+text). NUNCA
correct_option_ids/explanation/competency/derivation_refs (ver test
dedicado que serializa la respuesta completa).
    ↓
Alumno responde (Practice: evalúa cada pregunta al toque; Simulation: sin
feedback, entrega todo el lote al final)
    ↓
POST .../certification/evaluate-question  o  .../certification/evaluate
    ↓
certification_evaluator.evaluate_answer(...) — comparación de conjuntos
determinística, SIN LLM (single_choice: exacto o incorrect; multiple_choice:
exacto=correct, intersección no vacía=partially_correct, sin
intersección=incorrect)
    ↓
QuestionEvaluation (bank_id, question_id, verdict, correct_option_ids,
explanation, competency — recién ACÁ, después de responder, es correcto
exponer el answer key) / CertificationPracticeResult (agregado: por
tópico, por competencia — texto exacto de "competency", sin fusión
semántica —, tópicos a reforzar ordenados por menor score, todo grounded)
```

### 9.3 Seguridad del answer key

- `ExamQuestionView` es, por diseño de tipos, estructuralmente incapaz de
  cargar el answer key (no tiene esos campos) — ver
  `backend/app/models/certification.py` y
  `frontend/src/types/api.ts`.
- El frontend nunca guarda `correct_option_ids` en React state,
  `sessionStorage` ni el DOM antes de evaluar: `certificationStorage.ts`
  solo persiste `selections` (lo que el alumno eligió) hasta que
  `evaluate-question`/`evaluate` responde con el veredicto real.
- `bank_id` es el hash SHA-256 de la cache key (64 hex chars); un
  `bank_id` con formato inválido, inexistente, o de otro curso, siempre
  devuelve 404 — nunca se construye una ruta de filesystem con un
  `bank_id` no validado (protección explícita contra path traversal, ver
  `_BANK_ID_PATTERN` en `certification_service.py`).

### 9.4 Deuda de Fase 5 cerrada en Fase 6

- **`comprehension_check`**: ver actualización en la sección 8.5 más
  arriba (`lesson-v2`).
- **Tutor sin Markdown decorativo**: el system prompt del tutor
  (`app/prompts/tutor.py`) ganó la REGLA 19 — texto plano, sin `**`, `__`,
  `#`, backticks ni listas Markdown innecesarias. `TUTOR_PROMPT_VERSION`
  pasó a `tutor-v2` (el tutor no se cachea, así que esto es solo para
  trazabilidad/auditoría, no afecta ninguna cache key).

## 10. Por qué esta arquitectura y no otra

- **Sin base de datos**: el contenido es archivos Markdown versionables;
  no hay necesidad de un motor de persistencia transaccional para leerlos.
- **Sin microservicios**: un único backend FastAPI es suficiente para el
  volumen de responsabilidades actual; separar en servicios añadiría
  complejidad operativa sin beneficio funcional en esta etapa.
- **Sin frameworks de orquestación de agentes (LangChain/LangGraph)**: la
  regla de grounding estricta (todo el contexto es el Grounding Packet del
  tópico, ver sección 3) se resuelve con una llamada directa al proveedor
  (`LLMProvider.generate_structured`) más validación propia; no hace falta
  un grafo de agentes para eso.
- **`markdown-it-py` en vez de un parser propio (Fase 2)**: expone, para
  cada token de bloque, el rango de líneas de origen (necesario para
  `start_line`/`end_line`) sin tener que reimplementar un parser Markdown,
  y soporta tablas simplemente habilitando la regla `table` sobre el
  preset `commonmark`, sin plugins adicionales.
- **`openai` (SDK oficial) en vez de HTTP manual (Fase 3)**: para
  `OpenAIProvider` se usa el SDK oficial porque expone
  `chat.completions.parse(response_format=<PydanticModel>)` (Structured
  Outputs) de forma directa y validada por el propio SDK, evitando
  reimplementar ese parsing a mano. Para `PwCGenAIProvider` se reutiliza
  `httpx` (ya era dependencia por los tests) en vez de agregar `requests`
  u otro cliente HTTP nuevo — el servicio PwC no tiene SDK propio y su
  contrato (`POST /chat/completions`) es simple de invocar directamente.
- **Sin RAG, sin embeddings, sin base de datos vectorial**: la
  segmentación en `SourceBlock` (Fase 2) más el Grounding Packet completo
  del tópico ya activo (Fase 3) son suficientes para el grounding
  determinístico que necesita esta aplicación — un tópico completo entra
  cómodamente en el contexto de un LLM moderno; no hay necesidad de
  recuperación por similitud.
- **Retries acotados en vez de un framework de reintentos**: un contador
  simple (`MAX_GENERATION_ATTEMPTS = 3`) con una distinción explícita entre
  errores no recuperables (auth/config) y recuperables (upstream/contrato)
  alcanza para este caso de uso; no se justifica una librería de retry
  policies.
- **`useState`/`useEffect` en vez de Redux/Zustand/XState (Fase 4)**: el
  estado del Classroom Engine (índice de escena, narración, pausa,
  completado) es local a un tópico a la vez, sin necesidad de compartirse
  entre componentes lejanos ni de una máquina de estados formal; un hook
  plano es suficiente y más simple de leer/testear.
- **CSS puro en vez de Framer Motion (Fase 4)**: `@keyframes` +
  `animation-delay` escalonado cubre entrada de slide, aparición
  progresiva de conceptos y transición de escena sin agregar una
  dependencia nueva; `animation-play-state` resuelve pausa real y
  `prefers-reduced-motion` se maneja íntegramente en CSS.
- **Vitest + React Testing Library en vez de Cypress/Playwright (Fase
  4)**: para la lógica crítica de Fase 4 (engine, storage, selección de
  visual por `visual_type`) alcanza con tests unitarios/de componente
  rápidos sobre `jsdom`; no se justifica todavía un framework E2E de
  navegador real dentro del proyecto (la validación visual manual de esta
  fase se hizo con un script Playwright fuera del repositorio, ver el
  informe de la Fase 4).
- **Web Speech API del navegador en vez de un TTS server-side (Fase 4)**:
  primera implementación funcional de voz sin agregar ninguna dependencia
  ni credencial nueva; un proveedor TTS server-side (ej. OpenAI) queda
  para una fase posterior cuando se necesite mejor calidad/control de voz
  que el navegador no pueda ofrecer.
- **Composición externa en vez de extender `useClassroomEngine` (Fase
  5)**: interrumpir/reanudar la clase al preguntarle algo al tutor se
  resolvió reutilizando `pause()`/`resume()`, ya existentes desde Fase 4,
  desde un componente que los orquesta (`ClassroomPage`) — evita agregar
  responsabilidades nuevas a un motor que ya tenía un contrato estable y
  probado.
- **`window.SpeechRecognition` nativo en vez de un SDK de reconocimiento de
  voz (Fase 5)**: igual que la síntesis de voz en Fase 4, se prioriza cero
  dependencias/credenciales nuevas; el dictado es una mejora opcional
  (feature-detected) del input de texto, nunca un requisito.
- **`expected_answer` nunca autoritativo en la evaluación de checkpoints
  (Fase 5)**: ese campo lo generó el LLM durante la generación de la
  `LessonPlan` (Fase 3) y, aunque pasó la validación estructural de
  grounding en ese momento, es una afirmación pedagógica más — no una
  fuente canónica. Tratarlo como autoritativo en la evaluación
  introduciría un segundo canal de "verdad" paralelo al Grounding Packet,
  exactamente lo que la regla absoluta de grounding (sección 2 de
  `CLAUDE.md`) prohíbe.
- **QuestionBank por tópico en vez de un Grounding Packet único del curso
  completo (Fase 6)**: concatenar todos los módulos/tópicos de un curso en
  un solo prompt puede provocar context overflow, pérdida de grounding y
  preguntas desbalanceadas entre tópicos. Generar un banco por tópico
  (con su propio Grounding Packet acotado) y ensamblar el examen después,
  determinísticamente, evita ese problema sin perder cobertura.
- **Ensamblaje y evaluación determinísticos, sin LLM (Fase 6)**: elegir
  qué preguntas entran en un examen (round-robin) y corregir
  single/multiple choice son operaciones de conjuntos/listas simples — un
  LLM introduciría costo, latencia y no-determinismo innecesarios donde
  una función Python alcanza y sobra (mismo principio de simplicidad que
  el resto del proyecto).
- **Esto NO es RAG (Fase 6)**: no hay embeddings, vector store ni
  similarity search en ningún punto — la resolución de scope es
  determinística contra el filesystem real de cursos (mismo repositorio
  seguro del resto de la aplicación), no una recuperación por similitud
  semántica.
- **`sessionStorage` en vez de `localStorage` para la sesión de examen
  (Fase 6)**: una práctica de certificación es de la sesión actual del
  navegador, no un historial permanente (eso queda para una fase futura,
  ver `docs/ROADMAP.md`); `sessionStorage` expresa esa vida útil más corta
  sin código adicional.

## 11. Productización y hardening (Fase 7)

- **Scripts PowerShell en vez de un instalador o WSL**: `scripts/setup.ps1`
  / `start.ps1` / `stop.ps1` / `doctor.ps1` son scripts simples (sin
  Chocolatey, sin instalador `.msi`, sin WSL) que asumen únicamente Docker
  Desktop. Cada uno está compuesto de funciones chicas y testeables por
  separado (dot-source guard: `if ($MyInvocation.InvocationName -ne '.')`),
  para poder probarlas de forma aislada sin ejecutar el flujo interactivo
  completo.
- **Cache key con identidad contextual completa (bugfix real, Fase 7)**:
  la cache de `LessonPlan`/`QuestionBank` dependía solo de
  `content_sha256 + provider + model + prompt_version`. Dos tópicos
  distintos con Markdown idéntico (por ejemplo, dos plantillas de
  introducción) colisionaban en la misma entrada de cache y el segundo
  tópico recibía la identidad (`course_id`/`module_id`/`topic_id`/
  `lesson_id`/`bank_id`) del primero. Se reprodujo con un test que falla
  antes del fix y se corrigió incluyendo `course_id, module_id, topic_id`
  (+ `items_per_topic` en certificación) en la cache key, más un
  `CACHE_SCHEMA_VERSION` (`cache-v2`) compartido para invalidar de forma
  limpia toda cache con el formato de clave anterior — sin sistema de
  migración: las caches siguen siendo descartables por diseño.
- **Allow-list de extensiones para assets de curso, nunca block-list**:
  el endpoint de imágenes de tópico sólo sirve `.png .jpg .jpeg .webp
  .gif`; cualquier otra extensión (incluido `.svg`, que puede contener
  contenido activo) se rechaza, en vez de intentar enumerar y bloquear
  extensiones peligrosas una por una.
- **`openai` SDK reutilizado para TTS, sin dependencia nueva**: la versión
  ya instalada del SDK oficial soporta `client.audio.speech.create(...)`,
  así que la voz neural no agrega ninguna dependencia — mismo principio
  que llevó a reutilizar `httpx`/`openai` en la Fase 3.
- **Un `SpeechService` simple en vez de una jerarquía de providers para
  voz**: a diferencia de `LLMProvider` (dos proveedores intercambiables
  reales), sólo existe un backend de voz neural (OpenAI); una interfaz
  abstracta adicional no tendría un segundo consumidor real todavía, así
  que `speech_service.py` es una función + una clase de cliente, no un ABC.
- **`voicePlayback.ts` como fachada única sobre dos backends de voz**: en
  vez de que cada componente (aula, tutor, checkpoints, certificación)
  sepa si la voz activa es del navegador o neural, un módulo central
  (`cancelAllSpeech`/`pauseAllSpeech`/`resumeAllSpeech`) actúa siempre
  sobre ambos backends de forma idempotente — garantiza "nunca dos audios
  simultáneos" desde un solo lugar, sin tener que rastrear "cuál backend
  está sonando" en cada punto de la UI.
- **Sin Nginx**: el frontend sigue sirviéndose con el dev server de Vite
  dentro del container, igual que en fases anteriores. Para una aplicación
  local dockerizada (sin CDN, sin múltiples réplicas, sin necesidad de
  servir assets estáticos a gran escala) agregar Nginx sólo por "pureza de
  producción" sumaría una capa de configuración sin un beneficio real en
  este contexto — se documenta la decisión acá en vez de tomarla
  implícitamente.
- **`X-Request-ID` con `ContextVar` en vez de un framework de tracing**:
  un middleware genera (o valida) un id por request y lo expone vía
  `ContextVar` para que los logs estructurados lo incluyan
  automáticamente sin tener que pasarlo explícitamente por cada función;
  no se agregó OpenTelemetry ni un colector porque no hay múltiples
  servicios que correlacionar todavía.

### Modelo de seguridad local

- **Las credenciales nunca salen del backend.** `PWC_GENAI_API_KEY`,
  `GEN_AI_API_KEY` y `OPENAI_API_KEY` sólo existen como variables de
  entorno del proceso backend; nunca se envían al frontend, nunca
  aparecen en una respuesta HTTP, nunca se loguean (los mensajes de log de
  errores upstream se construyen explícitamente sin el header
  `Authorization` ni el cuerpo crudo de la respuesta del proveedor).
- **`.env` es un secreto local en texto plano.** Está en `.gitignore`; el
  repositorio no versiona ninguna key real. `scripts/setup.ps1` nunca
  imprime la credencial en pantalla (entrada sin eco vía `SecureString`) y
  nunca la pasa como argumento de línea de comandos.
- **`/content` se monta de solo lectura.** El backend nunca escribe ni
  modifica el directorio de cursos del host; sólo lee. La resolución de
  curso/módulo/tópico/asset siempre enumera directorios reales y compara
  slugs — nunca concatena el `id` recibido en un request directamente a
  una ruta de filesystem, lo que hace el path traversal estructuralmente
  imposible (reforzado con `Path.resolve()` + `is_relative_to(root)`).
- **No hay navegación de filesystem arbitraria.** El único endpoint que
  sirve un archivo del host (`.../assets/{asset_path}`) exige que el
  archivo esté dentro del curso resuelto y tenga una extensión de la
  allow-list de imágenes; todo lo demás (incluidos `.html`/`.js`/binarios)
  se rechaza con 404, no con un error que revele la razón exacta.
  Ver [`test_course_assets.py`](../backend/tests/test_course_assets.py).
- **La salida del LLM nunca es ejecutable.** `VisualPlan` es una
  especificación declarativa (enum cerrado + texto libre nunca
  interpretado como markup); el frontend no tiene `dangerouslySetInnerHTML`,
  `eval`, `new Function` ni HTML crudo proveniente de una `LessonPlan` o de
  una respuesta del tutor en ningún componente.
- **La clave de respuestas de certificación es server-side hasta
  evaluar.** El frontend nunca recibe `correct_option_ids` ni la
  explicación de una pregunta antes de que el alumno responda; recién
  después de `POST .../submit` la respuesta HTTP incluye esa información.
- **No hay conversaciones persistidas en el backend.** El historial del
  tutor vive en memoria del navegador durante la sesión; las caches
  (`lesson-cache`, `certification-cache`, `speech-cache`) sólo guardan
  contenido ya grounded y determinísticamente verificable, nunca datos
  personales ni identificadores de usuario.
- **Las caches son locales y descartables.** Viven en `data/` (filesystem,
  gitignored) dentro del container/host; se pueden borrar manualmente en
  cualquier momento sin romper la aplicación.
