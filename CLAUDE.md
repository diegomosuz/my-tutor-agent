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

## 6. Proveedores LLM (preparado, no implementado en Fase 1)

El backend está preparado para soportar múltiples proveedores mediante una
interfaz común (`backend/app/services/llm_provider.py`):

```
LLMProvider (ABC)
  PwCGenAIProvider
  OpenAIProvider
```

Variables de entorno relevantes (ver `.env.example`):

```
LLM_PROVIDER=pwc
PWC_GENAI_BASE_URL=...
PWC_GENAI_API_KEY=
PWC_GENAI_MODEL=...
OPENAI_API_KEY=
OPENAI_MODEL=
VOICE_PROVIDER=browser
```

**Regla dura**: las API keys nunca deben llegar al navegador. Todo llamado
a un proveedor LLM ocurre exclusivamente desde el backend.

## 7. Convenciones

- Backend en español para nombres de dominio de negocio cuando aporte
  claridad (cursos, módulos, tópicos), pero código, nombres de funciones y
  comentarios técnicos en el idioma que ya predomina en cada archivo
  (actualmente: comentarios en español, identificadores en inglés).
- Los modelos Pydantic viven en `backend/app/models/schemas.py` y son el
  contrato de la API. Los tipos TypeScript en
  `frontend/src/types/api.ts` deben mantenerse como espejo manual de esos
  modelos.
- No convertir ni transformar el Markdown en el backend; el frontend es
  responsable del renderizado (actualmente con `react-markdown` +
  `remark-gfm`).
- Toda ruta de filesystem se resuelve enumerando directorios reales, nunca
  concatenando input de usuario directamente (ver sección 5).
- Tests de backend con `pytest`, usando `TestClient` de FastAPI y
  `app.dependency_overrides` para inyectar un `content_dir` de prueba
  (ver `backend/tests/conftest.py`).

## 8. Comandos principales

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

# Build de producción del frontend (verificación de tipos + bundle)
docker compose run --rm frontend npm run build

# Bajar el entorno
docker compose down
```

URLs en desarrollo:

- Backend: http://localhost:8000
- Docs interactivas (Swagger): http://localhost:8000/docs
- Frontend: http://localhost:5173

## 9. Estado de fases

Ver `docs/ROADMAP.md` para el detalle de fases futuras. **Fase 1** (esta
entrega) implementa únicamente: catálogo de cursos, detalle de curso, aula
virtual básica (sin LLM, sin TTS, sin generación de slides/preguntas/
exámenes) y la API REST de lectura de contenido. Cualquier trabajo futuro
debe respetar este documento y actualizar la sección correspondiente del
roadmap al avanzar de fase.
