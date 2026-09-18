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
- `app/services/llm_provider.py`: interfaz `LLMProvider` con
  implementaciones esqueleto `PwCGenAIProvider` / `OpenAIProvider`. **No se
  invoca desde ningún endpoint en Fase 1.**
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

## 3. Responsabilidades y límites

| Capa | Responsable de | NO responsable de |
|---|---|---|
| Frontend | Navegación, presentación, renderizado de Markdown, UX del aula | Lógica de negocio de cursos, acceso a filesystem, llamadas a LLM |
| Backend / routers | Validación HTTP, códigos de status | Lógica de resolución de filesystem |
| Backend / services | Resolución segura de filesystem, parsing de frontmatter, futura orquestación de LLM | Renderizado de Markdown, UI |
| Filesystem de cursos | Contenido pedagógico (única fuente de verdad) | Nada de lógica; es contenido estático |

## 4. Flujo de navegación (Fase 1)

1. El usuario entra al **Catálogo** (`/`) → `GET /api/courses`.
2. Selecciona un curso → **Detalle de curso** (`/cursos/:courseId`) →
   `GET /api/courses/{course_id}`.
3. Selecciona un tópico → **Aula Virtual**
   (`/aula/:courseId/:moduleId/:topicId`) → se piden en paralelo el
   detalle del curso (para navegación) y el tópico puntual.
4. Dentro del aula, el selector de módulo, los botones "Previo/Siguiente"
   y la navegación de tópicos recalculan la ruta y disparan una nueva
   petición `GET /api/courses/.../topics/{topic_id}`.

## 5. Flujo futuro del LLM (NO implementado en Fase 1)

Cuando se implemente la integración real:

1. El frontend enviará la pregunta del alumno y el `topic_id` activo al
   backend (nuevo endpoint, ej. `POST /api/courses/{course_id}/modules/
   {module_id}/topics/{topic_id}/ask`).
2. El backend cargará el Markdown **original** de ese tópico (ya lo hace
   hoy para `GET .../topics/{topic_id}`) y lo usará como **único contexto**
   permitido para el LLM (grounding estricto, ver `CLAUDE.md` sección 2).
3. El backend invocará el `LLMProvider` configurado
   (`PwCGenAIProvider` u `OpenAIProvider` según `LLM_PROVIDER`), pasando el
   Markdown como contexto y la pregunta del alumno.
4. Si el LLM no puede fundamentar la respuesta en el Markdown provisto,
   el backend deberá devolver una respuesta que indique explícitamente que
   el tema no está cubierto por el material disponible (esto se resuelve
   con prompting + validación, no con un componente nuevo de
   infraestructura).
5. Las credenciales de los proveedores LLM permanecen exclusivamente en el
   backend (variables de entorno); nunca se exponen al navegador.
6. Generación de slides, narración (TTS) y preguntas de examen seguirán el
   mismo patrón: un endpoint de backend que toma el Markdown del tópico (o
   de varios tópicos de un módulo) como única entrada de contenido.

## 6. Por qué esta arquitectura y no otra

- **Sin base de datos**: el contenido es archivos Markdown versionables;
  no hay necesidad de un motor de persistencia transaccional para leerlos.
- **Sin microservicios**: un único backend FastAPI es suficiente para el
  volumen de responsabilidades actual; separar en servicios añadiría
  complejidad operativa sin beneficio funcional en esta etapa.
- **Sin frameworks de orquestación de agentes (LangChain/LangGraph)**: la
  Fase 1 no invoca ningún LLM; cuando se implemente, la regla de grounding
  estricta (todo el contexto es el Markdown del tópico) es simple de
  resolver con una llamada directa al proveedor, sin necesitar un grafo de
  agentes.
