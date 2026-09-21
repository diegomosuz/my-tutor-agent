# PwC AI Tutor

Aula virtual inteligente para cursos técnicos. El contenido de cada tópico
vive en archivos Markdown y es la única fuente de verdad: el tutor nunca
puede inventar información que no esté en ese contenido. Ver
[`CLAUDE.md`](./CLAUDE.md) para el contrato completo del proyecto y
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) /
[`docs/ROADMAP.md`](./docs/ROADMAP.md) para arquitectura y fases futuras.

> **v1.4.0** publicado (`master`/`origin/master`, tag `v1.4.0`). **v1.5.0**
> está preparado como release candidate local (`release/v1.5.0-rc`, sin
> push/tag/merge todavía — release gate pendiente, decisión separada).
> v1.5.0 agrega **Guided Markdown Read Aloud**: el alumno puede escuchar
> el Markdown del tópico (no la clase generada por IA) leído en voz alta,
> con resaltado progresivo de la frase activa y control de velocidad,
> reutilizando la misma arquitectura de voz ya existente (TTS neural
> OpenAI / Web Speech API del navegador) — sin modelo nuevo, sin forced
> alignment, sin speech-to-text. La voz de la IA (narración de clase,
> tutor, checkpoint, certificación) siempre tiene prioridad absoluta:
> arranca de inmediato en cuanto empieza a sintetizar/hablar, y el Reader
> permanece deshabilitado durante toda esa sesión, nunca solo el instante
> inicial. Ver
> [`docs/RELEASE_NOTES_v1.5.0.md`](./docs/RELEASE_NOTES_v1.5.0.md) y
> [`docs/GUIDED_READ_ALOUD_V1_5.md`](./docs/GUIDED_READ_ALOUD_V1_5.md)
> (y, para el historial previo,
> [`docs/RELEASE_NOTES_v1.4.0.md`](./docs/RELEASE_NOTES_v1.4.0.md) /
> [`docs/RELEASE_NOTES_v1.3.0.md`](./docs/RELEASE_NOTES_v1.3.0.md) /
> [`docs/RELEASE_NOTES_v1.2.0.md`](./docs/RELEASE_NOTES_v1.2.0.md) /
> [`docs/RELEASE_NOTES_v1.1.1.md`](./docs/RELEASE_NOTES_v1.1.1.md) /
> [`docs/RELEASE_NOTES_v1.1.0.md`](./docs/RELEASE_NOTES_v1.1.0.md) /
> [`docs/RELEASE_NOTES_v1.0.1.md`](./docs/RELEASE_NOTES_v1.0.1.md) /
> [`docs/RELEASE_NOTES_v1.0.0.md`](./docs/RELEASE_NOTES_v1.0.0.md) /
> [`docs/PRODUCT_AUDIT.md`](./docs/PRODUCT_AUDIT.md)).

## Requisitos

- **Docker Desktop** corriendo. No hace falta tener Python ni Node
  instalados en el host: todo corre encapsulado en contenedores.
- (Opcional) una credencial de PwC GenAI Shared Service u OpenAI para que
  la generación de clases con IA funcione de verdad. **Sin ninguna
  credencial, el resto de la aplicación (catálogo, cursos, tópicos)
  funciona igual**; la generación de clases devuelve un `503` claro.
- (Opcional) una credencial de OpenAI para voz neural (`VOICE_PROVIDER`).
  Sin ella, la aplicación sigue funcionando con la voz nativa del
  navegador (Web Speech API).

## Quick Start — Windows

1. Instalá y abrí **Docker Desktop** (tiene que estar corriendo). No hace
   falta tener Python ni Node instalados en tu PC: todo corre encapsulado
   en contenedores.
2. Cloná o abrí esta carpeta del repositorio en tu PC.
3. Ejecutá el script de setup interactivo desde PowerShell, en la raíz del
   repo:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
   ```

   El script verifica Docker, crea tu `.env` (nunca sobrescribe uno
   existente sin confirmación explícita), te pregunta el directorio de
   cursos a usar (o el curso de demo incluido por default), te deja elegir
   proveedor de IA de forma opcional (la credencial se ingresa sin eco en
   pantalla y nunca se imprime), y levanta todo con `docker compose`.
4. Abrí **http://localhost:5173** en el navegador.

Para las próximas veces, usá `scripts/start.ps1` (levanta lo ya
configurado) y `scripts/stop.ps1` (baja el entorno sin tocar `.env` ni las
caches). Si algo no funciona, corré `scripts/doctor.ps1` para un
diagnóstico rápido (Docker, containers, backend, `/content`, cursos
detectados, estado de IA/voz sin exponer credenciales).

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\stop.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
```

> Estos scripts son opcionales: en cualquier plataforma (incluido Windows)
> podés usar directamente `docker compose up -d --build` / `docker compose
> down` como se muestra más abajo. `scripts/*.ps1` sólo automatizan esos
> mismos pasos y agregan validaciones para Windows.

## Cómo levantar el proyecto (sin los scripts de Windows)

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

# Tests del frontend (Vitest + React Testing Library)
docker compose run --rm frontend npm test -- --run

# Inspeccionar el Grounding Packet determinístico de un tópico (Fase 2)
curl http://localhost:8000/api/courses/demo-curso-ia/modules/arquitecturas/topics/patrones-tecnicos/grounding

# Estado del proveedor LLM configurado (nunca expone la credencial)
curl http://localhost:8000/api/ai/status

# Generar (o recuperar de cache) la clase de un tópico con IA
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/modules/fundamentos/topics/introduccion/lesson

# Preparar una práctica de certificación grounded (Fase 6)
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/certification/prepare \
  -H "Content-Type: application/json" \
  -d '{"mode":"practice","scope":{"module_ids":[],"topic_ids":["introduccion"]},"question_count":5}'

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

## Tutor conversacional grounded + checkpoints (Fase 5)

El panel "Pregunta al asistente IA" del aula ahora conversa de verdad:

```
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/modules/fundamentos/topics/introduccion/tutor \
  -H "Content-Type: application/json" \
  -d '{"message":"¿Qué es la IA?","scene_id":null,"recent_history":[]}'
```

- La única fuente de verdad sigue siendo el Grounding Packet del tópico
  (Fase 2): el historial de conversación y el contexto de la escena activa
  ayudan a interpretar la pregunta, pero **nunca** son tratados como
  autoritativos. Si la pregunta no está cubierta por el material, la
  respuesta es `not_covered` con un mensaje fijo — el modelo nunca redacta
  esa respuesta.
- Preguntar algo pausa la clase automáticamente (nunca sigue avanzando de
  fondo); "Continuar clase" retoma exactamente en la misma escena.
- Si `scene.interaction` de tipo `comprehension_check` está presente en la
  `LessonPlan`, aparece un panel de "Comprobación de comprensión": la
  respuesta del alumno se evalúa contra el material autorizado, **nunca**
  contra la `expected_answer` que el LLM generó junto con la clase (si esa
  respuesta esperada contradice el material, el material gana siempre).
  Sin puntaje ni gamificación — solo `verdict` + feedback grounded.
- Reconocimiento de voz opcional para dictar la pregunta (botón de
  micrófono, deshabilitado con un tooltip si el navegador no lo soporta) —
  usa la Web Speech API nativa, sin ninguna librería nueva.
- La conversación vive en memoria durante la sesión del navegador; no se
  persiste en el backend ni en `localStorage`.

## Práctica de certificación grounded (Fase 6)

**Esto NO representa ni afirma reproducir un examen oficial de ninguna
certificación externa.** Es práctica orientada a certificación basada
exclusivamente en el material del curso.

Desde el detalle de un curso, "Preparación de certificación →" lleva a una
pantalla dedicada para elegir alcance (curso completo / módulos / tópicos
específicos), modo (Práctica guiada o Simulacro) y cantidad de preguntas.

```
curl -X POST http://localhost:8000/api/courses/demo-curso-ia/certification/prepare \
  -H "Content-Type: application/json" \
  -d '{"mode":"practice","scope":{"module_ids":[],"topic_ids":["introduccion"]},"question_count":5}'
```

- Las preguntas (opción única/múltiple) se generan **por tópico** —nunca
  concatenando todo el curso en un solo prompt— y se cachean en
  filesystem (`data/certification-cache/`, gitignored), igual patrón que
  las `LessonPlan`. Los distractores se construyen exclusivamente con
  conceptos presentes en el material; nunca se introduce una tecnología,
  producto o cifra externa como opción incorrecta.
- El ensamblaje del examen y la corrección de las respuestas son **100%
  determinísticos, sin LLM**: round-robin entre tópicos para armar el
  examen, comparación de conjuntos para corregir. Antes de responder, el
  frontend nunca recibe `correct_option_ids` ni la explicación — solo
  después de evaluar.
- **Práctica guiada**: feedback grounded inmediato después de cada
  pregunta. **Simulacro**: sin feedback hasta entregar, con navegación
  libre entre preguntas.
- El resultado final se llama siempre "Resultado de práctica" (nunca
  "aprobado"/"resultado oficial"): desglose por tópico y por competencia,
  y una lista de tópicos a reforzar con un link directo a la clase normal
  de ese tópico.
- La sesión de la práctica vive en `sessionStorage` del navegador (nunca
  `localStorage`); un resumen seguro de cada intento terminado (nunca el
  answer key) se guarda en el historial de "Mi aprendizaje", ver abajo.

## Mi aprendizaje (v1.1.0)

Vista consolidada y **local-first** del progreso del alumno
(`/mi-aprendizaje`): progreso general y por módulo, "Continuar
aprendiendo" (regla determinística, sin LLM), historial de prácticas y
simulacros de certificación, evolución de resultados y áreas a reforzar.
Todo vive en una única key de `localStorage`
(`pwc-tutor:learning-progress:v1`, documento versionado con migración
idempotente desde progreso previo). Sin base de datos, sin backend
persistence, sin usuarios/auth. Reset de progreso por curso disponible en
Configuración, con confirmación explícita. Ver
[`docs/LEARNING_PROGRESS.md`](./docs/LEARNING_PROGRESS.md) para el
contrato completo de qué se persiste y qué nunca se persiste.

## Assets de curso (imágenes) y diagnóstico (Fase 7)

Un tópico puede referenciar imágenes relativas dentro de su mismo curso
(`![Arquitectura](images/architecture.png)`). Se sirven mediante un
endpoint contextual y de solo lectura que nunca acepta una ruta de
filesystem arbitraria — siempre resuelve curso/módulo/tópico a través del
repositorio seguro existente antes de buscar el archivo (path traversal
imposible por diseño). Formatos soportados: `.png .jpg .jpeg .webp .gif`
(no se sirven `.svg`, `.html`, `.js` ni ningún tipo ejecutable). Ver
[`docs/COURSE_FORMAT.md`](./docs/COURSE_FORMAT.md).

```bash
# Diagnóstico de solo lectura del filesystem de cursos (nunca modifica nada)
curl http://localhost:8000/api/system/course-diagnostics

# Estado general de la aplicación, sin exponer secretos
curl http://localhost:8000/api/system/status
```

La pantalla **Configuración** (`/configuracion` en el frontend) muestra
este estado de forma legible: cursos detectados y su diagnóstico, proveedor
de IA configurado, proveedor de voz configurado, estado del backend — nunca
credenciales, headers, prompts ni el Grounding Packet.

## Voz neural opcional (OpenAI TTS, Fase 7)

Además de la voz del navegador (Web Speech API, sin credenciales), se
puede activar voz neural con el SDK de OpenAI ya usado para el LLM:

```
VOICE_PROVIDER=auto       # auto (neural si está configurada, si no navegador) | browser | openai
OPENAI_API_KEY=...
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=marin
```

Sin `OPENAI_API_KEY`, `VOICE_PROVIDER=auto`/`browser` siguen funcionando
con la voz del navegador; `VOICE_PROVIDER=openai` sin credencial ofrece
volver a la voz del navegador ante cualquier error, sin romper la clase.
El audio nunca se genera reescribiendo el texto: siempre es exactamente la
narración/respuesta ya validada por el grounding. Se cachea en
`data/speech-cache/` (gitignored) por contenido+voz+modelo+velocidad.

## Arquitectura

`browser → React → HTTP REST → FastAPI → filesystem de cursos +
proveedores LLM`. Ver [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
para el detalle completo (componentes, flujos por fase, decisiones de
diseño) y [`docs/PRODUCT_AUDIT.md`](./docs/PRODUCT_AUDIT.md) para el
estado real de cada subsistema.

## Troubleshooting

- **Docker Desktop no responde / "docker compose" falla**: corré
  `scripts/doctor.ps1` primero — valida Docker, containers, backend,
  `/content`, cursos detectados y estado de IA/voz en un solo paso.
- **El backend no queda "healthy"**: `docker compose logs -f backend`;
  revisá que `COURSES_HOST_PATH` en tu `.env` apunte a un directorio que
  realmente exista.
- **Puertos 8000/5173 ocupados**: cerrá el proceso que los esté usando o
  bajá otro stack de Docker que los tenga tomados (`docker compose down`
  en ese otro proyecto).
- **`.env` fue sobrescrito por error**: no hay problema — es gitignored y
  siempre se puede recrear copiando `.env.example`.
- **La generación de clases/certificación da `503`**: significa que el
  proveedor LLM configurado no tiene credencial disponible; ver
  [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md).

## Desarrollo

```bash
docker compose run --rm backend pytest        # tests backend
docker compose run --rm frontend npm test -- --run   # tests frontend
docker compose run --rm frontend npx tsc --noEmit    # typecheck
docker compose run --rm frontend npm run build       # build de producción
```

Convenciones de código, contratos de API y decisiones de diseño en
[`CLAUDE.md`](./CLAUDE.md) (contrato completo del proyecto) y
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Seguridad

Resumen: las credenciales nunca salen del backend ni se loguean; `/content`
se monta read-only y toda ruta de filesystem se resuelve por enumeración
segura (nunca concatenando input del cliente); los assets de curso usan
una allow-list de extensiones y excluyen symlinks que intenten escapar del
árbol autorizado; el frontend nunca ejecuta salida del LLM; la respuesta
de certificación nunca incluye el answer key antes de responder. Detalle
completo en la sección "Modelo de seguridad local" de
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Estructura del repositorio

```
pwc-tutor-agent/
    backend/            API REST (FastAPI + Pydantic)
        app/
        tests/
    frontend/           SPA (React + TypeScript + Vite)
        src/
            classroom/      Classroom Engine, SceneRenderer, visuals, voz
                            (navegador + neural), tutor conversacional,
                            checkpoints
            certification/  Práctica de certificación grounded (Fase 6)
            learning/       Learning Progress / "Mi aprendizaje" (v1.1.0)
    courses/             Curso de demo (filesystem de cursos)
        demo-curso-ia/
    data/
        lesson-cache/          Cache de LessonPlan (gitignored)
        certification-cache/   Cache de QuestionBank (gitignored)
        speech-cache/           Cache de audio TTS (gitignored)
    docs/
        ARCHITECTURE.md
        ROADMAP.md
        COURSE_FORMAT.md
        CONFIGURATION.md
    scripts/
        setup.ps1   start.ps1   stop.ps1   doctor.ps1
    docker-compose.yml
    .env.example
    CLAUDE.md
```
