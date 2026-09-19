# Release Notes — v1.1.0

Release candidate sobre v1.0.1. Cuatro bloques funcionales (Learning
Progress, Performance, Lesson rendering pedagógico, Adaptive Learning) más
un hardening final. Sin cambios de arquitectura, sin dependencias nuevas,
sin base de datos, sin autenticación, sin analytics externo.

## Mi aprendizaje

Vista consolidada, local-first, del progreso del alumno
(`frontend/src/learning/`, `localStorage`,
`pwc-tutor:learning-progress:v1`):

- progreso por tópico (`not_started`/`in_progress`/`completed`), con
  ratchet de una sola dirección (nunca se pierde un `completed`);
- historial de intentos de práctica/simulacro de certificación, con sus
  agregados públicos (`performance_by_topic`, `competencies_to_reinforce`)
  — nunca el answer key;
- "Continuar aprendiendo" determinístico (tópico `in_progress` más
  reciente, o el próximo `not_started` en orden curricular);
- migración idempotente desde el puntero legacy de `classroomStorage.ts`;
- reset de progreso por curso, aislamiento estricto multi-curso.

Ver `docs/LEARNING_PROGRESS.md`.

## Recomendaciones de estudio determinísticas (Adaptive Learning)

Motor de reglas explícitas — **no** un recomendador de IA — que decide
qué botón mostrarle al alumno en "Mi aprendizaje"
(`learningRecommendationEngine.ts` + `topicLearningSignal.ts`): cero
llamadas a un LLM, cero llamadas nuevas al backend, todo calculado en el
navegador a partir de datos ya locales.

- Señales: estado curricular del tópico + últimas 3 observaciones de
  `performance_by_topic` (identidad compuesta `module_id`+`topic_id`,
  nunca `topic_id` solo);
- umbrales fijos sobre "resultado de práctica" (nunca "nivel de dominio
  certificado" ni predicción de examen): `<60%` refuerzo necesario,
  `60–79%` en desarrollo, `>=80%` fortaleza observada;
- prioridades: continuar/empezar próximo tópico → revisar el más débil →
  practicar hasta 5 tópicos débiles → simulacro si hay cobertura
  suficiente sin debilidad → "Curso completado" con su propio seguimiento;
- cada recomendación es explicable ("Tu resultado más reciente fue 52%.",
  nunca "la IA recomienda…") y ejecuta una acción real: abre el tópico
  (con badge visual "Repaso" opcional, misma `LessonPlan`, sin
  regenerar), o abre la preparación de certificación con el scope
  correcto preseleccionado y validado contra el curso real.

Ver `docs/ADAPTIVE_LEARNING.md`.

## Certificación: concurrencia acotada y cache-first

`certification_service.prepare_exam` genera `QuestionBank`s pendientes en
paralelo acotado (`CERTIFICATION_MAX_CONCURRENCY`, default `2`, rango
1-4) en vez de secuencialmente uno a la vez:

- barrido cache-only primero (sin tocar el proveedor LLM);
- generación en waves de hasta `max_concurrency` candidatos concurrentes,
  nunca todos los tópicos pendientes a la vez;
- orden determinístico (round-robin por módulo, nunca `random`): el
  resultado nunca depende de qué request concurrente termina primero;
- misma tolerancia a fallos y early-stop de v1.0.1, ahora aplicada dentro
  de cada wave.

`singleflight.py` (nuevo, process-local) colapsa requests concurrentes
idénticas (misma key) a una sola operación real — usado por generación de
`LessonPlan`, `QuestionBank` y síntesis de voz: evita que un doble click o
dos pestañas disparen dos llamadas al proveedor para exactamente lo mismo.

Ver `docs/PERFORMANCE.md`.

## UX de operaciones de IA

`AiOperationStatus` reemplaza los mensajes de espera ad-hoc: mientras se
prepara una clase o una práctica, muestra un mensaje honesto ("Preparando
clase…", "Preparando práctica…") sin inventar un porcentaje ni una cuenta
regresiva que la aplicación no puede calcular de verdad.

## Lesson rendering pedagógico (`lesson-v3`)

`LESSON_PROMPT_VERSION` pasa de `lesson-v2` a `lesson-v3` (invalida la
cache de lecciones por diseño; `lesson-v2` no se borra, simplemente deja
de generarse). Visuales estructurados nuevos/mejorados
(`ImageVisual`/`ComparisonVisual`/`ArchitectureVisual`/`ProcessVisual`/
`ConceptMapVisual`) con contratos más estrictos: `edges` solo puede
referenciar `nodes` que existan, `visual_type="image"` solo es válido si
cita un `SRC-XXX` real de imagen, nunca se genera ni sugiere una URL
externa. La narración de cada escena es distinta del texto mostrado en la
slide, pero igual de grounded (mismas reglas de `source_refs`). Ningún
componente del renderer interpreta HTML/JS/SVG generado por el LLM.

Ver `docs/LESSON_RENDERING.md`.

## Fixes de identidad y de React keys (ya cerrados antes de este release,
confirmados sin regresión)

- **`bank_id::question_id`** como identidad compuesta: `question_id`
  (`Q-001`, `Q-002`, …) solo es único **dentro** de un `QuestionBank`, no
  globalmente. Todo el frontend (selección de respuesta, evaluación,
  resultados, navegación) usa la clave compuesta
  (`certificationStorage.examAnswerKey`) — auditado de punta a punta en
  este release, sin hallazgos nuevos.
- **React keys compuestas** en toda lista de curso/módulo/tópico
  (`${moduleId}-${topicId}`/`${topicId}-${index}` según el nivel de
  anidamiento), necesario porque el curso real tiene un `duplicate_slug`
  genuino entre dos módulos distintos.

## Compatibilidad con v1.0.x

- **Learning Progress** es 100% aditivo: no existía antes de v1.1.0. Si
  había un progreso legacy de `classroomStorage.ts` (solo `completed:
  boolean` por tópico), se migra una única vez, de forma idempotente, sin
  pisar progreso ya migrado.
- **Cache de `LessonPlan`**: la cache de `lesson-v2` sigue en el
  filesystem, simplemente deja de usarse (la key incluye
  `prompt_version`, así que no hay colisión ni pérdida de datos).
- **Cache de `QuestionBank`**: sin cambios de schema en este release; las
  caches existentes de v1.0.1 se siguen reutilizando.
- **Sin migración de base de datos, sin migración de contenido de curso**:
  no hay base de datos, y el filesystem de cursos no se toca.
- **Docker**: el volumen/bind mount de datos (`./data:/app/data`) se
  preserva sin cambios.

### `.env` recomendado al actualizar

```
LESSON_PROMPT_VERSION=lesson-v3
CERTIFICATION_MAX_CONCURRENCY=2
```

Ambos ya son el default de `docker-compose.yml`/`.env.example` en este
release — solo hace falta setearlos a mano si tu `.env` local ya existía
de antes y quedó con un valor viejo.

## Bug real encontrado y corregido durante el hardening (release candidate)

**Causa raíz**: `docker-compose.yml` nunca reenviaba `LESSON_PROMPT_VERSION`
con el default correcto (`lesson-v3`) ni `CERTIFICATION_MAX_CONCURRENCY`
en absoluto hacia el container del backend. Como `.env` del host nunca se
copia a la imagen (`.dockerignore` lo excluye explícitamente, y el
`Dockerfile` tampoco lo hace), la única vía real para que una variable de
`.env` llegue al proceso es el bloque `environment:` de
`docker-compose.yml` — no basta con que `Settings` (`pydantic-settings`)
tenga un default correcto en el código, ni con que `.env.example`/`.env`
digan lo correcto.

**Impacto real**: una instalación nueva que copiara `.env.example` tal
cual (que a su vez tenía el default viejo `lesson-v2`) generaba lecciones
con el prompt anterior a pesar de que el código ya estaba en `lesson-v3`.
`CERTIFICATION_MAX_CONCURRENCY` no tenía forma de configurarse en
absoluto vía `.env` bajo Docker Compose — siempre corría con el default
fijo de `2` del código, sin importar qué pusiera el alumno/operador en su
`.env`.

**Fix**: `docker-compose.yml` ahora reenvía `CERTIFICATION_MAX_CONCURRENCY`
y corrige el default de `LESSON_PROMPT_VERSION` a `lesson-v3`;
`.env.example` actualizado a juego; `docs/CONFIGURATION.md` corregido.
Confirmado en runtime tras un rebuild `--no-cache`: `GET
/api/system/status` responde `"prompt_version":"lesson-v3"`.

`APP_VERSION` se actualiza a `1.1.0` (`backend/app/config.py`,
`docker-compose.yml`, `.env.example`).

## Auditoría de hardening sin hallazgos nuevos

Revisado de punta a punta sin encontrar regresiones: superficie XSS (sin
`dangerouslySetInnerHTML`/`eval`/`new Function`/iframes en todo el
frontend), protección symlink/path traversal del filesystem de cursos
(sin cambios en este release), taxonomía de errores del proveedor LLM
(`LLMConfigurationError`/`LLMAuthError`/`LLMUpstreamError`/
`LLMResponseError`, sin traceback ni prompt completo expuesto al
alumno), cache keys de Lesson/QuestionBank/Speech (identidad contextual
completa, sin colisión cross-course/cross-topic), privacidad del motor
de recomendaciones (100% local, el LLM nunca ve Learning Progress ni
historial de certificación), y el contrato público de certificación
(`ExamQuestionView` nunca expone `correct_option_ids`/explicaciones/
`derivation_refs` antes de evaluar).

## Validación

- 389 tests de backend, 315 de frontend — sin regresiones frente a los
  bloques individuales.
- Build de producción del frontend limpio (`tsc && vite build`).
- `docker compose build --no-cache` limpio; ambos containers healthy;
  `scripts/doctor.ps1` en verde (mismo `[WARN]` benigno preexistente de
  `duplicate_slug` en el curso real, nunca `[FAIL]`).
- Smoke de API real (`/api/health`, `/api/ready`, `/api/system/status`,
  `/api/ai/status`, curso/tópico real, generación de lección `lesson-v3`,
  preparación de certificación) y flujo E2E real sobre
  `claude-foundations-certification` (catálogo → curso → tópico → voz →
  completar tópico → Mi aprendizaje → recomendación → práctica →
  resultados → Mi aprendizaje actualizado → Configuración), cero errores
  de consola.

## Qué NO es v1.1.0

- No es un LMS completo (sin usuarios, sin roles, sin multi-tenant).
- No hay persistencia en la nube: todo el progreso/recomendaciones vive
  en el navegador del alumno.
- Las recomendaciones NO predicen el resultado de un examen oficial ni
  afirman "nivel de dominio certificado" — son sugerencias de estudio
  basadas en resultados de práctica observados.
- No hay currículum adaptativo generado por IA: el orden y contenido de
  módulos/tópicos sigue siendo el que define el material del curso; el
  motor de recomendaciones solo decide a qué botón apunta una
  sugerencia, nunca reordena ni reescribe el curso.
- Sin RAG, sin embeddings, sin vector DB.
- Sin analytics ni telemetría externa nueva.

## Estado del release

Release candidate local: `release/v1.1.0-rc`. Sin push, sin tag
`v1.1.0`, sin merge a `master` — el release gate (tag + publicación) es
una decisión separada, posterior a este documento.
