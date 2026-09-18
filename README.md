# PwC AI Tutor

Aula virtual inteligente para cursos técnicos. El contenido de cada tópico
vive en archivos Markdown y es la única fuente de verdad: el tutor (cuando
se integre el LLM en una fase futura) nunca podrá inventar información que
no esté en ese contenido. Ver [`CLAUDE.md`](./CLAUDE.md) para el contrato
completo del proyecto y [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) /
[`docs/ROADMAP.md`](./docs/ROADMAP.md) para arquitectura y fases futuras.

> **Fase actual: Fase 2** — catálogo de cursos, detalle de curso, aula
> virtual básica, y un modelo canónico de contenido 100% determinístico
> (SourceBlocks + Grounding Packet) listo para una futura integración de
> LLM. Sin llamadas reales a LLM, TTS, generación de slides ni exámenes
> todavía.

## Requisitos

- **Docker Desktop** corriendo. No hace falta tener Python ni Node
  instalados en el host: todo corre encapsulado en contenedores.

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

# Inspeccionar el Grounding Packet determinístico de un tópico (Fase 2)
curl http://localhost:8000/api/courses/demo-curso-ia/modules/arquitecturas/topics/patrones-tecnicos/grounding

# Logs en vivo
docker compose logs -f backend
docker compose logs -f frontend
```

## Estructura del repositorio

```
pwc-tutor-agent/
    backend/            API REST (FastAPI + Pydantic)
        app/
        tests/
    frontend/           SPA (React + TypeScript + Vite)
        src/
    courses/             Curso de demo (filesystem de cursos)
        demo-curso-ia/
    docs/
        ARCHITECTURE.md
        ROADMAP.md
    docker-compose.yml
    .env.example
    CLAUDE.md
```
