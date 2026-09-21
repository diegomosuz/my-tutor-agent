# Learning Intelligence — Bloque 1: Learning Evidence + Deterministic Learning State (v1.6.0)

Primer bloque de "Learning Intelligence & Guided Review". Construye
**únicamente** la base determinística que permitirá responder, en un
bloque futuro, "¿qué debería estudiar o repasar este alumno ahora, y por
qué?" — sin implementar todavía ninguna UI de repaso, ninguna ruta
automática, ningún LLM y ningún cambio de prompt. Ver la sección 12 para
lo que queda explícitamente fuera de este bloque.

## 1. Objetivo

```
Learning Evidence
       ↓
Learning State
```

- **Evidence** = hechos observados (qué hizo el alumno, qué resultado
  obtuvo).
- **State** = interpretación pedagógica determinística de esos hechos,
  con un `reasonCode` explícito — nunca texto libre dentro de la lógica
  de dominio.

Cuatro estados, sin más granularidad de la demostrada por la evidencia
real disponible: `not_started` / `progressing` / `needs_review` /
`mastered`.

## 2. Auditoría de evidencia real (hecha ANTES de diseñar nada)

### 2.1 Learning Progress (`frontend/src/learning/learningProgressStore.ts`, v1.1.0)

Persiste en `localStorage` (una sola key, `pwc-tutor:learning-progress:v1`,
documento versionado — `LEARNING_PROGRESS_SCHEMA_VERSION = 1`):

- **Por tópico** (`TopicLearningProgress`, clave `${moduleId}:${topicId}`
  dentro de cada curso): `status` (`not_started`/`in_progress`/
  `completed`, ratchet monótono — nunca retrocede), `startedAt`,
  `lastAccessedAt`, `completedAt`, `currentScene`/`totalScenes`
  (informativos), `contentSha256`.
- **Por curso** (`CourseLearningProgress`): `courseId`, el mapa de
  tópicos de arriba, y `certificationAttempts: CertificationAttemptSummary[]`
  — **historial completo**, no solo el último intento (acotado a
  `MAX_CERTIFICATION_ATTEMPTS_PER_COURSE = 50`, los más recientes).
- **Por intento de certificación ya evaluado** (`CertificationAttemptSummary`):
  `attemptId`, `courseId`, `mode` (`practice`/`simulation`), `moduleIds[]`/
  `topicIds[]` (un intento cubre VARIOS tópicos a la vez), conteos
  (`questionCount`/`answeredCount`/`correctCount`/`partialCount`/
  `incorrectCount`/`unansweredCount`), `scorePercentage`, `completedAt`,
  **`performanceByTopic: TopicBreakdown[]`** (`module_id`+`topic_id`+
  `attempted`+`correct`+`partially_correct`+`incorrect`+`unanswered`+
  `practice_score_percent` — **granularidad real por tópico**, ya
  disponible sin inventar nada) y `competenciesToReinforce:
  CompetencyBreakdown[]` (por competencia, sin `topic_id` asociado — ver
  sección 2.4).

Todo el acceso está envuelto en try/catch, con saneamiento por-entidad
(un tópico/intento corrupto se descarta individualmente, nunca invalida
todo el documento) — ver `sanitizeDocument()`.

### 2.2 Checkpoints (`frontend/src/classroom/CheckpointPanel.tsx`, Fase 5)

**No persiste absolutamente nada.** `result` (un `CheckpointEvaluationBody`
con `verdict`: `correct`/`partially_correct`/`incorrect`/`not_assessable`,
sin score numérico) vive únicamente en `useState` del componente.
`handleRetry()` lo borra explícitamente (`setResult(null)`) sin dejar
rastro. Navegar fuera del tópico o refrescar la página pierde el
resultado por completo. Confirmado leyendo el componente completo — cero
menciones a `localStorage`/store en todo el archivo, y cero referencias a
"checkpoint" en `learningProgressStore.ts` o `classroomStorage.ts`.

### 2.3 Certification (backend `certification_service.py`/`certification_evaluator.py`,
Fase 6, + frontend `certification/useCertificationExam.ts`)

Evaluación 100% determinística (sin LLM) en el backend; el resultado
(`CertificationPracticeResult`, con `by_topic`/`by_competency`/
`question_results`) se recibe una vez y se resume del lado del cliente
con `buildAttemptSummary()` (`frontend/src/learning/certificationSummary.ts`)
**antes** de llamar a `recordCertificationAttempt()` — ese resumen
**deliberadamente excluye** `question_results` (el único campo con
answer key/explicaciones por pregunta). Lo que se persiste es
exactamente `CertificationAttemptSummary` (sección 2.1).

### 2.4 Respuestas a las preguntas del PASO 4

| # | Pregunta | Respuesta |
|---|---|---|
| A | ¿Qué persiste Learning Progress? | Status curricular por tópico + historial completo de intentos de certificación, con breakdown real por tópico. |
| B | ¿Qué persiste Checkpoint? | **Nada.** Resultado efímero, solo en memoria React. |
| C | ¿Qué persiste Certification? | Resumen seguro por intento (agregados, nunca answer key), con historial completo. |
| D | ¿Intentos históricos o solo el último? | **Historial completo** de certificación (hasta 50/curso). Checkpoint no tiene ninguno. |
| E | ¿Se almacenan scores? | Sí, `scorePercentage` por intento y `practice_score_percent` por tópico dentro de ese intento. Checkpoint no tiene score numérico (solo `verdict` cualitativo). |
| F | ¿Respuestas correctas/incorrectas? | Solo agregados (`correctCount`/`partialCount`/`incorrectCount`/`unansweredCount`), nunca por pregunta individual. |
| G | ¿Asociación determinística a course/module/topic? | Sí, para certificación (`performanceByTopic[].module_id/topic_id`, reales). Para Checkpoint no aplica (no persiste). |
| H | ¿Existe `source_ref` por pregunta? | No se persiste (se descarta junto con `question_results`). El backend sí lo usa internamente para grounding, pero nunca llega al storage local. |
| I | ¿Asociación con "conceptos" independiente del tópico? | Existe `competency` (string libre, por pregunta/breakdown) pero **sin mapping a `topicId`** — no es una identidad canónica utilizable para granularidad inferior a tópico (ver `learningRecommendationEngine.ts`, comentario explícito: "nunca se usa para inferir un tópico"). |
| J | ¿Qué se pierde al terminar una evaluación? | Checkpoint: todo. Certification: el detalle por pregunta (por diseño de privacidad, nunca por descuido). |
| K | ¿Frontend/localStorage o backend? | 100% frontend/`localStorage`. El backend nunca persiste evidencia de aprendizaje (ver CLAUDE.md secciones 10/11: "sin cache de tutor/checkpoint", "sin persistencia de resultados en backend"). |
| L | ¿Schema/versionado? | Documento único versionado (`schemaVersion: 1`), migración lazy e idempotente desde keys legacy pre-v1.1.0 (`migratedLegacyAt`). |

### 2.5 `topicLearningSignal.ts` / `learningRecommendationEngine.ts` (v1.1.0, ya existentes)

**Hallazgo central de esta auditoría**: v1.1.0 ("Adaptación pedagógica")
ya construyó una capa de agregación de evidencia por tópico
(`TopicLearningSignal`, `getTopicLearningSignal()`) y un motor de
recomendaciones completo (`learningRecommendationEngine.ts`) sobre esa
misma evidencia — con thresholds, ventana de observaciones recientes,
selección de tópicos débiles y reason codes YA en producción. Ver
`docs/ADAPTIVE_LEARNING.md`.

`TopicLearningSignal` combina, por tópico (`moduleId`+`topicId`, nunca
solo `topicId` — un curso real tiene slugs duplicados entre módulos):

- `status`: el `TopicStatus` curricular de Learning Progress.
- `observations`: cantidad de observaciones de certificación consideradas
  (0 a `RECENT_OBSERVATIONS_WINDOW = 3`, las más recientes).
- `latestScore` / `recentAverage`: del `practice_score_percent` de las
  observaciones recientes de ESTE tópico, cruzando TODOS los intentos de
  certificación del curso.
- `reinforcementLevel`: clasificación de `recentAverage` con
  `classifyScore()` — **`< 60` → `needs_reinforcement`, `60–79` →
  `developing`, `>= 80` → `observed_strength`** — umbrales YA
  establecidos y documentados en `docs/ADAPTIVE_LEARNING.md` sección 3,
  reutilizados tal cual (nunca redefinidos).

**Decisión de diseño de este bloque**: `LearningState` NO reimplementa
esta agregación. La reutiliza directamente como su evidencia (campo
`evidence: TopicLearningSignal` en cada `LearningState`) y agrega
únicamente la interpretación pedagógica unificada (`status` + `reasonCode`
en el vocabulario `not_started`/`progressing`/`needs_review`/`mastered`)
que `topicLearningSignal.ts` deliberadamente no hace (mantiene el status
curricular y el `reinforcementLevel` de evaluación como ejes separados).
Evita una segunda fuente de verdad para "qué tan bien le fue a un alumno
en un tópico" que podría divergir de la ya usada por el motor de
recomendaciones existente.

## 3. `LearningEvidence`

No se introdujo un tipo nuevo con este nombre: **`TopicLearningSignal`
(sección 2.5) ya es, en este codebase, la evidencia agregada por
tópico** — reutilizarlo tal cual evita duplicar sus cinco campos bajo un
nombre distinto que podría desincronizarse.

## 4. `LearningState` (`frontend/src/learning/learningState.ts`)

```typescript
type LearningStateStatus = "not_started" | "progressing" | "needs_review" | "mastered";

interface LearningState {
  courseId: string;
  moduleId: string;
  topicId: string;
  status: LearningStateStatus;
  reasonCode: LearningStateReasonCode;
  evidence: TopicLearningSignal;
}
```

### Reason codes

Reflejan exactamente las fuentes de evidencia auditadas (sección 2) —
**nunca** se adoptaron los nombres de ejemplo de la especificación que
mencionaban "CHECKPOINT", porque Checkpoint no persiste evidencia hoy
(sección 2.2):

| Reason code | Cuándo |
|---|---|
| `NOT_STARTED` | Sin actividad observable. |
| `STARTED_NOT_COMPLETED` | `status=in_progress`, sin evidencia de evaluación. |
| `COMPLETED_NO_ASSESSMENT` | `status=completed`, sin evidencia de evaluación. |
| `LOW_CERTIFICATION_SCORE` | Evidencia de evaluación con `reinforcementLevel=needs_reinforcement`, una sola observación reciente. |
| `REPEATED_LOW_CERTIFICATION_SCORE` | Igual que arriba, pero con 2+ observaciones recientes (patrón, no un tropiezo puntual). |
| `MEDIUM_CERTIFICATION_SCORE` | `reinforcementLevel=developing`. |
| `HIGH_CERTIFICATION_SCORE` | `reinforcementLevel=observed_strength`. |

## 5. Reglas de derivación (`deriveTopicLearningState`, función pura)

```
observations === 0:
  status curricular == not_started  -> not_started / NOT_STARTED
  status curricular == in_progress  -> progressing / STARTED_NOT_COMPLETED
  status curricular == completed    -> progressing / COMPLETED_NO_ASSESSMENT
                                        (PARTE 15: completion != mastery)

observations > 0 (la evidencia de evaluación PESA MÁS que el status curricular,
                   PARTE 12 -- ver precedencia abajo):
  reinforcementLevel == needs_reinforcement -> needs_review /
      (observations >= 2 ? REPEATED_LOW_CERTIFICATION_SCORE : LOW_CERTIFICATION_SCORE)
  reinforcementLevel == developing          -> progressing / MEDIUM_CERTIFICATION_SCORE
  reinforcementLevel == observed_strength   -> mastered / HIGH_CERTIFICATION_SCORE
```

### Precedencia de evidencia (PARTE 12)

**La evidencia de certificación, cuando existe, siempre decide sobre el
status curricular solo.** Un tópico `completed` con un resultado de
certificación bajo es `needs_review`, nunca `completed`/`mastered` —
"lo recorrió" no es lo mismo que "lo domina", y un resultado de
evaluación real es una señal más fuerte que haber pasado por las
escenas. Esto también cubre el caso inverso: un tópico con evidencia de
certificación fuerte es `mastered` **aunque el alumno nunca haya abierto
la clase en el aula** (la certificación se puede rendir sobre cualquier
scope de tópicos elegido en `/certificacion`, independiente de si esos
tópicos fueron visitados en el aula) — la evaluación real pesa más que
la ausencia de recorrido curricular.

### Múltiples intentos (PARTE 13)

Se reutiliza la política YA elegida en v1.1.0 (`topicLearningSignal.ts`):
**promedio de la ventana de hasta 3 observaciones más recientes**
(`recentAverage`), nunca solo el último intento ("latest") ni un modelo
estadístico nuevo. Ejemplo documentado (test "retry improvement"): un
fallo (40%) seguido de un resultado satisfactorio posterior (90%)
produce `recentAverage = 65` → `developing` → `progressing` — el
resultado más reciente no borra automáticamente el patrón, pero tampoco
lo ancla para siempre (con una tercera observación alta, el promedio
subiría). Esto es una decisión YA tomada por el código existente, no una
nueva en este bloque.

### Repeated failure (PARTE 14)

Se distingue `LOW_CERTIFICATION_SCORE` (una sola observación reciente
baja) de `REPEATED_LOW_CERTIFICATION_SCORE` (2 o más) reutilizando el
campo `observations` ya calculado — ningún contador nuevo.

## 6. `deriveCourseLearningStates` / `summarizeLearningStates` / `getReviewCandidates`

```typescript
deriveCourseLearningStates(courseId, modules: ModuleSummaryView[], progress): LearningState[]
summarizeLearningStates(courseId, states): LearningStateSummary
getReviewCandidates(states): LearningState[]
```

- `modules` debe venir de `buildCourseLearningSummary()`
  (`courseSummary.ts`) — la estructura curricular REAL y actual del
  curso (vía `CourseDetail`, API), nunca una copia guardada. Esto
  resuelve, gratis y sin ningún framework de migración:
  - **Course isolation** (PARTE 22): cada llamada recibe el `progress`
    de UN curso; nunca se mezcla evidencia entre cursos.
  - **Topic id collisions** (PARTE 23): identidad `moduleId+topicId`
    siempre, nunca `topicId` solo (mismo criterio que
    `topicLearningSignal.ts`, que documenta el caso real de slugs
    duplicados entre módulos).
  - **Deleted/renamed topics** (PARTE 24): un tópico que solo existe en
    `localStorage` pero no en el curso real actual nunca se itera —
    simplemente no aparece en `LearningState[]`. Sin crash, sin
    "tópico fantasma", sin framework de migración.
- `summarizeLearningStates`: partición exacta de `states` (los 4 counts
  siempre suman `totalTopics`); `masteredPercentage` redondeado, mismo
  criterio que `CourseLearningSummary.progressPercentage`.
- `getReviewCandidates`: incluye `needs_review` y `progressing` (nunca
  `not_started` — nada que repasar — ni `mastered` — ya no es
  candidato), con `needs_review` primero y, dentro de cada grupo, el
  orden curricular real (nunca scoring/ranking). Preparación para Guided
  Review (Bloque 2) — **no** construye ninguna ruta ni navega
  automáticamente.

## 7. Determinismo (PARTE 18)

Función pura: mismo `TopicLearningSignal`/mismo `(courseId, modules,
progress)` → mismo resultado, siempre. Sin `Date.now()`, sin
randomness, sin dependencia del navegador. Verificado con un test
dedicado (`deepEqual` sobre dos llamadas idénticas).

## 8. Storage (PARTE 19/20/21)

**Cero storage nuevo.** `LearningState` se deriva siempre on-demand a
partir de `CourseLearningProgress` ya persistido — nunca se guarda en
`localStorage`. No hay nada que migrar: los datos de v1.5.0 (y de
cualquier versión anterior con progreso migrado) siguen cargando
exactamente igual, porque `learningProgressStore.load()` no cambió en
absoluto en este bloque.

Un curso `completed`/`in_progress` con `certificationAttempts: []` (el
shape exacto que produce un usuario real de v1.5.0 que nunca rindió una
certificación, o el resultado de la migración legacy pre-v1.1.0) degrada
honestamente a `progressing`/`COMPLETED_NO_ASSESSMENT` o
`progressing`/`STARTED_NOT_COMPLETED` — nunca se inventa una evaluación
histórica que no existe (PARTE 51).

## 9. Backend (PARTE 54)

**Cero cambios de backend.** Toda la evidencia usada en este bloque ya
vive en `localStorage` del lado del cliente; no hubo ningún requisito
real que justificara tocar el backend.

## 10. UI / "Mi aprendizaje" (PARTE 32)

**Bloque 1**: no se conectó `learningState.ts` a `LearningProgressPage.tsx`
todavía. La página ya funciona completamente sobre
`learningRecommendationEngine.ts` (que internamente ya usa
`topicLearningSignal.ts`, la misma evidencia que `LearningState`
reutiliza) — conectar el nuevo módulo en ese momento habría sido puro
riesgo aditivo sin ningún beneficio visible para el alumno, ya que
Guided Review (el consumidor real de `LearningState`) todavía no
existía. `learningState.ts` quedó listo, probado y documentado para que
un bloque futuro lo consumiera directamente.

**Actualizado en Bloque 2**: ya conectado — ver sección 14.

## 11. Privacidad y seguridad (PARTE 30/31)

Sin cambios respecto al resto de la aplicación: toda la evidencia
permanece local (`localStorage`), sin telemetría, sin analytics externo,
sin perfil de alumno en el backend, sin subir historial a ningún LLM.
`learningState.ts` no usa `eval`, no parsea JSON directamente (consume
objetos ya saneados por `learningProgressStore.ts`), no hace merge de
prototipos ni construye ninguna ruta de filesystem.

## 12. Explícitamente fuera de este bloque

Guided Review UI, rutas automáticas de repaso, Tutor adaptativo, cambios
de prompt del Tutor, LLM para clasificar desempeño, embeddings, vector
DB, knowledge graph, recommender ML, agentes, LangGraph, perfiles
psicológicos/"learning styles", backend de usuarios, base de datos
nueva, telemetry, analytics externos, persistencia de evidencia de
Checkpoint (ver sección 2.2 — limitación real y honesta, no un
descuido), y cualquier fabricación retroactiva de evaluación histórica
que el sistema no registró (PARTE 51).

## 13. Integración con Guided Review (histórico del Bloque 1, ya cumplido)

`getReviewCandidates(states)` ya devolvía, en orden curricular con
`needs_review` priorizado, la lista de tópicos candidatos — la
expectativa de este bloque era que un bloque futuro pudiera consumir
esto directamente para hacerlo visible/accionable, sin tocar
`learningState.ts`. Bloque 2 (sección 14) hizo exactamente eso: cero
cambios a `learningState.ts`, `deriveCourseLearningStates`,
`summarizeLearningStates` ni `getReviewCandidates`.

## 14. Learning Insights UI (Bloque 2: "Learning Insights UI + Actionable
Review Candidates")

Hace visible y accionable `LearningState[]` dentro de "Mi aprendizaje"
(`frontend/src/pages/LearningProgressPage.tsx`) — sin crear todavía
ninguna sesión de repaso (eso es Bloque 3). Cero cambios a
`learningState.ts`: la UI solo renderiza lo que el dominio ya calculó.

### 14.1 Auditoría previa de "Mi aprendizaje" (hecha ANTES de implementar)

- **Componentes existentes**: `CourseProgressSection` (hero + progreso por
  módulo, lista TODOS los tópicos curriculares con `TopicStatus` —
  `not_started`/`in_progress`/`completed`, un eje ORTOGONAL a
  `LearningState`), `RecommendedForYou`/`RecommendationCard`
  (`learningRecommendationEngine.ts`, v1.1.0), `ModeOverviewCard`,
  `ResultsEvolution`, `ReinforceAreas`.
- **Selector de curso**: `<select>` controlado por `selectedCourseId`,
  solo visible con 2+ cursos (`courses` vía `api.getCourses()`).
- **Identity**: `courseId` real (URL/selector) → `courseDetail` real vía
  `api.getCourse(courseId)` → `summary.modules[].topics[]` con
  `moduleId`/`topicId`/`title` reales — nunca inventado.
- **Navegación existente**: `<Link to={`/aula/${courseId}/${moduleId}/${topicId}`}>`
  (lista de módulos) y `navigate(recommendation.action.to)` (tarjetas de
  recomendación) — ambos construyen la ruta desde IDs reales, nunca desde
  el título mostrado.
- **Certification history**: `ModeOverviewCard` (por modo),
  `ResultsEvolution` (barra por intento), `ReinforceAreas` (por
  competencia) — todo ya vía `certificationSummary.ts`.
- **Tests existentes**: `LearningProgressPage.test.tsx`, mockea
  `api.getCourses`/`api.getCourse`, usa el store real
  (`markTopicStarted`/`markTopicCompleted`/`recordCertificationAttempt`)
  contra `localStorage` real de jsdom.

### 14.2 Integración (PARTE 4/5)

`deriveCourseLearningStates`/`summarizeLearningStates`/`getReviewCandidates`
se llaman directamente desde `LearningProgressPage`, con los mismos
`summary.modules`/`progress` ya cargados para el resto de la página —
**cero lógica de clasificación/threshold/orden duplicada en el
componente**. `LearningState[]` nunca se persiste (se recalcula en cada
render vía `useMemo`, igual criterio que `recommendations`).

### 14.3 Secciones nuevas

- **"Estado de aprendizaje"** (`LearningInsightsSummary`): los 4 counts
  de `summarizeLearningStates` — nunca un "AI Score"/"Learning Score"
  inventado (PARTE 7).
- **"Prioridad de repaso"** (`ReviewPrioritySection`): solo
  `needs_review` (filtrado de `getReviewCandidates`), máximo 5 tarjetas
  (`MAX_FEATURED_REVIEW_CANDIDATES`) + nota "+N tema(s) más" si hay más
  — nunca paginación (PARTE 12). Orden: el que ya devuelve
  `getReviewCandidates`, nunca reordenado (PARTE 11). CTA "Repasar tema"
  por tarjeta + CTA global "Comenzar repaso" (visible solo si hay 1+
  `needs_review`) que navega al primer candidate real — un solo
  `navigate()`, sin cola/sesión/wizard (PARTE 23, eso es Bloque 3).
- **"En progreso"** (`ProgressingSection`): `progressing` (del mismo
  `getReviewCandidates`, filtrado). CTA "Continuar tema" para
  `STARTED_NOT_COMPLETED`, "Ver tema" para
  `COMPLETED_NO_ASSESSMENT`/`MEDIUM_CERTIFICATION_SCORE` (PARTE 21).
- **"Dominados"** (`MasteredSection`): lista compacta con checkmark,
  reutiliza literalmente el componente visual `.learning-topic` ya usado
  por "Progreso por módulo" (PARTE 18 — nunca una card grande).
- **`not_started`** (PARTE 19): nunca duplicado como cards nuevas — ya
  está representado en el resumen y en "Progreso por módulo" (sin
  cambios, lista TODOS los tópicos incluidos los no iniciados).

### 14.4 Terminología y mapping presentacional (PARTE 8/13/14,
`frontend/src/learning/learningStateCopy.ts`)

Módulo nuevo, deliberadamente separado de `learningState.ts` (el dominio
nunca contiene strings pedagógicos): `LEARNING_STATE_STATUS_LABEL`
("No iniciado"/"En progreso"/"Necesita repaso"/"Dominado"),
`LEARNING_STATE_REASON_COPY` (un texto por reason code, nunca menciona
Checkpoint/resultados por pregunta — el modelo no los tiene, PARTE 14/59),
`describeLearningStateEvidence` (evidencia concreta SOLO si
`TopicLearningSignal` la expone — "Promedio reciente de certificación:
N%" y/o "N resultados recientes" con 2+ observaciones — nunca
recalculada, PARTE 15/16).

### 14.5 Bug real encontrado en QA: colisión de label "Continuar"

`ProgressingSection` originalmente usaba el label "Continuar" (igual al
botón de "Recomendado para vos" para `continue_topic`) — como ambas
secciones pueden mostrar el MISMO tópico simultáneamente (el mismo
`in_progress` curricular alimenta tanto la recomendación existente como
`STARTED_NOT_COMPLETED` acá), esto producía dos botones "Continuar"
ambiguos en pantalla (falla real de tests existentes:
`getByRole("button", { name: "Continuar" })` encontraba 2 elementos, un
problema real de accesibilidad de teclado/lector de pantalla, no solo de
tests). Corregido: `progressingCtaLabel` usa "Continuar tema" en su
lugar — nunca el mismo texto exacto que un botón con otra acción ya
visible en la misma pantalla.

### 14.6 Bug real encontrado en QA real de navegador: overflow a 390px

QA con curso real (`spec-driven-design-expert`) + un segundo curso real
con título largo ("Claude Foundations Certification") expuso un overflow
horizontal genuino a 390px (`scrollWidth` 409 vs. `clientWidth` 390):
`.learning-course-selector select` (el selector de curso, PRE-EXISTENTE
desde v1.1.0, nunca tocado por este bloque) es un hijo flex sin
`min-width: 0`, así que nunca se encoge por debajo del ancho de su
`<option>` más largo — con "Curso Demo"/"Otro Curso" (los únicos
títulos que usaban los fixtures de test hasta ahora) esto nunca se
disparaba. Corregido agregando `min-width: 0; max-width: 100%; flex: 1;
text-overflow: ellipsis;` al selector. Confirmado con QA real: 0px de
overflow en 1366×768/768×1024/390×844 después del fix.

### 14.7 QA real (`spec-driven-design-expert`, Playwright, Chromium real)

Evidencia controlada localmente (nunca inferida del curso real, PARTE
51) inyectada en `localStorage` con IDs reales del curso (fetch directo
al backend real corriendo) — 1 tópico `not_started` (nunca tocado), 1
`progressing` (completado sin evaluación), 1 `needs_review` (evaluación
baja real, 20%), 1 `mastered` (evaluación alta real, 95%). Confirmado
visualmente: las 4 secciones muestran los títulos REALES correctos (no
IDs), "Repasar tema" navega a la URL real exacta
(`/aula/spec-driven-design-expert/fundamentos-de-sdd/el-ciclo-intent-evidence-convergence?review=true`),
Guided Read Aloud disponible de inmediato tras navegar (sin integración
especial, PARTE 37), y el registro de progreso (`completedAt`) del
tópico visitado para repaso quedó exactamente igual después de navegar
— confirmando que "Repasar tema" nunca marca completado ni modifica
Learning Progress solo por visitar (PARTE 26/36). 0 errores de consola
en las tres corridas de QA real (desktop + navegación + 3 viewports
responsive).

### 14.8 Límites (honestos)

Redundancia deliberada con "Recomendado para vos" (v1.1.0): un mismo
tópico `in_progress`/débil puede aparecer en ambas secciones con
distinto framing — no se unificaron en este bloque (fuera de alcance,
`learningRecommendationEngine.ts` no se tocó). Checkpoint sigue sin
evidencia persistida (sección 2.2) — ningún texto de esta UI lo
menciona. Sin sesión/cola/wizard de repaso todavía (Bloque 3).
