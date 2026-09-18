# Roadmap — PwC AI Tutor

Este documento describe las fases futuras del proyecto. **Ninguna de las
fases listadas debajo de la Fase 5 está implementada todavía.** Se incluyen
acá únicamente como referencia de dirección del producto, para que
decisiones de diseño de fases tempranas (contratos de API, modelo canónico,
interfaz `LLMProvider`, contratos de `LessonPlan`, Classroom Engine, etc.)
no las bloqueen innecesariamente.

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

## ✅ Fase 4 — Classroom Engine + Scene Renderer + voz básica

- Classroom Engine (`useClassroomEngine`): navegación determinística de
  escenas, progreso local (`localStorage`, invalidado si cambia
  `content_sha256`), estado de reproducción (play/pause/completado),
  estado de narración — sin librería de state machine.
- `SceneRenderer` + 11 componentes visuales propios (hero, bullets,
  process, comparison, hierarchy, architecture, concept_map, table, code,
  quote, none), despachados por `visual_type` vía tabla de componentes.
  Ninguno usa `dangerouslySetInnerHTML`/`eval`/`new Function`; el LLM
  nunca produce código ejecutable para una slide.
- Fuente de cada visual: `scene.title`/`scene.key_points` siempre, y el
  `SourceBlock` citado (tabla/código/cita) cuando corresponde — nunca
  `visual.description` como texto visible, y ninguna relación/conexión
  inventada por el renderer (`ProcessVisual`/`HierarchyVisual`/
  `ArchitectureVisual`/`ConceptMapVisual`/`ComparisonVisual`).
- Animaciones CSS (sin Framer Motion): entrada de slide, aparición
  progresiva de conceptos, con pausa real (`animation-play-state`) y
  soporte de `prefers-reduced-motion`.
- Primera versión funcional de "Activar Voz" con Web Speech API del
  navegador (`window.speechSynthesis`): selección de voz en español,
  lectura secuencial de `narration`, sin autoplay, sin modificar
  tecnicismos, con velocidad configurable (0.85x–1.3x) persistida.
- Controles Previo/Siguiente/Pausa/Repetir/Voz/Salir reales; pantalla de
  finalización con el `recap` de la `LessonPlan`.
- Columna derecha con pestañas Explicación (Markdown completo, sin
  cambios) / Puntos clave / Recursos (solo enlaces literalmente presentes
  en el Markdown, nunca inventados).
- Tests: Vitest + React Testing Library (30 tests) — engine, storage,
  selección de renderer por `visual_type`, no exposición de `source_refs`
  al alumno, `prefers-reduced-motion`, `speechSynthesis` mockeado.
- Sin TTS server-side (OpenAI), sin chat bidireccional, sin simulador de
  certificación.

## ✅ Fase 5 — Tutor bidireccional grounded + interrupción/reanudación + checkpoints

- `TutorService` (`app/services/tutor_service.py`): endpoint de preguntas y
  respuestas sobre un tópico (el panel "Pregunta al asistente IA" del aula
  virtual, antes placeholder), reutilizando la interfaz `LLMProvider` de
  Fase 3. El Grounding Packet del tópico sigue siendo la ÚNICA fuente de
  verdad; el historial de conversación reciente y el "contexto de clase
  generado" (título/`source_refs` de la escena activa, nunca la narración
  ni la `LessonPlan` completa) se envían siempre marcados explícitamente
  como NO autoritativos, solo para resolver referencias deícticas ("esto",
  "eso").
- `TutorReplyBody`: `response_type` (`answer` / `not_covered` /
  `clarification`) con forma estructuralmente distinta por tipo — el caso
  "no cubierto" nunca tiene un campo de texto libre que el modelo pueda
  usar para inventar una explicación alternativa.
- `POST .../topics/{topic_id}/tutor`: acepta únicamente `message`,
  `scene_id` y `recent_history` (máx. 10 mensajes, roles `user`/
  `assistant`); nunca acepta paths de filesystem, Grounding Packet,
  prompt, API key, provider o modelo desde el request.
- `CheckpointService` (`app/services/checkpoint_service.py`): hace
  funcional `scene.interaction` (`comprehension_check`/`reflection`,
  definido en Fase 3). Evalúa la respuesta del alumno contra el
  `AUTHORIZED SOURCE`, nunca contra `expected_answer` (ese campo, generado
  por el LLM en Fase 3 junto con la `LessonPlan`, se pasa al prompt
  exclusivamente como contexto no autoritativo — si contradice la fuente,
  la fuente gana siempre). `CheckpointEvaluationBody`: `verdict` (4
  valores, sin puntaje/porcentaje/gamificación), `feedback` grounded,
  `ideal_answer` opcional grounded (nunca el `expected_answer` original).
- `POST .../topics/{topic_id}/checkpoint`: valida existencia de tópico →
  `LessonPlan` cacheada → escena → tipo `comprehension_check`, en ese
  orden, ANTES de exigir credencial LLM configurada (mismo patrón que la
  Fase 3 usa para tópico-no-encontrado).
- Reintentos acotados reutilizando el mismo patrón de Fase 3
  (`app/services/llm_retry.py`, extraído para no tocar el loop ya probado
  de `LessonGenerator`).
- Frontend: `TutorPanel` + `TutorConversation` + `useTutor` (conversación en
  memoria React durante la sesión, nunca persistida — se resetea al
  cambiar de tópico); interrupción/reanudación de la clase por composición
  externa sobre `useClassroomEngine.pause()/resume()` (sin tocar el motor);
  reutilización de `speechSynthesis` para leer la respuesta del tutor
  (nunca superpuesta con la narración de la clase); reconocimiento de voz
  opcional vía `window.SpeechRecognition`/`webkitSpeechRecognition`
  (`speechRecognition.ts`, sin paquetes nuevos, deshabilitado con tooltip
  claro si el navegador no lo soporta); `CheckpointPanel` (pregunta,
  respuesta, verdict, feedback grounded, `ideal_answer` — nunca bloquea
  "Siguiente"). `source_refs` del tutor solo visibles en modo desarrollo.
- Sin caché de respuestas del tutor/checkpoint (cada pregunta depende del
  contexto conversacional); sin persistencia de conversaciones ni
  respuestas de checkpoint en el backend.
- Ver `docs/ARCHITECTURE.md` sección "Fase 5" para los diagramas de flujo
  completos y el detalle de qué garantiza (y qué no) esta fase.
- **Nota / deuda técnica**: la generación de resúmenes y explicaciones
  alternativas de un tópico completo (mencionada originalmente para esta
  fase) NO se implementó — quedó fuera de alcance del pedido real de Fase
  5. Sigue pendiente para una fase futura. Además, el prompt de
  `LessonGenerator` (Fase 3) nunca instruye explícitamente a incluir un
  `scene.interaction`, por lo que en la práctica muy pocas lecciones
  generadas contienen un `comprehension_check` real — el `CheckpointPanel`
  está completo y probado, pero rara vez aparece en contenido generado
  hoy; ver `docs/ARCHITECTURE.md`.

## Fase 6 — TTS avanzado, diagramas enriquecidos y animaciones complejas

- Integración de un proveedor TTS server-side (`VOICE_PROVIDER=openai` u
  otro) como alternativa a la Web Speech API del navegador (Fase 4) cuando
  se necesite mejor calidad/control de voz; la Web Speech API se mantiene
  como fallback sin credencial.
- Diagramas más ricos para `process`/`hierarchy`/`architecture`/
  `concept_map` (ej. layouts tipo Mermaid) cuando el `VisualPlan` y los
  `SourceBlock` citados establezcan relaciones explícitas suficientes —
  sin relajar la regla de "cero relaciones inventadas" de Fase 4.
- Animaciones de mayor producción (transiciones más elaboradas entre
  escenas) evaluando si CSS sigue alcanzando o se justifica Framer Motion.

## Fase 7 — Checkpoints y preguntas estilo examen de certificación

- El `InteractionPlan` de Fase 3 (`comprehension_check` / `reflection`, sin
  scoring) se extiende con dificultad, banco de preguntas y scoring real.
- Generación de preguntas estilo examen de certificación, derivadas
  exclusivamente del contenido cubierto por el curso.
- Persistencia de resultados: evaluar si alcanza con `localStorage` o si en
  esta fase se justifica introducir almacenamiento server-side (a decidir
  cuando se llegue a esta fase, no antes).

## Fase 8 — "Mi aprendizaje" y progreso del alumno

- El puntero de progreso por tópico ya existe desde Fase 4
  (`classroomStorage.ts`, `localStorage`); esta fase construye la pantalla
  "Mi aprendizaje" (hoy placeholder) que agrega y muestra ese progreso a
  través de todos los cursos/módulos/tópicos, con historial real.

## Principios que se mantienen en todas las fases futuras

- El Markdown de cada tópico (segmentado en `SourceBlock` desde Fase 2)
  sigue siendo la única fuente de verdad; nada de lo generado por el LLM
  puede introducir conocimiento externo al contenido autorizado, y toda
  afirmación pedagógica generada debe ser trazable a una o más referencias
  `SRC-XXX` válidas (trazabilidad estructural, ver
  `docs/ARCHITECTURE.md` sección 3.1 para el límite exacto de esa
  garantía).
- El LLM nunca produce HTML/JS/SVG/código ejecutable como parte de una
  visual; siempre una especificación declarativa (`VisualPlan`, Fase 3) que
  un componente React propio interpreta (Fase 4) — el frontend nunca
  interpreta código generado por el LLM.
- Ningún renderer (presente o futuro) inventa relaciones/conexiones entre
  conceptos que los datos no establezcan explícitamente (regla de "cero
  alucinación introducida por el renderer", Fase 4).
- Ninguna fase introduce Kubernetes, bases de datos relacionales/NoSQL,
  colas de mensajes, frameworks de orquestación de agentes, RAG,
  embeddings, bases de datos vectoriales, Redux/Zustand/XState, ni
  frameworks E2E de navegador (Cypress/Playwright) dentro del proyecto,
  salvo que una necesidad concreta y validada lo justifique explícitamente
  en el momento de esa fase.
- Las API keys de los proveedores LLM/voz nunca se exponen al navegador.
- Toda generación de contenido con LLM se cachea en filesystem con una
  cache key que incluya, como mínimo, el contenido fuente y el
  `prompt_version` de esa funcionalidad (mismo patrón de Fase 3).
