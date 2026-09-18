# Roadmap — PwC AI Tutor

Este documento describe las fases futuras del proyecto. **Ninguna de las
fases listadas debajo de la Fase 3 está implementada todavía.** Se incluyen
acá únicamente como referencia de dirección del producto, para que
decisiones de diseño de fases tempranas (contratos de API, modelo canónico,
interfaz `LLMProvider`, contratos de `LessonPlan`, etc.) no las bloqueen
innecesariamente.

## ✅ Fase 1 — Base funcional

- App shell + header + navegación.
- Catálogo de cursos.
- Detalle de curso (módulos y tópicos).
- Aula virtual básica: layout final (slide 16:9 + contenido Markdown +
  panel de asistente + barra de controles), sin LLM ni TTS todavía.
- API REST de solo lectura sobre el filesystem de cursos, con protección
  contra path traversal.
- Configuración preparada (no implementada) para proveedores LLM y de voz.
- Tests de backend y build de frontend verificados.

## ✅ Fase 2 — Modelo canónico de contenido + grounding determinístico

- Parser canónico 100% determinístico (`app/services/canonical.py`, basado
  en `markdown-it-py`) que segmenta el Markdown de cada tópico en
  `SourceBlock` (heading, paragraph, list, code, table, blockquote, image,
  horizontal_rule, other — incluye headings Setext), con referencias
  estables `SRC-001`, `SRC-002`, ..., línea de origen y jerarquía de
  headings (`heading_path`).
- `CanonicalTopicContent` con `content_sha256` (detecta cambios de
  contenido sin usar timestamps).
- `build_grounding_packet(...)`: genera el texto determinístico que desde
  Fase 3 es el único contexto entregado a un LLM.
- `validate_source_refs` / `assert_valid_source_refs`: utilidades para
  detectar referencias `SRC-XXX` inválidas (reutilizadas en Fase 3 para
  validar la `LessonPlan` generada).
- API: `GET .../topics/{topic_id}` extendido de forma backward-compatible
  con `canonical: { content_sha256, source_block_count, source_blocks }`;
  endpoint de inspección/desarrollo `GET .../topics/{topic_id}/grounding`.
- Frontend: panel colapsable "Información de grounding" en el aula virtual,
  visible solo en modo desarrollo (`import.meta.env.DEV`).
- Sigue sin existir ninguna llamada real a un LLM.

## ✅ Fase 3 — Integración real con LLM + LessonPlan grounded + cache

- `PwCGenAIProvider` (HTTP real vía `httpx` a
  `{PWC_GENAI_BASE_URL}/chat/completions`) y `OpenAIProvider` (SDK oficial
  `openai`, Structured Outputs) implementados sobre una interfaz común
  `LLMProvider.generate_structured(messages, response_model)`.
  `get_llm_provider(settings)` selecciona el provider por configuración
  (`LLM_PROVIDER`), nunca desde un request HTTP.
- Modelos `GroundedText`, `VisualPlan` (declarativo, enum cerrado de
  `visual_type` — estructuralmente imposible que el LLM produzca
  HTML/JS/SVG ejecutable), `InteractionPlan` (sin scoring/certificación
  todavía), `LessonScene`, `GeneratedLessonBody` (lo único que produce el
  LLM) y `LessonPlan` (ensamblada por el backend: ids, `content_sha256`,
  provider, model, `cached`).
- `validate_lesson_body` (`app/services/lesson_validation.py`): valida
  grounding estructural de TODAS las `GroundedText` de la lección
  (reutilizando `validate_source_refs` de Fase 2) e invariantes de
  secuencia de `scene_id`.
- Prompt versionado (`app/prompts/lesson.py`, `LESSON_PROMPT_VERSION`):
  system prompt explícito sobre grounding, prohibición de inventar, y
  tratamiento del contenido de `AUTHORIZED SOURCE` como datos (nunca
  instrucciones) ante intentos de prompt injection.
- Reintentos acotados (`MAX_GENERATION_ATTEMPTS = 3`) ante JSON/contrato/
  grounding inválido; sin reintento ante errores de auth/configuración.
- Cache local en filesystem (`data/lesson-cache/`, sin base de datos), key
  = `content_sha256 + provider + model + prompt_version`.
- API: `GET /api/ai/status` (no sensible) y
  `POST .../topics/{topic_id}/lesson` (`404`/`503`/`502`/`422` según el
  caso, nunca filtra secretos).
- Frontend: estado del agente IA junto al panel de asistente, botón
  "Preparar clase con IA" (bajo demanda, nunca automático), navegación
  real de escenas con Previo/Siguiente, indicador "Escena X de Y",
  narración en panel auxiliar, y extensión del panel de grounding para
  inspeccionar las `source_refs` de la escena activa (solo desarrollo).
- Validado con un smoke test real contra un proveedor configurado.
- Sin TTS, sin reconocimiento de voz, sin simulador de certificación, sin
  RAG/embeddings/vector DB, sin agentes autónomos.

## Fase 4 — Asistente conversacional grounded (Q&A) y reorganización/resúmenes

- Endpoint de preguntas y respuestas sobre un tópico (el panel "Pregunta al
  asistente IA" del aula virtual, hoy todavía placeholder), usando el mismo
  patrón de Fase 3: Grounding Packet como único contexto, respuesta con
  `source_refs` validadas, manejo explícito del caso "no cubierto por el
  material disponible".
- Generación de resúmenes y explicaciones alternativas del contenido de un
  tópico (o de un módulo completo), siempre grounded en los `SourceBlock`
  del tópico (con referencias `SRC-XXX` verificables) y cacheados con el
  mismo mecanismo de Fase 3 (filesystem, cache key por contenido/provider/
  modelo/prompt_version).

## Fase 5 — Slides y narración

- Generación de slides dinámicas a partir del `VisualPlan` declarativo ya
  generado en Fase 3, para ocupar el panel 16:9 (hoy muestra título/
  key_points de la escena como texto; sin renderer visual todavío).
- Integración de texto-a-voz (`VOICE_PROVIDER`): primero `browser` (Web
  Speech API, sin backend) sobre los chunks de `narration` ya generados en
  Fase 3, luego eventualmente `openai` u otro proveedor server-side.
- Controles de la barra (Pausa, Repetir, Activar voz) pasan de placeholder
  a funcionales, sincronizados con la narración/slide activa.

## Fase 6 — Diagramas a partir de relaciones existentes

- Detectar relaciones ya presentes explícitamente en el Markdown (listas,
  jerarquías, tablas — ya identificables como `SourceBlock` desde Fase 2, y
  ya señaladas declarativamente por `VisualPlan` desde Fase 3) y
  convertirlas en diagramas reales.
- Sin inferencia de relaciones no presentes en el texto (misma regla de
  grounding).

## Fase 7 — Checkpoints y preguntas estilo examen de certificación

- El `InteractionPlan` de Fase 3 (`comprehension_check` / `reflection`, sin
  scoring) se extiende con dificultad, banco de preguntas y scoring real.
- Generación de preguntas estilo examen de certificación, derivadas
  exclusivamente del contenido cubierto por el curso.
- Persistencia de resultados: evaluar si alcanza con `localStorage` o si en
  esta fase se justifica introducir almacenamiento server-side (a decidir
  cuando se llegue a esta fase, no antes).

## Fase 8 — "Mi aprendizaje" y progreso del alumno

- Progreso de avance por curso/módulo/tópico (incluyendo qué escenas de
  cada `LessonPlan` ya se recorrieron), guardado en `localStorage`.
- Pantalla "Mi aprendizaje" (hoy placeholder) con historial real.

## Principios que se mantienen en todas las fases futuras

- El Markdown de cada tópico (segmentado en `SourceBlock` desde Fase 2)
  sigue siendo la única fuente de verdad; nada de lo generado por el LLM
  puede introducir conocimiento externo al contenido autorizado, y toda
  afirmación pedagógica generada debe ser trazable a una o más referencias
  `SRC-XXX` válidas (trazabilidad estructural, ver
  `docs/ARCHITECTURE.md` sección 3.1 para el límite exacto de esa
  garantía).
- El LLM nunca produce HTML/JS/SVG/código ejecutable como parte de una
  visual; siempre una especificación declarativa (ver `VisualPlan`, Fase 3).
- Ninguna fase introduce Kubernetes, bases de datos relacionales/NoSQL,
  colas de mensajes, frameworks de orquestación de agentes, RAG,
  embeddings ni bases de datos vectoriales, salvo que una necesidad
  concreta y validada lo justifique explícitamente en el momento de esa
  fase.
- Las API keys de los proveedores LLM/voz nunca se exponen al navegador.
- Toda generación de contenido con LLM se cachea en filesystem con una
  cache key que incluya, como mínimo, el contenido fuente y el
  `prompt_version` de esa funcionalidad (mismo patrón de Fase 3).
