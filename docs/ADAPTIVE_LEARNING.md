# Adaptación pedagógica y refuerzo basado en progreso (v1.1.0)

Este documento describe el cuarto bloque funcional de v1.1.0: una capa de
recomendaciones **determinística, explicable y 100% local**, construida
sobre el Learning Progress ya existente (`docs/LEARNING_PROGRESS.md`). No
es un "recomendador de IA": es un motor de reglas explícitas, sin LLM, sin
backend, sin nueva dependencia.

## 1. Principio de fondo

> El LLM puede ayudar a explicar o reforzar contenido cuando el alumno YA
> entró a un tópico o al tutor. Nunca decide qué debe estudiar.

Markdown → `CanonicalTopicContent` → Grounding Packet sigue siendo la
única autoridad pedagógica (sin cambios de este bloque). Este motor solo
decide **a qué apunta un botón** en "Mi aprendizaje" — nunca genera texto
pedagógico nuevo ni modifica una `LessonPlan`.

## 2. Señales utilizadas (qué datos existen realmente)

Auditados antes de implementar (PARTE 1) — solo se usa lo que ya existe:

- `TopicLearningProgress.status` (`not_started`/`in_progress`/`completed`)
  y `lastAccessedAt` — de `learningProgressStore.ts`, sin cambios.
- `CertificationAttemptSummary.performanceByTopic` (`TopicBreakdown[]`,
  trae `module_id`+`topic_id`+`practice_score_percent` reales) — la única
  fuente de "resultado de práctica" por tópico. `competenciesToReinforce`
  (`CompetencyBreakdown[]`) NUNCA se usa para inferir un tópico: son
  labels observados sin mapping a `topicId` (ver sección 7).
- La estructura curricular REAL y actual del curso (`CourseDetail`, vía
  API) — nunca una copia guardada, así un tópico eliminado/agregado/
  reordenado en disco se refleja de inmediato (PARTE 21).

Nunca se inventa: no hay "horas estudiadas", "nivel de dominio",
"probabilidad de aprobar" ni ninguna métrica que la aplicación no pueda
derivar de datos reales guardados localmente.

## 3. `getTopicLearningSignal()` — señal por tópico

`frontend/src/learning/topicLearningSignal.ts`. Función PURA: recibe
`(moduleId, topicId, progress, attempts)`, nunca lee `localStorage`
directamente.

- Busca, en `performanceByTopic` de TODOS los intentos del curso, las
  entradas cuyo `module_id`+`topic_id` coincidan EXACTAMENTE (nunca solo
  `topic_id` — el curso real tiene un slug duplicado entre módulos
  distintos, y mezclar señales de dos tópicos distintos sería un bug real,
  no solo teórico).
- Recencia (PARTE 5): usa como máximo las últimas `RECENT_OBSERVATIONS_WINDOW`
  (= 3) observaciones, ordenadas por `completedAt` del intento — sin decay
  matemático. Documentado explícitamente como regla simple.
- `latestScore` = la observación más reciente. `recentAverage` = promedio
  de esas hasta-3 observaciones (con 1 observación, es igual a
  `latestScore`).
- Umbrales (PARTE 4), aplicados sobre `recentAverage`:

  | Rango | `reinforcementLevel` | Texto permitido |
  |---|---|---|
  | `< 60` | `needs_reinforcement` | "resultado de práctica" |
  | `60–79` | `developing` | "resultado de práctica" |
  | `>= 80` | `observed_strength` | "resultado de práctica" |

  **Nunca**: "nivel de dominio certificado", "probabilidad de aprobar",
  "competencia real", predicción de examen oficial.

- Con 0 observaciones: `reinforcementLevel` es `null` — nunca se infiere
  debilidad sin datos (PARTE 19/20).

## 4. Motor de recomendaciones

`frontend/src/learning/learningRecommendationEngine.ts`,
`getLearningRecommendations(course, summary, progress)` — PURA,
determinística, devuelve `LearningRecommendation[]` ordenadas por
`priority` ascendente. `summary` es el `CourseLearningSummary` que ya
produce `buildCourseLearningSummary()` (courseSummary.ts, sin cambios): el
motor **reutiliza** su `continueTarget`/`isCompleted` en vez de
reimplementar la regla de "próximo tópico" — una sola fuente de verdad
para esa lógica.

### Prioridades exactas

**Curso NO completado:**

1. `continue_topic` (in_progress más reciente) o `start_next_topic`
   (próximo `not_started` curricular) — SIEMPRE exactamente una, viene de
   `summary.continueTarget`.
2. `review_topic` — el tópico con señal más débil (`needs_reinforcement`)
   entre los que ya tienen actividad (`in_progress`/`completed`), excepto
   el de la recomendación 1 (nunca se recomienda revisar el mismo tópico
   que ya se está recomendando continuar). Cubre en un único cómputo
   "bajo desempeño reciente" y "completed pero repetidamente débil" — ver
   sección 8 para por qué se simplificó así.
3. `practice_topics` — hasta 5 tópicos débiles (ver sección 5).
4. `retry_simulation` — solo si `completedTopics/totalTopics >= 0.5`, cero
   tópicos `needs_reinforcement`, y al menos un intento ya registrado.

**Curso completado (PARTE 13)** — reemplaza 1-4 por exactamente dos
recomendaciones:

- `course_completed` (prioridad 0): encabezado informativo, sin acción
  propia en la UI (ver sección 6).
- Si hay algún tópico `needs_reinforcement`: `practice_topics` (nunca
  "estás listo para certificarte").
- Si no hay ninguno: `retry_simulation` con texto neutral fijo: "Podés
  realizar un simulacro para seguir practicando."

**Usuario totalmente nuevo (PARTE 19)** — `lastActivity === null`: SOLO se
devuelve `start_next_topic` apuntando al primer tópico curricular
(`reasonCode: "course_not_started"`). Nunca áreas débiles, nunca
`practice_topics`, nunca `retry_simulation` — no hay datos para
justificarlas.

## 5. Selección de tópicos para "Practicar" (`practice_topics`)

`selectWeakTopicsForPractice()`, hasta `MAX_PRACTICE_REINFORCEMENT_TOPICS`
(= 5) tópicos con `reinforcementLevel === "needs_reinforcement"`. Orden
determinístico:

1. menor `recentAverage` primero;
2. empate → observación más reciente primero (`lastObservedAt` mayor);
3. empate → orden curricular estable (módulo/tópico tal como aparecen en
   el curso real).

Sin datos suficientes (cero tópicos débiles): esta recomendación
simplemente no se genera — nunca se "rellena" con tópicos arbitrarios.

## 6. Acciones (qué botón hace qué)

Cada `LearningRecommendation.action` trae una ruta YA armada
(`action.to`), calculada por el motor (nunca por la UI):

| type | action.to |
|---|---|
| `continue_topic` / `review_topic` | `/aula/{courseId}/{moduleId}/{topicId}` (+ `?review=true` solo para `review_topic`) |
| `start_next_topic` | `/aula/{courseId}/{moduleId}/{topicId}` |
| `practice_topics` | `/certificacion/{courseId}?mode=practice&topics=t1,t2,...` |
| `retry_simulation` | `/certificacion/{courseId}?mode=simulation` |
| `course_completed` | apunta a la MISMA acción que la recomendación de seguimiento (practice/simulation) — la UI nunca la renderiza como card propia (ver `LearningProgressPage.tsx`, evita duplicar el texto "Curso completado" que ya muestra la sección de progreso) |

`CertificationSetupPage.tsx` lee `?mode=`/`?topics=` con `useSearchParams`
y los aplica SOLO después de cargar el curso real, validando cada id de
tópico contra `course.modules[].topics[].id` — un id inventado, de otro
curso, o simplemente inexistente se descarta en silencio, nunca rompe la
pantalla ni permite seleccionar algo fuera del curso. No se tocó el
backend: la preparación sigue pasando por el mismo flujo/botón de siempre.

## 7. Tópico vs. competencia (PARTE 7)

`performance_by_topic` se asocia directamente a `topicId` porque el
contrato ya lo permite (`TopicBreakdown.topic_id`/`module_id`).
`competencies_to_reinforce` (`CompetencyBreakdown`) es solo un label —
**nunca** se asume que corresponde a un tópico específico. La sección
"Competencias observadas para reforzar" que ya existía en Mi aprendizaje
(`ReinforceAreas`, bloque 1 de v1.1.0) sigue mostrando esas labels tal
cual, sin botón de acción falso — no cambió en este bloque.

## 8. Simplificaciones deliberadas frente a la especificación original

- Los "tiers 2 y 3" de la especificación (bajo desempeño reciente /
  completed pero repetidamente débil) se implementaron como **un único**
  cómputo (`review_topic`, el peor signal entre tópicos con actividad) en
  vez de dos recomendaciones separadas — evita mostrar dos cards para el
  mismo tópico. Documentado acá explícitamente por transparencia.
- "Cobertura suficiente" para sugerir un simulacro fuera de un curso
  completo (tier 6) es una regla simple y fija: mitad del curso
  completada + cero debilidad + al menos un intento previo — no hay
  heurística más sofisticada, a propósito.
- **Evolución de performance** ("Mejorando"/"Estable"/"Bajando", PARTE 22
  de la especificación original): **NO implementado**. La especificación
  lo marca explícitamente como opcional y advierte sobre el riesgo de
  sobreinterpretación con pocos datos — se omitió por esa misma razón.
- **Modo repaso + tutor** (PARTE 16 de la especificación original): NO
  implementado. Agregar una instrucción contextual de "modo repaso" al
  tutor requeriría modificar el contrato `POST .../tutor` (nuevo campo en
  el request) — un cambio de backend que la especificación de este bloque
  pide evitar o, si es imprescindible, primero explicar y pausar. Se
  omitió: el tutor en modo repaso funciona exactamente igual que siempre
  (mismo tópico como única autoridad).

## 9. Explicabilidad (PARTE 9/17)

Cada `LearningRecommendation` trae `reasonText` (prosa siempre visible,
nunca "la IA recomienda...") y opcionalmente `observedData` (score/
promedio/cantidad de observaciones/última actividad) detrás de un toggle
"¿Por qué?" en la UI. Ejemplos reales:

- "Dejaste este tópico en progreso."
- "Tu resultado más reciente en \"Prompt Engineering\" fue 52%."
- "En tus últimas 3 prácticas de \"...\", el promedio observado fue 61%."
- "Este es el próximo tópico pendiente del curso."

## 10. UX (PARTE 29)

Sección "Recomendado para vos" en Mi aprendizaje: una card destacada
(primaria) + hasta 2 secundarias, estilo PwC existente (mismos tokens de
color/tipografía). Nunca: estrellas, badges de "nivel", streaks, puntos,
ranking, XP — esto es formación profesional, no un juego.

## 11. Privacidad

Las recomendaciones se calculan **enteramente en el navegador**, a partir
de datos que YA vivían en `localStorage` (Learning Progress) — no se
agrega ningún dato nuevo, no se envía nada al backend, y el LLM nunca ve
el historial de progreso ni de certificación del alumno (el tutor sigue
usando exclusivamente el tópico activo, sin cambios).

## 12. Limitaciones conocidas

- El engine recalcula TODO en cada render de "Mi aprendizaje" — para un
  curso muy grande (cientos de tópicos × decenas de intentos) esto es
  O(tópicos × observaciones), que en la práctica es trivial (cursos
  reales tienen decenas de tópicos, no miles) pero no está optimizado con
  memoización más allá del `useMemo` a nivel de página.
- La regla de "cobertura suficiente" para simulacro (sección 8) es
  deliberadamente simple; no considera qué tópicos específicos cubre cada
  intento previo.
- El modo repaso (`?review=true`) es puramente visual (badge) — no ajusta
  ninguna lógica de grounding, checkpoint, ni tutor.
