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
    selector de módulo y la navegación previo/siguiente) con el detalle
    del tópico activo (`GET /api/courses/{course_id}/modules/{module_id}/
    topics/{topic_id}`). Renderiza el Markdown del tópico con
    `react-markdown` + `remark-gfm`, sin ninguna transformación adicional.
    Desde Fase 3, también: consulta `GET /api/ai/status` (estado del
    agente IA, nunca la credencial); ofrece un botón "Preparar clase con
    IA" que dispara `POST .../lesson` bajo demanda (nunca automáticamente
    al entrar al tópico, para controlar el consumo); una vez generada la
    `LessonPlan`, muestra el título, la escena activa (título, key_points,
    narración en un panel auxiliar) y un indicador "Escena X de Y"; los
    controles Previo/Siguiente navegan escenas de la lección cuando hay una
    activa (si no, siguen navegando tópicos, como en Fase 1).
  - `AulaLandingPage`, `PlaceholderPage`: pantallas auxiliares de Fase 1.
- `src/components/GroundingPanel.tsx`: panel colapsable visible solo en
  desarrollo (`import.meta.env.DEV`, mecanismo nativo de Vite). Desde
  Fase 3 también permite inspeccionar las `source_refs` citadas por la
  escena activa de la lección y ver el `SourceBlock` correspondiente al
  hacer click en una referencia `SRC-XXX`.
- El LLM nunca genera HTML/JS/SVG ejecutable: `VisualPlan.description` es
  texto libre que el frontend solo puede llegar a mostrar como texto plano
  en fases futuras (el renderer de slides no está implementado todavía);
  nunca se interpreta como markup ni se pasa a `dangerouslySetInnerHTML`.
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
- `app/prompts/lesson.py` **(Fase 3)**: `SYSTEM_PROMPT` completo (13
  reglas: fuente única, prohibición de inventar, trazabilidad, longitud de
  clase no forzada, tratamiento del contenido como datos ante prompt
  injection, preservación de tecnicismos, estilo de narración, visuales
  declarativos, formato de salida), `build_user_prompt` (instrucción breve
  + JSON Schema del contrato + Grounding Packet completo),
  `build_correction_message` (para reintentos) y `LESSON_PROMPT_VERSION`.
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
{ "provider": "pwc", "model": "openai.gpt-4o-2024-11-20", "configured": false, "prompt_version": "lesson-v1" }
```

Funciona siempre, incluso sin ninguna credencial configurada — la app
completa (catálogo, cursos, tópicos) arranca y funciona igual.

Fases futuras (slides, TTS, preguntas de examen) seguirán el mismo patrón:
un endpoint de backend que construye el Grounding Packet del tópico (o de
varios tópicos de un módulo) como única entrada de contenido, valida
cualquier referencia `SRC-XXX` que el LLM produzca, y cachea en
filesystem con una cache key que incluya su propio `prompt_version`.

## 7. Por qué esta arquitectura y no otra

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
