# Configuración (variables de entorno)

Todas las variables viven en un único archivo `.env` en la raíz del repo
(copiado de [`.env.example`](../.env.example), nunca commiteado — ver
`.gitignore`). `docker compose` las lee automáticamente. Ninguna API key
llega nunca al navegador: toda llamada a un proveedor externo (LLM o TTS)
ocurre exclusivamente desde el backend.

No hay valores reales en este documento — solo nombres, tipos y defaults.

## Requeridas para que la app arranque

| Variable | Default | Descripción |
|---|---|---|
| `COURSES_HOST_PATH` | `./courses` | Ruta en el host montada de solo lectura en `/content`. Un subdirectorio de primer nivel = un curso. Ver [`COURSE_FORMAT.md`](./COURSE_FORMAT.md). |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Origen permitido por CORS en el backend. |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL que usa el frontend para llamar a la API. |

Sin ninguna otra variable configurada, la aplicación arranca y funciona
por completo para catálogo/cursos/tópicos. La IA y la voz neural son
opcionales (ver abajo).

## LLM (generación de clases, tutor, certificación) — opcional

| Variable | Default | Descripción |
|---|---|---|
| `LLM_PROVIDER` | `pwc` | `"pwc"` \| `"openai"`. Cualquier otro valor produce un error de configuración claro (nunca un fallback silencioso). Siempre configuración del backend — nunca se acepta desde un request HTTP. |
| `PWC_GENAI_BASE_URL` | `https://genai-sharedservice-americas.pwcinternal.com` | Base URL del PwC GenAI Shared Service. |
| `PWC_GENAI_API_KEY` | *(vacío)* | Credencial para `LLM_PROVIDER=pwc`. |
| `PWC_GENAI_MODEL` | `openai.gpt-4o-2024-11-20` | Modelo a usar vía PwC GenAI. |
| `GEN_AI_API_KEY` | *(vacío)* | Fallback de compatibilidad: se usa si `PWC_GENAI_API_KEY` no está definida. |
| `OPENAI_API_KEY` | *(vacío)* | Credencial para `LLM_PROVIDER=openai` (y opcionalmente para voz neural, ver abajo). |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo a usar vía OpenAI para generación de texto. |

Sin credencial configurada para el proveedor activo, `GET /api/ai/status`
devuelve `configured: false` y los endpoints que generan contenido con IA
devuelven `503` — nunca rompen el arranque de los containers.

## Voz — Web Speech API (siempre disponible) + TTS neural opcional

| Variable | Default | Descripción |
|---|---|---|
| `VOICE_PROVIDER` | `auto` | `"auto"` (neural si `OPENAI_API_KEY` está configurada, si no navegador) \| `"browser"` (fuerza siempre la Web Speech API del navegador) \| `"openai"` (intenta neural; si falla, ofrece volver a la voz del navegador sin romper la clase). |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | Modelo de síntesis de voz de OpenAI. |
| `OPENAI_TTS_VOICE` | `marin` | Voz de OpenAI TTS. |
| `OPENAI_TTS_INSTRUCTIONS` | *(vacío → default en español, ver `app/config.py`)* | Instrucciones de interpretación vocal (tono, ritmo). Nunca reescribe el texto pedagógico, solo controla cómo se lee. |

La voz del navegador (`window.speechSynthesis`) no requiere ninguna
variable y funciona siempre que el navegador la soporte.

## Cache (filesystem, sin base de datos)

| Variable | Default | Descripción |
|---|---|---|
| `LESSON_CACHE_DIR` | `/app/data/lesson-cache` | Cache de `LessonPlan` generadas. |
| `LESSON_PROMPT_VERSION` | `lesson-v3.3.1` | Forma parte de la cache key de lecciones; cambiarla invalida la cache existente por diseño. |
| `CERTIFICATION_PROMPT_VERSION` | `certification-v1` | Forma parte de la cache key de bancos de preguntas. |
| `CERTIFICATION_ITEMS_PER_TOPIC` | `6` | Cantidad objetivo de preguntas por tópico (1-10). También forma parte de la cache key. |
| `CERTIFICATION_CACHE_DIR` | `/app/data/certification-cache` | Cache de `QuestionBank` generados. |
| `CERTIFICATION_MAX_CONCURRENCY` | `2` | Máximo de `QuestionBank` generados en paralelo cuando faltan varios (1-4). `1` = estrictamente secuencial. Ver `docs/PERFORMANCE.md`. |
| `SPEECH_CACHE_DIR` | `/app/data/speech-cache` | Cache de audio TTS ya sintetizado. |

Todas las caches son descartables: se pueden borrar manualmente en
cualquier momento sin romper la aplicación (se regeneran en la próxima
solicitud). Ninguna se versiona en git (ver `.gitignore`; solo se
commitean `data/*/.gitkeep`).

`LESSON_CACHE_DIR`/`CERTIFICATION_CACHE_DIR`/`SPEECH_CACHE_DIR` (y
`CONTENT_DIR`, la ruta interna fija `/content` que NO aparece en
`.env.example`) están fijados en `docker-compose.yml` como rutas dentro
del container, alineadas con sus bind mounts (`./data:/app/data` y
`COURSES_HOST_PATH:/content`) — no se leen desde `.env`; ponerlos ahí es
solo informativo.

## Aplicación

| Variable | Default | Descripción |
|---|---|---|
| `APP_VERSION` | `1.6.0` | Versión mostrada en `GET /api/system/status` y en la pantalla de Configuración. Sin automatización de semver. |

## Performance (v1.1.0)

`CERTIFICATION_MAX_CONCURRENCY` es la única variable nueva de este bloque.
Ver `docs/PERFORMANCE.md` para el detalle completo de cache-first global,
generación en waves acotadas, determinismo y single-flight.

## Notas de seguridad

- `.env` nunca se commitea (`.gitignore`) y contiene secretos en texto
  plano: no lo compartas.
- Ninguna variable de credencial (`*_API_KEY`) se envía jamás al
  navegador, ni aparece en respuestas de la API, ni se loguea.
- `COURSES_HOST_PATH` en Windows: preferí barras `/` (ej.
  `C:/Users/tu-usuario/Documents/cursos`) para evitar problemas de
  escaping en el bind mount; `scripts/setup.ps1` normaliza esto
  automáticamente cuando lo usás.
