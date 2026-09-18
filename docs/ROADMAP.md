# Roadmap — PwC AI Tutor

Este documento describe las fases futuras del proyecto. **Ninguna de las
fases listadas debajo de la Fase 1 está implementada todavía.** Se incluyen
acá únicamente como referencia de dirección del producto, para que
decisiones de diseño de la Fase 1 (contratos de API, estructura de
Markdown, interfaz `LLMProvider`, etc.) no las bloqueen innecesariamente.

## ✅ Fase 1 — Base funcional (esta entrega)

- App shell + header + navegación.
- Catálogo de cursos.
- Detalle de curso (módulos y tópicos).
- Aula virtual básica: layout final (slide 16:9 + contenido Markdown +
  panel de asistente + barra de controles), sin LLM ni TTS todavía.
- API REST de solo lectura sobre el filesystem de cursos, con protección
  contra path traversal.
- Configuración preparada (no implementada) para proveedores LLM y de voz.
- Tests de backend y build de frontend verificados.

## Fase 2 — Integración real del LLM (grounded)

- Implementar `PwCGenAIProvider` y `OpenAIProvider` sobre la interfaz
  `LLMProvider` ya definida en `backend/app/services/llm_provider.py`.
- Endpoint `POST /api/courses/{course_id}/modules/{module_id}/topics/{topic_id}/ask`
  que reciba una pregunta del alumno y responda usando **exclusivamente**
  el Markdown del tópico como contexto.
- Manejo explícito del caso "no cubierto por el material": el tutor debe
  poder decir que no puede responder con el contenido disponible.
- Panel "Pregunta al asistente IA" del aula virtual pasa de placeholder a
  funcional.

## Fase 3 — Reorganización pedagógica y resúmenes

- Generación de resúmenes y explicaciones alternativas del contenido de un
  tópico (o de un módulo completo), siempre grounded en el Markdown
  original.
- Posible cacheo de estas generaciones (todavía sin decidir mecanismo de
  persistencia; evaluar si `localStorage` alcanza antes de introducir
  almacenamiento en el backend).

## Fase 4 — Slides y narración

- Generación de slides dinámicas a partir del Markdown del tópico, para
  ocupar el panel 16:9 que hoy es un placeholder en `ClassroomPage`.
- Integración de texto-a-voz (`VOICE_PROVIDER`): primero `browser` (Web
  Speech API, sin backend), luego eventualmente `openai` u otro proveedor
  server-side.
- Controles de la barra (Pausa, Repetir, Activar voz) pasan de placeholder
  a funcionales, sincronizados con la narración/slide activa.

## Fase 5 — Diagramas a partir de relaciones existentes

- Detectar relaciones ya presentes explícitamente en el Markdown (listas,
  jerarquías, tablas) y convertirlas en diagramas.
- Sin inferencia de relaciones no presentes en el texto (misma regla de
  grounding).

## Fase 6 — Checkpoints y preguntas estilo examen de certificación

- Generación de preguntas de comprensión (checkpoints) por tópico/módulo.
- Generación de preguntas estilo examen de certificación, derivadas
  exclusivamente del contenido cubierto por el curso.
- Persistencia de resultados: evaluar si alcanza con `localStorage` o si en
  esta fase se justifica introducir almacenamiento server-side (a decidir
  cuando se llegue a esta fase, no antes).

## Fase 7 — "Mi aprendizaje" y progreso del alumno

- Progreso de avance por curso/módulo/tópico, guardado en `localStorage`.
- Pantalla "Mi aprendizaje" (hoy placeholder) con historial real.

## Principios que se mantienen en todas las fases futuras

- El Markdown de cada tópico sigue siendo la única fuente de verdad; nada
  de lo generado por el LLM puede introducir conocimiento externo al
  contenido autorizado.
- Ninguna fase introduce Kubernetes, bases de datos relacionales/NoSQL,
  colas de mensajes, frameworks de orquestación de agentes ni
  microservicios, salvo que una necesidad concreta y validada lo justifique
  explícitamente en el momento de esa fase.
- Las API keys de los proveedores LLM/voz nunca se exponen al navegador.
