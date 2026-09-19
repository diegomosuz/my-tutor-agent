# Learning Progress ("Mi aprendizaje") — v1.1.0

"Mi aprendizaje" es una vista consolidada, **local-first**, del progreso
del alumno: qué tópicos completó, cuál continuar, y un resumen de sus
prácticas/simulacros de certificación. No agrega base de datos, backend
persistence, usuarios/auth ni ningún servicio externo — es una capa
puramente de frontend sobre `localStorage`.

## Qué se persiste, y dónde

Una única key de `localStorage`: **`pwc-tutor:learning-progress:v1`**,
con un documento JSON versionado (ver `frontend/src/learning/types.ts`):

```ts
interface LearningProgressDocumentV1 {
  schemaVersion: 1;
  migratedLegacyAt: string | null; // ver "Migración" abajo
  courses: Record<string, CourseLearningProgress>;
}

interface CourseLearningProgress {
  courseId: string;
  topics: Record<string, TopicLearningProgress>; // clave: "moduleId:topicId"
  certificationAttempts: CertificationAttemptSummary[];
}
```

Por **tópico** (`TopicLearningProgress`):

- `status`: `not_started` | `in_progress` | `completed`.
- `startedAt` / `lastAccessedAt` / `completedAt` (ISO timestamps).
- `currentScene` / `totalScenes` (informativos, de la última visita).
- `contentSha256` (el hash del Markdown del tópico al completarlo o al
  acceder por última vez — ver "Contenido actualizado" abajo).

Por **intento de certificación terminado** (`CertificationAttemptSummary`):
`attemptId`, `courseId`, `mode` (`practice`/`simulation`), `moduleIds`/
`topicIds` cubiertos, conteos (`questionCount`/`answeredCount`/
`correctCount`/`partialCount`/`incorrectCount`/`unansweredCount`),
`scorePercentage`, `completedAt`, y los agregados públicos
`performanceByTopic`/`competenciesToReinforce` (mismo shape que
`TopicBreakdown`/`CompetencyBreakdown` del backend).

**Nunca se guardan datos que la aplicación no pueda derivar de forma
confiable** (ej. "horas estudiadas" no existe como campo, porque no hay
una fuente de datos confiable para calcularlo).

## Qué NUNCA se persiste

- **Answer key**: `correct_option_ids`, explicaciones privadas,
  `derivation_refs`. `CertificationAttemptSummary` se construye
  explícitamente a partir de los agregados YA públicos de un resultado
  evaluado (`by_topic`/`by_competency`) — nunca copia `question_results`
  (el único campo de `CertificationPracticeResult` que trae el answer key
  por pregunta). Ver `frontend/src/learning/certificationSummary.ts`.
- API keys, prompts, Grounding Packets, tokens, cualquier secreto.
- Títulos de curso/módulo/tópico: el store solo guarda ids; los títulos
  siempre se resuelven en vivo contra `GET /api/courses/{id}` al mostrar
  la página, para que nunca queden desactualizados.

## Aislamiento por curso

Todo está indexado por `course_id` en el documento raíz, y dentro de cada
curso por `"{module_id}:{topic_id}"`. Dos cursos distintos con
`module_id`/`topic_id` idénticos (ej. dos cursos que ambos tengan
`modulo-1`/`modulo-1-introduccion`) nunca comparten progreso — cada uno
vive bajo su propio `course_id` en `courses`.

## Regla dura: "completed" nunca se pierde

`useClassroomEngine.previousScene()`/`goToScene()` resetean su propio
`isCompleted` interno al navegar hacia atrás (ese flag representa el
estado de la escena actual dentro de una sesión de reproducción, no si el
tópico fue completado alguna vez — ver `frontend/src/classroom/
useClassroomEngine.ts`, sin cambios en v1.1.0). Learning Progress **nunca
lee ese flag de forma continua**: `ClassroomPage.tsx` reacciona solo al
evento de que pasó a `true` una vez, y lo registra como un **ratchet de
una sola dirección** en el store (`markTopicCompleted`). Por diseño:

- Volver atrás, saltar de escena, o "Repetir tema" (que limpia
  `classroomStorage.ts` por completo, sin relación con este store) nunca
  pueden borrar un `completed` ya alcanzado.
- `completedAt` se preserva la primera vez que se alcanza; completar de
  nuevo el mismo tópico no lo pisa.
- El porcentaje de curso es siempre `completed_topics / total_topics` —
  nunca depende de la cantidad de escenas de una `LessonPlan` generada
  (esa cantidad puede variar entre regeneraciones sin que eso deba mover
  el progreso curricular).

## Continuar aprendiendo (determinístico, sin LLM)

Implementado en `frontend/src/learning/courseSummary.ts`:

1. El tópico `in_progress` accedido más recientemente (si hay varios).
2. Si no hay ninguno: el primer `not_started` en el orden curricular real
   después del último tópico `completed`; si no queda ninguno después (el
   alumno saltó adelante), el primer `not_started` de todo el curso.
3. Si no queda ningún tópico pendiente: `null` — la UI muestra "Curso
   completado".

## Certification history

Cada intento de práctica/simulacro **terminado y evaluado** (nunca antes)
se registra vía `recordCertificationAttempt` — enganchado en
`useCertificationExam.submitExam()`, justo después de que el backend ya
evaluó el examen de forma 100% determinística. La sesión de examen en
curso (`sessionStorage`, ver `certification/certificationStorage.ts`) no
cambia: sigue siendo efímera, por diseño, de esa sesión del navegador. El
historial de intentos en Learning Progress es lo permanente.

**Áreas a reforzar**: para cada competencia mencionada en el historial, se
usa el desempeño del intento **más reciente** que la incluyó (nunca un
promedio, que podría ocultar una mejora/empeoramiento reciente), ordenado
de peor a mejor. Si solo un intento aportó datos de una competencia, se
marca como "resultado observado" en vez de "rendimiento reciente" — nunca
se insinúa una tendencia sin evidencia suficiente. Nunca se usa un LLM
para esta agregación, y nunca se inventa una competencia que no haya sido
producida por una práctica real.

## Retención

Máximo **50 intentos de certificación por curso**
(`MAX_CERTIFICATION_ATTEMPTS_PER_COURSE` en `learningProgressStore.ts`).
Al superarse, se conservan los 50 más recientes por `completedAt`. Sin
infraestructura de retención adicional.

## Contenido actualizado

Si el Markdown de un tópico cambió desde que el alumno lo completó
(`content_sha256` distinto), `ClassroomPage` muestra un aviso **no
bloqueante**: "Este contenido fue actualizado desde tu última visita." —
nunca se desmarca `completed` automáticamente (un cambio de contenido no
necesariamente invalida haber estudiado ese tema). Esta comparación es
local a la página del tópico (no se hace para todos los tópicos del curso
a la vez, para no multiplicar llamadas a la API solo por mostrar "Mi
aprendizaje").

## Migración desde progreso pre-v1.1.0

Antes de v1.1.0, `classroomStorage.ts` ya guardaba un puntero de progreso
liviano por tópico (`pwc-tutor:progress:{courseId}:{moduleId}:{topicId}`,
con `completed: boolean`). La primera vez que se lee el documento nuevo
(`load()` en `learningProgressStore.ts`), si `migratedLegacyAt` es `null`,
se escanean esas keys legacy y cualquier tópico con `completed: true` se
migra a `status: "completed"` en el documento nuevo — **solo si ese tópico
todavía no existe en el documento nuevo** (nunca pisa progreso ya
registrado por v1.1.0). Luego se marca `migratedLegacyAt` con la fecha
actual, así la migración corre **una sola vez** (idempotente). Una entrada
legacy individual corrupta se ignora sin afectar a las demás ni a la
aplicación. `classroomStorage.ts` en sí **no se modificó** — sigue
funcionando exactamente igual que antes de v1.1.0.

## Privacidad y reset

En **Configuración** (`/configuracion`), sección "Datos de aprendizaje":
explica que el progreso se guarda localmente en el navegador, y ofrece
"Restablecer mi progreso" **por curso** (selector de curso + confirmación
explícita vía diálogo nativo — nunca borra sin confirmar). El reset borra
únicamente, para el curso elegido: su progreso de tópicos y su historial
de intentos de certificación (`resetCourseProgress(courseId)`). Nunca
toca: configuración del sistema, API keys del backend, caches del backend
(`lesson-cache`/`certification-cache`/`speech-cache`), los cursos en sí,
ni el progreso de otros cursos.

## Robustez

Todo acceso a `localStorage` está envuelto en `try/catch` (modo privado,
cuota excedida, entornos de test). Un documento JSON corrupto, o con
`schemaVersion` distinto al esperado, se trata como si no existiera
(nunca lanza una excepción hacia la UI). Dentro de un documento por lo
demás válido, un curso/tópico/intento individual con forma inválida se
descarta solo, sin invalidar el resto (`sanitizeDocument` en
`learningProgressStore.ts`).
