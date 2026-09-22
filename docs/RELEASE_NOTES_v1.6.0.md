# Release Notes — v1.6.0

Release candidate sobre v1.5.0. Un solo tema funcional —
**Learning Intelligence & Guided Review** — en cuatro bloques de
desarrollo más un hardening final. Sin cambios de arquitectura, sin
dependencias nuevas, sin base de datos, sin backend de usuario, sin
LLM/embeddings/RAG en ningún punto de esta feature (100% determinístico).
`Tutor`, `Lesson Generation`, `Course Retrieval` y `Guided Read Aloud` no
se tocaron en ningún commit de este release — `TUTOR_PROMPT_VERSION`
sigue en `tutor-v4`, `LESSON_PROMPT_VERSION` sigue en `lesson-v3.3.1`.

## Learning Intelligence & Guided Review

Cierra un loop pedagógico completo, 100% derivado de evidencia real ya
existente en la aplicación (Learning Progress + historial de
Certification), sin inventar ningún dato nuevo:

```
Learning Progress + Certification History
        ↓
TopicLearningSignal (v1.1.0, sin cambios)
        ↓
LearningState (nuevo, determinístico)
        ↓
Learning Insights ("Mi aprendizaje")
        ↓
Guided Review Plan + Session
        ↓
Certification real, acotada a los tópicos repasados
        ↓
Learning-State Refresh (recompute desde cero)
```

### `LearningState`: cuatro estados, explicables

`not_started` / `progressing` / `needs_review` / `mastered`, derivados
puramente de `TopicLearningSignal` (Bloque 1,
`frontend/src/learning/learningState.ts`). Reglas de precedencia clave:
completar un tópico **nunca** implica dominarlo (`completed` sin
evaluación es `progressing`, nunca `mastered`); un resultado de
certificación bajo en un tópico ya completado produce `needs_review`,
nunca `completed`. Siete reason codes determinísticos
(`LOW_CERTIFICATION_SCORE`, `REPEATED_LOW_CERTIFICATION_SCORE`, etc.)
permiten explicar cada estado sin texto libre generado.

### Learning Insights en "Mi aprendizaje"

Resumen de counts, sección "Prioridad de repaso" (hasta 5 destacados),
"En progreso" y "Dominados", con copy separado del dominio
(`learningStateCopy.ts`) — nunca dos mappings contradictorios.

### Guided Review Session

"Comenzar repaso" convierte la lista de tópicos `needs_review` (máximo
`MAX_GUIDED_REVIEW_TOPICS = 5`, snapshot inmutable) en una ruta
secuencial dentro del aula existente (nunca una segunda pantalla):
`Topic A → Topic B → ... → Fin del repaso`. Navegación fuera del plan
(tema relacionado, nav curricular, browser Back) deja la sesión "en
pausa" sin corromperla — "Volver al repaso" recupera exactamente la
posición correcta. **Principio pedagógico central, verificado por
construcción y con QA real: recorrer un repaso nunca cambia
`needs_review → mastered`** — ningún archivo de Guided Review llama a
`markTopicCompleted`/`recordCertificationAttempt`.

### Cierre del loop: Verification & Learning-State Refresh

"Evaluar progreso" (al terminar un repaso) reutiliza el flujo EXISTENTE
de Certification (`certificationSetupRoute`, desde v1.1.0) acotado
exactamente a los tópicos recién repasados — nunca un motor de
evaluación nuevo. Tras una Certification real, `CertificationResultsPage`
muestra un panel "Estado después de la verificación" con el estado
ACTUAL de esos tópicos, recalculado desde cero
(`deriveCourseLearningStates`, nunca un patch manual) — el mismo estado
que luego se ve en "Mi aprendizaje" (invariante de consistencia
verificada con QA real). Copy siempre factual, nunca causal ("Con la
nueva evidencia de esta certificación, el estado actual es...", nunca
"el repaso hizo que dominaras...").

**Segundo principio crítico, confirmado con evidencia real**:
verification != mejora garantizada. QA real contra
`spec-driven-design-expert` mostró un tópico `needs_review` con un
intento previo del 25% que, tras una Certification NUEVA con 100% de
aciertos, quedó en `progressing` (no `mastered`) porque el promedio de
la ventana de 3 observaciones más recientes ((25+100)/2 = 62.5%) cae en
el rango `developing` (60-79%) — la misma política de `classifyScore`
ya aprobada en v1.1.0, sin ningún umbral nuevo. Un resultado mixto real
(2 tópicos scoped, uno mejora a `progressing` y el otro se mantiene en
`needs_review`) también se mostró correctamente, cada uno con su propio
estado.

## Bug real encontrado y corregido durante el desarrollo (Bloque 4)

**Carrera entre `selectedCourseId` y el click en "Evaluar progreso"**:
la primera versión del handler exigía que el curso seleccionado en el
dropdown de "Mi aprendizaje" coincidiera con el curso del repaso recién
terminado antes de crear el `GuidedReviewVerificationContext` — pero
`selectedCourseId` se resuelve de forma asíncrona (`api.getCourses()`)
apenas se remonta la página, mientras que la tarjeta "Repaso completado"
aparece de inmediato (depende solo del `router state`). Un click real y
rápido perdía la creación del contexto en silencio (la navegación a
Certification seguía funcionando, pero sin panel de verificación
posible más adelante). Encontrado con QA real de punta a punta (no con
un test), reproducido con un test de regresión dedicado que nunca
resuelve `getCourses()`/`getCourse()`, y corregido derivando el
snapshot siempre directamente contra `reviewCompletion.courseId`
(`getTopicLearningSignal`, que solo necesita progreso+intentos de ESE
curso) — elimina la carrera por construcción, sin depender de qué curso
esté seleccionado en el dropdown. Confirmado también con un smoke real
contra el build Docker `--no-cache` del hardening: click inmediato tras
cargar la página, contexto creado correctamente en el primer intento.

## Hardening del release candidate

Auditoría del diff acumulado completo (`v1.5.0..HEAD`, los 4 bloques de
desarrollo). Además del bug de la carrera (ya corregido y documentado
arriba, encontrado durante el desarrollo del Bloque 4 — no en esta
pasada de hardening), la auditoría confirmó por diff exacto que
`learningState.ts`/`learningStateCopy.ts`/`guidedReviewPlan.ts`/
`guidedReviewSession.ts` permanecen **byte-por-byte idénticos** a su
commit de aprobación original (`git diff <commit-aprobación>..HEAD` da
0 líneas en los cuatro archivos) — cero drift en el core determinístico
a lo largo de los 4 bloques. Cero cambios de backend salvo las 3
ubicaciones canónicas de `APP_VERSION`. Sin `console.log`/debug
code/TODOs nuevos, sin `eval`/`new Function`/`dangerouslySetInnerHTML`
en ningún módulo nuevo, sin telemetría/analytics, sin datos de curso
hardcodeados fuera de archivos de test. 585 tests de backend (sin
cambios) y 632 de frontend (+27 vs. v1.5.0) pasando; build de producción
limpio; build Docker `--no-cache` limpio; `doctor.ps1` → "Todo en
orden" (un fallo transitorio de `GET /api/system/status` en la primera
corrida inmediatamente después de un restart de containers, investigado
y confirmado como latencia de cold-start del escaneo de diagnóstico de
cursos acercándose al timeout de 5s del cliente PowerShell — no
reproducible con el backend ya tibio, no relacionado con ningún cambio
de este release ya que 0 archivos de backend funcionales se tocaron).

## Antes / después: comparación factual, nunca causal

Cuando existe un snapshot previo (`preVerificationStates`, capturado al
iniciar la verificación), el panel muestra "Antes: X / Ahora: Y" **solo
si el status realmente cambió** — si el resultado no cambia (p. ej.
`needs_review` sigue `needs_review`), se omite la línea "Antes" en vez
de repetir información sin valor. Nunca se afirma que el repaso causó
el cambio: la Certification es la evidencia, el repaso es solo la ruta
que llevó a rendirla.

## Qué NO hace este release (límites honestos)

- **No hay mastery artificial**: completar un repaso, sin una nueva
  Certification real, nunca cambia ningún `LearningState`.
- **No hay garantía de mejora**: una Certification después de un repaso
  puede producir cualquier resultado que las reglas determinísticas ya
  aprobadas permitan, incluyendo quedarse igual o no mejorar lo
  suficiente para cambiar de estado (ver ejemplo real arriba).
- **Checkpoint sigue sin persistir evidencia**: las respuestas a
  `scene.interaction` (Fase 5) nunca se usan como fuente de
  `LearningState` — siguen siendo efímeras, solo en memoria de React.
- **Sin historial de repasos**: `GuidedReviewSession`/
  `GuidedReviewVerificationContext` son transitorios
  (`sessionStorage`), nunca se persiste "cuántos repasos hizo el
  alumno" en ningún lado.
- **`RecommendedForYou` (v1.1.0) convive sin unificar** con Learning
  Insights (v1.6.0) — redundancia conocida y documentada, deliberadamente
  fuera de alcance de este release (ver
  `docs/LEARNING_INTELLIGENCE_V1_6.md` sección 16.8).
- **El Tutor todavía no consume `LearningState`**: sin adaptación de
  respuestas del tutor según el estado de dominio del alumno.
- **Sin sincronización entre dispositivos/usuarios**: todo el estado
  vive en `localStorage`/`sessionStorage` del navegador, igual que el
  resto de la aplicación desde v1.1.0.
- **`recentAverage` sigue usando una ventana de hasta 3 observaciones**
  (política de v1.1.0, sin cambios) — un único resultado alto no
  garantiza `mastered` si el promedio con observaciones previas no
  alcanza el umbral.

## Notas de actualización (v1.5.0 → v1.6.0)

- **Sin migración de base de datos** (el proyecto no usa una).
- **Sin migración de cursos**: el formato de Markdown/frontmatter no
  cambió.
- **Sin servicio de backend nuevo**: Learning Intelligence & Guided
  Review es 100% frontend, reutilizando `localStorage`
  (`pwc-tutor:learning-progress:v1`, sin cambios de schema) y agregando
  dos documentos nuevos y transitorios en `sessionStorage`:
  `pwc-tutor:guided-review-session:v1` y
  `pwc-tutor:guided-review-verification:v1` — ninguno cross-tab
  (comportamiento scoped a la sesión del navegador, sin
  `BroadcastChannel`, documentado como diseño intencional, no una
  limitación a resolver).
- **`localStorage` de v1.5.0 sigue cargando sin ninguna migración**: el
  documento de Learning Progress no cambió de schema.
- `APP_VERSION`: `1.5.0` → `1.6.0` (`backend/app/config.py`,
  `docker-compose.yml`, `.env.example`).
- `LESSON_PROMPT_VERSION`: sin cambios, sigue en `lesson-v3.3.1`.
- `TUTOR_PROMPT_VERSION`: sin cambios, sigue en `tutor-v4`.
- Ningún endpoint HTTP nuevo, ningún endpoint eliminado, ningún cambio
  en el contrato público de ningún endpoint existente — el único
  endpoint de Certification reutilizado (`prepare`/`evaluate-question`/
  `evaluate`) ya existía desde Fase 6, sin ningún cambio de contrato.

Ver `docs/LEARNING_INTELLIGENCE_V1_6.md` para el diseño completo
(auditoría de evidencia, reglas de derivación, los 4 bloques con su
detalle técnico, y la sección de hardening).
