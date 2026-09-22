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

## 15. Guided Review Session (Bloque 3: "Guided Review Session")

Convierte "Prioridad de repaso" en una ruta secuencial pequeña dentro de
Classroom, reutilizado (nunca una segunda pantalla): `Comenzar repaso →
Topic A → Topic B → Topic C → Fin del repaso`.

### 15.1 Principio pedagógico crítico: review != mastery

Recorrer un repaso guiado **nunca** cambia `needs_review → mastered`,
nunca crea evidencia evaluativa, nunca modifica `certificationAttempts`,
nunca inventa una "evidencia de repaso exitoso". Confirmado por
construcción: ningún archivo de este bloque
(`guidedReviewPlan.ts`/`guidedReviewSession.ts`/`GuidedReviewBanner.tsx`/
los handlers nuevos en `ClassroomPage.tsx`/`LearningProgressPage.tsx`)
importa ni llama a `markTopicCompleted`/`markTopicStarted`/
`recordCertificationAttempt` en ningún punto — la única fuente de
evidencia real sigue siendo Certification. Verificado con un test
dedicado (`PASO 60`, `ClassroomPage.test.tsx`) y con QA real: un repaso
completo de 3 tópicos `needs_review` reales, sin rendir ninguna
certificación nueva, deja el summary con los mismos 3 `needs_review`
después de terminar.

### 15.2 `GuidedReviewPlan` (`frontend/src/learning/guidedReviewPlan.ts`)

Función pura `buildGuidedReviewPlan(courseId, states: LearningState[])
-> GuidedReviewPlan | null`. Fuente **exclusiva**: `getReviewCandidates`
(Bloque 1, sin cambios) filtrado a `status === "needs_review"` — nunca
`progressing` (esos siguen disponibles vía "Continuar tema" en Mi
aprendizaje, nunca se mezclan automáticamente), nunca recalcula score,
nunca usa `learningRecommendationEngine.ts` para decidir la ruta.
`MAX_GUIDED_REVIEW_TOPICS = 5`: los primeros 5 en el orden ya
determinístico de `getReviewCandidates`, sin scoring nuevo. `null` si no
hay ningún `needs_review` (el botón "Comenzar repaso" ya está oculto en
ese caso desde Bloque 2, pero el builder igual nunca lanza con `[]`).

### 15.3 `GuidedReviewSession` (`frontend/src/learning/guidedReviewSession.ts`)

**Storage: `sessionStorage`, no `localStorage`** — decisión explícita:
transitoria (desaparece al cerrar la pestaña), sobrevive cambios de
ruta/refresh (a diferencia de un `useState` en memoria, que Classroom
perdería al desmontar/remontar entre tópicos), y nunca contamina
Learning Progress permanente. Mismo patrón de saneamiento que
`learningProgressStore.ts` (schema version, parseo seguro, nunca lanza,
una entidad corrupta degrada a "sin sesión" en vez de romper la app).
Contenido MÍNIMO: `courseId` + `topics: {moduleId,topicId}[]` (snapshot
inmutable, PARTE 9 — nunca se reordena mientras el alumno la recorre,
aunque `LearningState` cambie mientras tanto en otra pestaña) +
`currentIndex`. Nunca scores/reason copy/títulos/Markdown/historial de
certificación — todo eso se resuelve desde el curriculum/stores reales
cuando hace falta mostrarlo.

`currentIndex` cambia **únicamente** por un click explícito de
"Siguiente/Anterior de repaso" (`updateGuidedReviewSessionIndex`) —
nunca inferido comparando la URL actual. Esto es lo que hace que
navegar manualmente a un tópico del plan (nav curricular, tema
relacionado del Tutor, browser Back, URL pegada a mano) **nunca** avance
el índice silenciosamente: la posición de la sesión representa el flujo
guiado, no cualquier navegación incidental.

Aislamiento de curso: `loadGuidedReviewSession(courseId)` devuelve
`null` si la sesión guardada pertenece a otro curso — una sesión de A
nunca aparece en B.

### 15.4 Resolución de posición y tópicos stale

Funciones puras separadas del I/O (`resolveGuidedReviewStep`,
`nextGuidedReviewIndex`, `prevGuidedReviewIndex`): reciben `topics` +
`currentIndex` + un predicado `isValidTopic` (resuelto por el llamador
contra el curriculum REAL y actual, `course.modules`, nunca contra una
copia guardada) y devuelven qué tópico corresponde mostrar, saltando
determinísticamente cualquier tópico que ya no exista (tópico
eliminado/renombrado) — nunca un framework de migración. Si NINGÚN
tópico del plan sigue siendo válido, resuelven `null` y la sesión puede
terminar limpiamente (sin ruta rota).

### 15.5 `GuidedReviewBanner` (`frontend/src/classroom/GuidedReviewBanner.tsx`)

Dimensión de navegación **separada** de "Tema anterior/siguiente"
curricular (`content-panel__topic-nav`, sin cambios) — nunca el mismo
control, texto siempre explícito ("de repaso"). Dos estados visuales:

- **Activo** (el tópico mostrado coincide con `step.ref`): "Repaso
  guiado · Tema X de N" + Anterior/Siguiente de repaso (Anterior
  deshabilitado en el primero; en el último, "Siguiente" se reemplaza
  conceptualmente por "Finalizar repaso") + "Salir del repaso".
- **En pausa** (el alumno navegó fuera del plan por cualquier vía que no
  sea los botones de repaso): "Repaso guiado en pausa" + "Volver al
  repaso" (navega exactamente al tópico de `currentIndex`, sin tocarlo)
  + "Salir del repaso".

Nunca solo color para indicar el estado (PARTE 66): siempre texto +
estructura de botones distinta.

### 15.6 Ciclo de vida completo

- **"Comenzar repaso"** (`LearningProgressPage.tsx`): construye el plan,
  `startGuidedReviewSession(plan)`, navega al primer tópico ya con
  `currentIndex=0`. Reemplaza el comportamiento de Bloque 2 (que solo
  navegaba, sin sesión real).
- **"Repasar tema"** individual: **sigue sin crear sesión** — solo
  navega (`?review=true`), exactamente igual que Bloque 2. Ambas
  acciones coexisten a propósito (repasar uno vs. repaso guiado
  completo).
- **Siguiente/Anterior de repaso**: actualiza `currentIndex`
  explícitamente y navega (`goToTopic`, reutilizado sin cambios) — el
  cleanup de audio (Reader/narración IA/Tutor) llega gratis del efecto
  de cambio de tópico ya existente, nunca una integración especial
  (PARTE 28/69).
- **"Finalizar repaso"** (solo visible en el último tópico válido):
  limpia la sesión, hace el mismo cleanup explícito de audio que "Salir
  de la clase" (`handleExit`, ya existente — necesario acá porque
  cambiar a `/mi-aprendizaje` no dispara el efecto de cambio de tópico),
  y navega a Mi aprendizaje con una confirmación de una sola vez vía
  `navigate(..., { state: { reviewCompleted, topicCount, topicIds,
  courseId } })` — la opción más simple entre las evaluadas (nunca
  sessionStorage adicional ni una página nueva, PARTE 34). El `state` del
  router se limpia (`navigate(pathname, {replace:true})`) apenas se
  captura, así un refresh posterior nunca vuelve a mostrar la
  confirmación.
- **"Salir del repaso"**: limpia la sesión sin marcar finalización,
  mismo cleanup de audio, vuelve a Mi aprendizaje sin confirmación.
- **`ReviewCompletionCard`** (`LearningProgressPage.tsx`): copy preciso
  y literal —
  *"Completaste esta ruta de repaso (N temas). Tu estado de aprendizaje
  se actualizará cuando haya nueva evidencia evaluativa."* — nunca
  "dominás"/"mejoraste tu nivel" sin evidencia real. Si la review vino
  de OTRO curso que no es el actualmente seleccionado, la página
  prioriza automáticamente ese curso (nunca el default `courses[0]`) al
  cargar.

### 15.7 "Evaluar progreso" y el boundary con Certification (PARTE 38/39)

Auditoría previa (PASO 3.G/H): Certification YA soporta scope acotado a
tópicos específicos (`certificationSetupRoute(courseId, mode,
topicIds)`, ya usado por "Iniciar práctica" desde Bloque 1/v1.1.0) — no
es "solo curso completo". Por lo tanto **sí** se agregó "Evaluar
progreso" en `ReviewCompletionCard`, reutilizando ese mismo helper
(exportado, sin duplicar la construcción de ruta) acotado a los
`topicIds` recién repasados — nunca una evaluación nueva, nunca
resultados preconfigurados, nunca una restricción artificial de
preguntas. Si esta reutilización no hubiera encajado limpiamente, este
bloque habría diferido la funcionalidad a un bloque futuro en vez de
forzar arquitectura — no fue necesario.

### 15.8 Tests

- `guidedReviewPlan.test.ts` (7): null sin needs_review, filtra
  únicamente needs_review, máximo 5, orden preservado, determinismo,
  aislamiento de curso.
- `guidedReviewSession.test.ts` (17): save/load/update/clear, JSON
  corrupto, schema inválido, shape inválido, aislamiento de curso,
  reemplazo de sesión, resolución de posición con/sin tópicos stale,
  next/prev, determinismo.
- `ClassroomPage.test.tsx` (+13): banner ausente sin sesión, "Tema X de
  N", Siguiente/Anterior actualizan índice y navegan, último tópico
  muestra "Finalizar repaso", Finalizar limpia sesión + navega con
  confirmación, Salir limpia sesión, navegación off-plan muestra
  "pausa" sin mover el índice, "Volver al repaso" navega al
  `currentIndex` real, aislamiento de curso, no auto-completion, tópico
  stale se salta sin romper el banner.
- `LearningProgressPage.test.tsx` (+6): "Comenzar repaso" crea sesión
  real y navega con `currentIndex=0`, "Repasar tema" individual NUNCA
  crea sesión, confirmación con copy preciso, "Evaluar progreso" navega
  al flujo existente de Certification, "Entendido" cierra sin efectos
  secundarios, sin `state` de navegación nunca se muestra la
  confirmación.

### 15.9 QA real (`spec-driven-design-expert`, Playwright, Chromium real)

Escenario con 3 `needs_review` reales (evidencia controlada, IDs reales
del curso vía fetch al backend real): `Comenzar repaso` → Tema 1 de 3
(Guided Read Aloud usado con éxito) → `Siguiente de repaso` → Tema 2 de
3 → navegación curricular hacia un tema fuera del plan → banner
"Repaso guiado en pausa" con "Volver al repaso" → click → vuelve
exactamente a Tema 2 de 3 (índice sin cambios) → **refresh real de
página** → banner recuperado correctamente ("Tema 2 de 3") → `Siguiente
de repaso` → Tema 3 de 3 → `Finalizar repaso` → `Mi aprendizaje` con
`Repaso completado` visible. Confirmado tras terminar (esperando la
carga real del curso de 53 tópicos, no un timeout fijo): el summary
sigue mostrando exactamente 3 `needs_review` — ninguno se convirtió en
`mastered` por haber sido repasado. 0 errores de consola en toda la
corrida. QA responsive en 390×844 (Mi aprendizaje y el banner dentro de
Classroom): 0px de overflow horizontal en ambos, banner compacto
(nunca media pantalla).

### 15.10 Privacidad y seguridad (PARTE 71/72)

`GuidedReviewSessionDocumentV1` contiene únicamente identity de
curso/tópicos + índice — nunca scores, respuestas de certificación,
Markdown ni conversación del Tutor. Sin telemetría, sin analytics, sin
historial de reviews persistido (PARTE 37 — ni intentos, ni timestamps
de finalización, ni "temas repasados" a través de sesiones: eso sería
evidencia nueva y requeriría diseño pedagógico específico, fuera de
alcance de este bloque). `JSON.parse` siempre en try/catch, sin `eval`,
sin construcción dinámica de rutas de filesystem.

### 15.11 Explícitamente fuera de este bloque

Tutor adaptativo, cambios a `tutor-v4`/`lesson-v3.3.1`, LLM para elegir
ruta, embeddings, vector DB, recommender ML, agentes, LangGraph, base de
datos nueva, backend de usuario, evaluación generada especialmente para
review, persistencia de Checkpoint, review score, mastery artificial,
gamification (XP/badges/streaks), telemetry, analytics, historial de
reviews completados.

## 16. Verification & Learning-State Refresh (Bloque 4, último bloque
funcional de v1.6.0)

Cierra el loop: `Guided Review → Evaluar progreso → Certification REAL →
nuevo attempt persistido → LearningState recalculado → Mi aprendizaje
actualizado`. Dos principios críticos, idénticos en espíritu a la
sección 15.1: **review != improvement** y **review != mastery** (recorrer
un repaso nunca cambia el estado por sí solo) y **verification !=
guaranteed improvement** (una Certification real después de un repaso
puede producir `needs_review → mastered`, pero también
`needs_review → needs_review` o cualquier otro resultado que las reglas
determinísticas ya aprobadas (Bloque 1, sin cambios) permitan — la UI
muestra el resultado real, nunca uno optimista).

### 16.1 Auditoría del flujo E2E de Certification (hecha antes de
implementar)

`useCertificationExam.submitExam()` (`frontend/src/certification/
useCertificationExam.ts`) es el ÚNICO punto de persistencia:
`recordCertificationAttempt(courseId, buildAttemptSummary(session,
result))` se llama de forma síncrona (`await`) ANTES de devolver el
`result` a la página que navega a Resultados — así que cuando
`CertificationResultsPage` se monta, el nuevo attempt YA está en
`localStorage`. `CertificationResultsPage` no conocía `progress`/
`LearningState` antes de este bloque (solo `course` + el `result` de
`sessionStorage`). El route `/certificacion/:courseId?mode=&topics=` YA
soportaba scope acotado a tópicos desde v1.1.0
(`certificationSetupRoute`, reutilizado sin cambios desde el Bloque 3) —
confirmado leyendo `CertificationSetupPage.tsx`: valida cada id contra
`course.modules` real, nunca confía ciegamente en el query param.
`CertificationAttemptSummary.attemptId` (`certificationSummary.ts`) ya
es `session.practiceId` — identidad estable y real, reutilizada tal cual
para detectar "hay un intento nuevo" (nunca un UUID nuevo, nunca
`Date.now()`).

### 16.2 `GuidedReviewVerificationContext`
(`frontend/src/learning/guidedReviewVerification.ts`)

Documento mínimo en `sessionStorage` (mismo patrón de saneamiento que
`guidedReviewSession.ts`): `{schemaVersion, courseId, topics:
{moduleId,topicId}[], latestAttemptIdAtStart: string | null,
preVerificationStates: {moduleId,topicId,status,reasonCode}[]}`. Nunca
scores, respuestas, `question_results`, Markdown ni conversación del
Tutor. Es un concepto DISTINTO de `GuidedReviewSession` (Bloque 3, que ya
se limpia sola al terminar el repaso): el contexto de verificación se
crea recién al pulsar "Evaluar progreso" en la tarjeta "Repaso
completado" — nunca reutiliza ni depende de la sesión de repaso ya
terminada.

`latestAttemptIdAtStart`: snapshot del `attemptId` más reciente del curso
(o `null` si el curso no tenía ningún intento) al momento de iniciar la
verificación — único mecanismo real de "¿hay un intento NUEVO?"
(`hasNewVerificationAttempt`, comparación de identidad, nunca un timer).
`preVerificationStates`: snapshot de presentación únicamente (PARTE 8 de
la especificación) — **nunca** participa en `deriveTopicLearningState`
ni en ninguna regla de clasificación; solo permite que la UI muestre
"Antes: ... / Ahora: ..." de forma factual cuando el status cambió.

**Bug real encontrado y corregido durante la implementación (no en un
test, en QA real de punta a punta)**: la primera versión de
`handleStartVerification` (`LearningProgressPage.tsx`) exigía
`selectedCourseId === reviewCompletion.courseId` antes de crear el
contexto (aislamiento de curso) y reutilizaba `learningStates`/`progress`
ya cargados en la página — ambos atados a `selectedCourseId`. Pero
`selectedCourseId` se resuelve de forma ASÍNCRONA (`api.getCourses()`)
apenas se remonta la página tras terminar un repaso, mientras que la
tarjeta "Repaso completado" aparece de inmediato (depende solo del
`router state`, no de `selectedCourseId`) — un click real y rápido en
"Evaluar progreso" corría contra `selectedCourseId` todavía `null`,
perdiendo la creación del contexto en silencio (navegaba a Certification
igual, pero sin panel de verificación posible más adelante). Corregido
derivando el snapshot SIEMPRE contra `reviewCompletion.courseId`
directamente vía `getTopicLearningSignal` (que solo necesita
`progress`+`attempts` de ESE curso, nunca `CourseDetail`) — elimina la
carrera por construcción, sin depender de qué curso esté seleccionado en
el dropdown. Reproducido con un test de regresión que nunca resuelve
`getCourses()`/`getCourse()` (`LearningProgressPage.test.tsx`, "bug real
(QA v1.6.0 Bloque 4)") antes de aplicar el fix.

### 16.3 `deriveVerificationResults` — derivación PURA
(`guidedReviewVerification.ts`)

`deriveVerificationResults(context, currentLearningStates:
LearningState[], evaluatedTopics)`: sin storage, sin navegación, sin
React. Devuelve solo los tópicos que están en `context.topics` **Y**
fueron efectivamente evaluados por el intento nuevo (`evaluatedTopics`,
derivado de `latestAttempt.performanceByTopic` — nunca inventa una
verificación de un tópico que el alumno no rindió, p. ej. si cambió el
alcance manualmente en Setup) **Y** siguen existiendo en el curriculum
real actual (`currentLearningStates`, mismo criterio anti-stale que
`resolveGuidedReviewStep` de Bloque 3). `[]` si la intersección es vacía
— el llamador lo trata como "sin panel", nunca un panel vacío raro.
`hasNewVerificationAttempt(context, latestAttemptIdNow)`: `true`
únicamente cuando `latestAttemptIdNow !== null &&
latestAttemptIdNow !== context.latestAttemptIdAtStart` — cubre
"abandonó Certification antes de submit" (nunca un falso resultado) sin
usar timestamps.

### 16.4 `CertificationResultsPage` — panel "Estado después de la
verificación"

Gate exacto para mostrarlo: contexto real cargado para `courseId` **Y**
`hasNewVerificationAttempt` **Y** `deriveVerificationResults(...).length
> 0`. `learningStates` se recalcula EN ESTA PÁGINA con la misma función
pura (`deriveCourseLearningStates`, Bloque 1, sin cambios) que usa "Mi
aprendizaje" — invariante de consistencia por construcción: ambas
pantallas llaman exactamente a la misma derivación sobre el mismo
`progress` real, nunca dos fuentes de verdad. Copy reutilizado 100% de
`learningStateCopy.ts` (Bloque 2, sin segundo mapping). La línea "Antes:"
solo se muestra cuando `before.status !== current.status` (si el status
no cambió, mostrar "Antes: X / Ahora: X" sería ruido, no información
nueva). Nunca afirma causalidad ("el repaso hizo que..."): el copy dice
"Con la nueva evidencia de esta certificación, este es el estado
actual...". El score global de Certification (`result.practice_score_percent`)
sigue mostrándose igual que siempre — el panel es una sección ADICIONAL,
nunca lo sustituye (son conceptos distintos: score de esta práctica
puntual vs. estado pedagógico por tópico).

`handleNewPractice` y el nuevo CTA "Volver a Mi aprendizaje" (dentro del
panel) llaman a `clearGuidedReviewVerificationContext()`: el contexto se
limpia al abandonar explícitamente el resultado o al volver a Mi
aprendizaje, nunca automáticamente al hacer submit (Results todavía lo
necesita). Sin contexto (Certification iniciada normalmente, sin pasar
por "Evaluar progreso"): la UI de Certification es exactamente la
histórica, sin cambios — confirmado con un test dedicado y con QA real.

### 16.5 Ventana de 3 observaciones — comportamiento real, no asumido

`TopicLearningSignal` sigue promediando hasta las 3 observaciones más
recientes (Bloque 1, sin cambios). Confirmado con QA real usando el curso
"spec-driven-design-expert": un tópico `needs_review` con un intento
previo del 25% que recibió una certificación NUEVA con 100% de aciertos
NO saltó a `mastered` — el promedio reciente (25%+100%)/2 = 62.5% cayó en
el rango `developing` (60-79%) de `classifyScore`, produciendo
`progressing` con `MEDIUM_CERTIFICATION_SCORE`. Este es el comportamiento
REAL de una función ya aprobada en Bloque 1 (no se tocó ni un umbral para
este bloque) — documentado acá porque es la prueba más clara de que "un
único resultado alto no garantiza mastery" no es una afirmación teórica.

### 16.6 QA real (Playwright, LLM real configurado, curso
"spec-driven-design-expert")

Flujo completo ejecutado de punta a punta: 2 tópicos `needs_review`
reales (evidencia pre-sembrada) → Guided Review de los 2 → "Evaluar
progreso" (scope preseleccionado confirmado: "Tópicos específicos" con
ambos tópicos marcados) → `prepare()` real contra OpenAI (5 preguntas
reales, 2 tópicos) → respuestas correctas determinadas vía brute-force
contra el endpoint YA determinístico `evaluate-question` (nunca contra
el LLM) → una respondida deliberadamente MAL (tópico 1, para probar "no
mejora") y otra siempre CORRECTA (tópico 2) → submit real → panel
"Estado después de la verificación" con resultado MIXTO real: tópico 1
"Ahora: Necesita repaso" (`REPEATED_LOW_CERTIFICATION_SCORE`, sin línea
"Antes" porque no cambió), tópico 2 "Antes: Necesita repaso / Ahora: En
progreso" (`MEDIUM_CERTIFICATION_SCORE`, ver 16.5) → refresh real (panel
sobrevive) → "Volver a Mi aprendizaje" → contexto limpiado
(`sessionStorage` confirmado sin la key) → Mi aprendizaje muestra
`needs_review: 1` (antes 2) y `mastered: 0` — coincide EXACTAMENTE con
el panel. Cero errores de consola en todo el recorrido.

### 16.7 Tests

`guidedReviewVerification.test.ts` (18 tests): storage (save/load/clear/
wrong-course/corrupt/wrong-schema/topics-vacío-inválido),
`hasNewVerificationAttempt` (con/sin intento nuevo, `null` inicial),
`deriveVerificationResults` (intersección real, topic isolation, stale
skip, all-stale, mixed results, same-status, before=null defensivo).
`CertificationResultsPage.test.tsx` (+7): sin contexto nunca muestra el
panel (regresión normal), con contexto pero sin intento nuevo nunca
muestra el panel (nunca falso resultado), con intento nuevo real
`needs_review → mastered` (construido con datos reales, nunca mockeando
`deriveTopicLearningState`), `needs_review → needs_review` sin línea
"Antes" cuando no cambia, "Volver a Mi aprendizaje" limpia el contexto,
"Nueva práctica" también lo limpia, refresh recupera el panel.
`LearningProgressPage.test.tsx` (+2): contexto real creado con snapshot
correcto, y el test de regresión del bug real (16.2) que nunca resuelve
`getCourses()`/`getCourse()`.

### 16.8 Explícitamente fuera de este bloque

Nuevo endpoint de Certification, nuevas preguntas específicas de review,
evaluación con LLM, recomendaciones con LLM, Tutor adaptativo, cambios a
`tutor-v4`/`lesson-v3.3.1`, embeddings, vector DB, agentes, LangGraph,
knowledge graph, persistencia de Checkpoint, historial de verificaciones
permanente, analytics, telemetry, badges/XP/gamification, nueva DB,
backend de usuario. `learningState.ts`/`learningStateCopy.ts`/
`guidedReviewPlan.ts`/`guidedReviewSession.ts` sin ningún cambio — Bloque
4 es exclusivamente: un módulo nuevo
(`guidedReviewVerification.ts`) + wiring en `LearningProgressPage.tsx`/
`ClassroomPage.tsx`/`CertificationResultsPage.tsx` + CSS. Cero cambios de
backend.

## 17. Hardening / release candidate (release/v1.6.0-rc)

Auditoría del diff acumulado completo `v1.5.0..HEAD` (los 4 bloques de
desarrollo, no solo el último commit). Sin features nuevas.

**Freeze del core confirmado por diff exacto, no por inspección
visual**: `git diff <commit-de-aprobación>..HEAD` da **0 líneas** para
`learningState.ts` (desde `59bd48f`, Bloque 1),
`learningStateCopy.ts` (desde `06b5aed`, Bloque 2), y
`guidedReviewPlan.ts`/`guidedReviewSession.ts` (desde `caba6a9`, Bloque
3) — los cuatro archivos permanecen byte-por-byte idénticos a su versión
aprobada a lo largo de toda la cadena. Cero drift.

**Bug real corregido durante el hardening**: ninguno nuevo. El único bug
real de todo el release (la carrera `selectedCourseId` vs. click en
"Evaluar progreso", sección 16.2) se encontró y corrigió durante el
desarrollo del Bloque 4, no durante esta pasada de hardening —
reconfirmado acá con: (a) el test de regresión dedicado sigue pasando,
y (b) un smoke real nuevo contra el build Docker `--no-cache` de este
hardening (click inmediato en "Evaluar progreso" apenas carga la
página, sin esperar sincronización del selector de curso) confirma el
fix en runtime real, no solo en test.

**Auditoría de limpieza** (`git diff --check`, búsqueda de
`console.log`/`debugger`/`TODO`/`FIXME`/`eval`/`new Function`/
`dangerouslySetInnerHTML`/telemetría/analytics/datos de curso
hardcodeados fuera de archivos de test): sin hallazgos. Backend: 0
archivos funcionales tocados en todo `v1.5.0..HEAD` — los únicos
cambios de backend de todo el release son las 3 ubicaciones canónicas
de `APP_VERSION` (`backend/app/config.py`, `docker-compose.yml`,
`.env.example`), hechas en esta misma pasada de hardening.

**`doctor.ps1`**: un fallo transitorio de `GET /api/system/status`
apareció en la primera corrida inmediatamente después de un `docker
compose up`/restart — investigado (no ignorado): medido con `curl`
directo, la primera request a ese endpoint tras un arranque frío tarda
~2.3-3.5s (escanea diagnósticos de los 5 cursos reales del volumen
montado), cerca del timeout de 5s que usa el cliente PowerShell
(`Invoke-RestMethod -TimeoutSec 5`) sumado a su propio overhead de
arranque de módulo — con el backend ya tibio (segunda corrida, containers
con más tiempo arriba), la misma llamada resuelve en ~0.5s y `doctor.ps1`
reporta "Todo en orden" de forma consistente. No relacionado con ningún
cambio de este release (0 archivos de backend funcionales tocados);
comportamiento pre-existente del endpoint bajo cold-start, no un defecto
introducido acá — no se modificó `course_diagnostics.py` ni
`doctor.ps1` (ninguno estaba en el objetivo del hardening, y el
comportamiento real de la app es correcto: el endpoint SIEMPRE responde
200 con datos correctos, solo tarda más en la primerísima llamada).

**Resto de la auditoría** (statuses/thresholds/window-of-3/max-5-policy/
plan snapshot/session storage safety/off-plan navigation/browser
Back/refresh/no-auto-completion/finish-cancel semantics/Reader
regression/audio ownership/Certification scoped/VerificationContext/
attempt identity/no-false-result/submit ordering/state
recomputation/verification filtering/copy reuse/before-after/no-causal
claims/mixed results/score-vs-state distinction/consistency
invariant/context cleanup/refresh result/normal Certification
regression/stale-corrupt-wrong-course context/Learning Insights
regression/RecommendedForYou coexistence/accessibility/mobile
overflow/privacy/security/Tutor freeze/Lesson freeze/Reader freeze) sin
hallazgos nuevos — ya cerrada correctamente por los 4 bloques de
desarrollo, reconfirmada con QA real repetida (ver secciones 15/16
arriba) y con un smoke adicional real contra el build `--no-cache` de
este hardening (catálogo → Mi aprendizaje → Comenzar repaso → Finalizar
→ Evaluar progreso con click inmediato, 0 errores de consola).

`APP_VERSION` `1.5.0` → `1.6.0`. `LESSON_PROMPT_VERSION`/
`TUTOR_PROMPT_VERSION` sin cambios (`lesson-v3.3.1`/`tutor-v4`). 585
tests de backend (sin cambios) / 632 de frontend (+27 vs. v1.5.0), sin
regresiones; build de producción limpio; build Docker `--no-cache`
limpio; `doctor.ps1` → "Todo en orden". Ver
`docs/RELEASE_NOTES_v1.6.0.md`.
