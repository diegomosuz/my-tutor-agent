# PwC AI Tutor

Aula virtual inteligente para cursos técnicos. El contenido de cada tópico
vive en archivos Markdown y es la única fuente de verdad: el tutor nunca
puede inventar información que no esté en ese contenido. Ver
[`CLAUDE.md`](./CLAUDE.md) para el contrato completo del proyecto y
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) /
[`docs/ROADMAP.md`](./docs/ROADMAP.md) para arquitectura y fases futuras.

> **Fase actual: Fase 4** — catálogo de cursos, detalle de curso, modelo
> canónico de contenido 100% determinístico, integración real con un LLM
> para generar clases estructuradas (`LessonPlan`) grounded, y ahora un
> **aula virtual interactiva de verdad**: Classroom Engine + 11 tipos de
> slide (hero, bullets, proceso, comparación, jerarquía, arquitectura,
> mapa conceptual, tabla, código, cita, sin visual), animaciones CSS con
> pausa real, progreso local, y una primera voz funcional con la Web
> Speech API del navegador. Sin TTS server-side, sin chat bidireccional,
> sin simulador de certificación todavía.

## Requisitos

- **Docker Desktop** corriendo. No hace falta tener Python ni Node
  instalados en el host: todo corre encapsulado en contenedores.
- (Opcional) una credencial de PwC GenAI Shared Service u OpenAI para que
  la generación de clases con IA funcione de verdad. **Sin ninguna
  credencial, el resto de la aplicación (catálogo, cursos, tópicos)
  funciona igual**; la generación de clases devuelve un `503` claro.

## Cómo levantar el proyecto

```bash
# 1. (Opcional) copiar el archivo de variables de entorno de ejemplo
cp .env.example .env

# 2. Levantar backend + frontend
docker compose up -d --build

# 3. Abrir en el navegador
#    Frontend:        http://localhost:5173
#    Backend (API):   http://localhost:8000
#    Docs (Swagger):  http://localhost:8000/docs
```

Para bajar el entorno:

```bash
docker compose down
```

## Cursos y contenido

Por defecto, la aplicación lee el curso de demo incluido en
[`courses/demo-curso-ia`](./courses/demo-curso-ia). Para usar un directorio
de cursos propio (por ejemplo, en otra carpeta de tu máquina Windows),
definí `COURSES_HOST_PATH` en tu `.env`:

```
COURSES_HOST_PATH=C:\Users\tu-usuario\Documents\mis-cursos
```

Cada subdirectorio de primer nivel dentro de ese path es un **curso**; cada
subdirectorio dentro de un curso es un **módulo**; cada archivo `.md`
dentro de un módulo es un **tópico**. Ver la sección 5 de
[`CLAUDE.md`](./CLAUDE.md) para el detalle completo de las reglas de
interpretación (prefijos numéricos, frontmatter opcional, etc).

## Comandos útiles

```bash
# Tests del backend
docker compose run --rm backend pytest

# Build de producción del frontend (type-check + bundle)
docker compose run --rm frontend npm run build

# Tests del frontend (Vitest + React Testing Library, 30 tests)
docker compose run --rm frontend npm test -- --run

# Inspeccionar el Grounding Packet determinístico de un tópico (Fase 2)
curl http://localhost:8000/api/courses/demo-curso-ia/modules/arquitecturas/topics/patrones-tecnicos/grounding

# Estado del proveedor LLM configurado (nunca expone la credencial)
curl http://localhost:8000/api/ai/status

# Generar (o recuperar de cache) la clase de un tópico con IA
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/modules/fundamentos/topics/introduccion/lesson

# Logs en vivo
docker compose logs -f backend
docker compose logs -f frontend
```

## Generación de clases con IA (Fase 3)

Para que `POST .../lesson` funcione de verdad, definí en tu `.env`
(nunca lo commitees):

```
LLM_PROVIDER=pwc            # o "openai"
PWC_GENAI_API_KEY=...       # si LLM_PROVIDER=pwc
# o
OPENAI_API_KEY=...          # si LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini    # o el modelo que corresponda
```

Sin ninguna credencial configurada, `GET /api/ai/status` devuelve
`configured: false` y `POST .../lesson` devuelve `503` — el resto de la
aplicación sigue funcionando con normalidad. Las lecciones generadas se
cachean en `data/lesson-cache/` (filesystem, gitignored); una segunda
solicitud para el mismo tópico/provider/modelo devuelve `cached: true` sin
volver a llamar al LLM.

## Aula virtual interactiva (Fase 4)

Una vez generada una `LessonPlan`, el aula la recorre escena por escena con
un motor propio (`frontend/src/classroom/useClassroomEngine.ts`, sin
Redux/Zustand/XState) y un renderer visual (`SceneRenderer` + 11
componentes en `frontend/src/classroom/visuals/`) que **nunca** interpreta
código generado por el LLM (nada de `dangerouslySetInnerHTML`, `eval` ni
`new Function`): cada slide es un componente React escrito a mano, cuyo
contenido sale de `scene.title`/`scene.key_points` y, cuando corresponde,
del `SourceBlock` citado (tabla, código o cita reales del Markdown).

- Controles reales: Previo / Siguiente (se convierte en "Finalizar" en la
  última escena) / Pausa-Reanudar / Repetir / Activar voz / Salir.
- Voz: primera implementación funcional con la Web Speech API del
  navegador (`window.speechSynthesis`, sin backend ni credencial nueva),
  con selección de voz en español y velocidad configurable.
- Progreso local por tópico en `localStorage` (se invalida solo si cambia
  el contenido del tópico).
- Columna derecha con pestañas Explicación (Markdown completo) / Puntos
  clave / Recursos (enlaces literalmente presentes en el Markdown).

## Estructura del repositorio

```
pwc-tutor-agent/
    backend/            API REST (FastAPI + Pydantic)
        app/
        tests/
    frontend/           SPA (React + TypeScript + Vite)
        src/
            classroom/      Classroom Engine, SceneRenderer, visuals, voz
    courses/             Curso de demo (filesystem de cursos)
        demo-curso-ia/
    docs/
        ARCHITECTURE.md
        ROADMAP.md
    docker-compose.yml
    .env.example
    CLAUDE.md
```
