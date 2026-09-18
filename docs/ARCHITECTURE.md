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
                                              │ (futuro, no implementado en Fase 1)
                                              ▼
                                     ┌──────────────────┐
                                     │  LLMProvider      │
                                     │  (PwC GenAI /     │
                                     │   OpenAI)         │
                                     └──────────────────┘
```

Todo corre en contenedores Docker orquestados por `docker-compose.yml`. No
hay base de datos: el contenido de los cursos vive en el filesystem
(montado como bind mount de solo lectura) y el progreso del alumno se
guardará en el futuro en `localStorage` del navegador.

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
  - `AulaLandingPage`, `PlaceholderPage`: pantallas auxiliares de Fase 1.
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
- `app/services/llm_provider.py`: interfaz `LLMProvider` con
  implementaciones esqueleto `PwCGenAIProvider` / `OpenAIProvider`. **No se
  invoca desde ningún endpoint todavía** (ni en Fase 1 ni en Fase 2).
- `app/routers/`: `health.py` (liveness) y `courses.py` (API de cursos).
  Los routers son delgados: validan input HTTP, delegan en
  `app/services/courses.py` y traducen excepciones de dominio
  (`CourseNotFoundError`, etc.) a `HTTPException` con el status code
  correcto.

### 2.3 Filesystem de cursos (`courses/`)

- Fuente de verdad del contenido pedagógico.
- Se monta en el container backend como bind mount **read-only** en
  `/content`, usando la sintaxis *long-form* de Docker Compose para evitar
  problemas de interpretación de rutas de Windows.
- Convención: `curso/módulo/tópico.md`, con prefijos numéricos opcionales
  para ordenar y frontmatter YAML opcional para metadata explícita.

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
  (nuevo, herramienta de inspección/desarrollo) devuelve `content_sha256`,
  `source_block_count` y el `grounding_packet` completo. No contiene
  secretos.

## 4. Responsabilidades y límites

| Capa | Responsable de | NO responsable de |
|---|---|---|
| Frontend | Navegación, presentación, renderizado de Markdown, UX del aula | Lógica de negocio de cursos, acceso a filesystem, llamadas a LLM |
| Backend / routers | Validación HTTP, códigos de status | Lógica de resolución de filesystem |
| Backend / services | Resolución segura de filesystem, parsing de frontmatter, futura orquestación de LLM | Renderizado de Markdown, UI |
| Filesystem de cursos | Contenido pedagógico (única fuente de verdad) | Nada de lógica; es contenido estático |

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

## 6. Flujo futuro del LLM (NO implementado todavía)

Cuando se implemente la integración real:

1. El frontend enviará la pregunta del alumno y el `topic_id` activo al
   backend (nuevo endpoint, ej. `POST /api/courses/{course_id}/modules/
   {module_id}/topics/{topic_id}/ask`).
2. El backend construirá el `CanonicalTopicContent` de ese tópico (ya lo
   hace hoy, Fase 2, vía `app/services/canonical.py`) y su Grounding
   Packet, y lo usará como **único contexto** permitido para el LLM
   (grounding estricto, ver `CLAUDE.md` sección 2).
3. El backend invocará el `LLMProvider` configurado
   (`PwCGenAIProvider` u `OpenAIProvider` según `LLM_PROVIDER`), pasando el
   Grounding Packet como contexto y la pregunta del alumno.
4. La respuesta del LLM deberá citar una o más referencias `SRC-XXX`. El
   backend las validará contra el `CanonicalTopicContent` real del tópico
   con `assert_valid_source_refs` (Fase 2, ya implementado) antes de
   aceptar la respuesta. Si el LLM no puede fundamentar la respuesta en el
   Grounding Packet provisto (o cita referencias inválidas), el backend
   deberá devolver una respuesta que indique explícitamente que el tema no
   está cubierto por el material disponible.
5. Las credenciales de los proveedores LLM permanecen exclusivamente en el
   backend (variables de entorno); nunca se exponen al navegador.
6. Generación de slides, narración (TTS) y preguntas de examen seguirán el
   mismo patrón: un endpoint de backend que construye el Grounding Packet
   del tópico (o de varios tópicos de un módulo) como única entrada de
   contenido, y valida cualquier referencia `SRC-XXX` que el LLM produzca.

## 7. Por qué esta arquitectura y no otra

- **Sin base de datos**: el contenido es archivos Markdown versionables;
  no hay necesidad de un motor de persistencia transaccional para leerlos.
- **Sin microservicios**: un único backend FastAPI es suficiente para el
  volumen de responsabilidades actual; separar en servicios añadiría
  complejidad operativa sin beneficio funcional en esta etapa.
- **Sin frameworks de orquestación de agentes (LangChain/LangGraph)**: la
  Fase 1 no invoca ningún LLM; cuando se implemente, la regla de grounding
  estricta (todo el contexto es el Grounding Packet del tópico, ver
  sección 3) es simple de resolver con una llamada directa al proveedor,
  sin necesitar un grafo de agentes.
- **`markdown-it-py` en vez de un parser propio (Fase 2)**: es la única
  dependencia nueva agregada en Fase 2. Se eligió porque expone, para cada
  token de bloque, el rango de líneas de origen (necesario para
  `start_line`/`end_line`) sin tener que reimplementar un parser Markdown,
  y porque soporta tablas simplemente habilitando la regla `table` sobre
  el preset `commonmark`, sin plugins adicionales. No se usan RAG,
  embeddings ni bases de datos vectoriales: la segmentación en
  `SourceBlock` es suficiente para el grounding determinístico que necesita
  esta fase.
