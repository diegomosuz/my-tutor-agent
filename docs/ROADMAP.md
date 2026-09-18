# Roadmap — PwC AI Tutor

Este documento describe las fases futuras del proyecto. **Ninguna de las
fases listadas debajo de la Fase 2 está implementada todavía.** Se incluyen
acá únicamente como referencia de dirección del producto, para que
decisiones de diseño de fases tempranas (contratos de API, modelo canónico,
interfaz `LLMProvider`, etc.) no las bloqueen innecesariamente.

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
  horizontal_rule, other), con referencias estables `SRC-001`, `SRC-002`,
  ..., línea de origen y jerarquía de headings (`heading_path`).
- `CanonicalTopicContent` con `content_sha256` (detecta cambios de
  contenido sin usar timestamps).
- `build_grounding_packet(...)`: genera el texto determinístico que en la
  Fase 3 será el único contexto entregado a un LLM.
- `validate_source_refs` / `assert_valid_source_refs`: utilidades para
  detectar referencias `SRC-XXX` inválidas (se usarán para validar
  respuestas del LLM en la Fase 3).
- API: `GET .../topics/{topic_id}` extendido de forma backward-compatible
  con `canonical: { content_sha256, source_block_count, source_blocks }`;
  nuevo endpoint de inspección/desarrollo
  `GET .../topics/{topic_id}/grounding`.
- Frontend: panel colapsable "Información de grounding" en el aula virtual,
  visible solo en modo desarrollo (`import.meta.env.DEV`).
- Sigue sin existir ninguna llamada real a un LLM.

## Fase 3 — Integración real del LLM (grounded)

- Implementar `PwCGenAIProvider` y `OpenAIProvider` sobre la interfaz
  `LLMProvider` ya definida en `backend/app/services/llm_provider.py`.
- Endpoint `POST /api/courses/{course_id}/modules/{module_id}/topics/{topic_id}/ask`
  que reciba una pregunta del alumno, construya el Grounding Packet del
  tópico (ya implementado en Fase 2) y responda usando **exclusivamente**
  ese contexto.
- Validar con `assert_valid_source_refs` (ya implementado en Fase 2) que
  toda referencia `SRC-XXX` citada por el LLM exista realmente en el
  tópico; rechazar o reintentar si no es así.
- Manejo explícito del caso "no cubierto por el material": el tutor debe
  poder decir que no puede responder con el contenido disponible.
- Panel "Pregunta al asistente IA" del aula virtual pasa de placeholder a
  funcional.

## Fase 4 — Reorganización pedagógica y resúmenes

- Generación de resúmenes y explicaciones alternativas del contenido de un
  tópico (o de un módulo completo), siempre grounded en los `SourceBlock`
  del tópico (con referencias `SRC-XXX` verificables).
- Posible cacheo de estas generaciones (todavía sin decidir mecanismo de
  persistencia; evaluar si `localStorage` alcanza antes de introducir
  almacenamiento en el backend).

## Fase 5 — Slides y narración

- Generación de slides dinámicas a partir del Markdown del tópico, para
  ocupar el panel 16:9 que hoy es un placeholder en `ClassroomPage`.
- Integración de texto-a-voz (`VOICE_PROVIDER`): primero `browser` (Web
  Speech API, sin backend), luego eventualmente `openai` u otro proveedor
  server-side.
- Controles de la barra (Pausa, Repetir, Activar voz) pasan de placeholder
  a funcionales, sincronizados con la narración/slide activa.

## Fase 6 — Diagramas a partir de relaciones existentes

- Detectar relaciones ya presentes explícitamente en el Markdown (listas,
  jerarquías, tablas — ya identificables como `SourceBlock` desde Fase 2) y
  convertirlas en diagramas.
- Sin inferencia de relaciones no presentes en el texto (misma regla de
  grounding).

## Fase 7 — Checkpoints y preguntas estilo examen de certificación

- Generación de preguntas de comprensión (checkpoints) por tópico/módulo.
- Generación de preguntas estilo examen de certificación, derivadas
  exclusivamente del contenido cubierto por el curso.
- Persistencia de resultados: evaluar si alcanza con `localStorage` o si en
  esta fase se justifica introducir almacenamiento server-side (a decidir
  cuando se llegue a esta fase, no antes).

## Fase 8 — "Mi aprendizaje" y progreso del alumno

- Progreso de avance por curso/módulo/tópico, guardado en `localStorage`.
- Pantalla "Mi aprendizaje" (hoy placeholder) con historial real.

## Principios que se mantienen en todas las fases futuras

- El Markdown de cada tópico (segmentado en `SourceBlock` desde Fase 2)
  sigue siendo la única fuente de verdad; nada de lo generado por el LLM
  puede introducir conocimiento externo al contenido autorizado, y toda
  afirmación pedagógica generada debe ser trazable a una o más referencias
  `SRC-XXX` válidas.
- Ninguna fase introduce Kubernetes, bases de datos relacionales/NoSQL,
  colas de mensajes, frameworks de orquestación de agentes, RAG,
  embeddings ni bases de datos vectoriales, salvo que una necesidad
  concreta y validada lo justifique explícitamente en el momento de esa
  fase.
- Las API keys de los proveedores LLM/voz nunca se exponen al navegador.
