# Release Notes — v1.3.0

Release candidate sobre v1.2.0. Cuatro bloques funcionales (Classroom
Navigation + Voice Lifecycle, Structure-Aware Lesson Generation, Lesson
Generation Reliability, Content-Panel Navigation + Course-Scoped Expanded
Tutor — este último con dos gap-closures reales encontrados en QA) más un
hardening final. Sin cambios de arquitectura, sin dependencias nuevas, sin
base de datos, sin RAG, sin embeddings, sin una segunda llamada LLM en
ningún punto, sin autenticación, sin analytics externo.

## Voice lifecycle endurecido

- Invariante de reproducción única reafirmada en todos los puntos de
  navegación (escena, tópico, completar tema, salir del aula, interrumpir
  con el tutor): nunca dos audios simultáneos, ni entre voz del navegador
  y voz neural, ni entre dos respuestas de voz neural consecutivas.
- Protección de respuesta TTS neural obsoleta (`AbortController` +
  `playbackToken`): si el alumno navega mientras una síntesis de voz
  neural todavía está en vuelo, la respuesta tardía nunca reemplaza el
  audio actual ni empieza a sonar después de que la escena ya cambió.

## Navegación: escena vs. tópico, reubicación junto al Markdown

- `.scene-controls` (navegación de ESCENA, solo con `LessonPlan` activa)
  y la navegación de TÓPICO (siempre visible) siguen siendo dos
  affordances completamente distintas — nunca el mismo botón cambiando de
  semántica.
- La navegación de tópico ("Tema anterior"/"Tema siguiente") se reubicó
  del área debajo del Tutor al panel de contenido Markdown, como fila fija
  entre las tabs (Explicación/Puntos clave/Recursos) y el cuerpo con
  scroll — permanece visible mientras se lee, sin `position: sticky` (la
  estructura de `.content-panel` ya la deja fuera del contenedor con
  scroll por diseño). Una sola instancia en todo el DOM; el bloque
  duplicado anterior se eliminó por completo.
- "Completar tema y continuar" sigue siendo la única acción que marca un
  tema completado y avanza automáticamente — "Tema siguiente" nunca
  completa un tema por accidente.

## Generación de lecciones consciente de la estructura (`lesson-v3.3.1`)

- El Grounding Packet usado exclusivamente para generar lecciones ahora
  antepone metadata determinística por bloque (`type`, `list_kind`,
  `lang`, `heading_path`) antes del Markdown literal — permite que el
  modelo identifique sin ambigüedad tablas/código/listas reales, sin
  reinterpretar la sintaxis. El Markdown fuente completo sigue viajando
  sin truncar; esta metadata es puramente descriptiva, nunca una
  instrucción. El resto de los consumidores del packet (tutor,
  checkpoints, certificación, `/grounding`) no se ven afectados —
  parámetro opt-in exclusivo de la generación de lecciones.
- Guardas de fiabilidad: mensajes de corrección más específicos ante un
  contrato inválido, y un validador conservador que rechaza un `process`
  construido sobre elementos que no tienen evidencia real de secuencia
  (solo dispara cuando TODAS las referencias citadas son listas
  desordenadas — nunca sobre prosa ambigua).
- QA real repetida contra el caso crítico conocido (una tabla real de
  comparación de metodologías): preservada consistentemente, sin
  degradar a `comparison` ni desaparecer silenciosamente.

`LESSON_PROMPT_VERSION`: `lesson-v3.2.1` → `lesson-v3.3` → `lesson-v3.3.1`.
Detalle completo en `docs/STRUCTURE_AWARE_LESSONS.md`.

## Tutor ampliado: dominio del curso completo, no solo el tópico actual

El modo "Ampliar con conocimiento general" del tutor (opt-in, switch
apagado por default, se resetea por tópico) pasa de considerar relevante
únicamente el tema del tópico actual a considerar también el dominio
educativo del curso completo — sin RAG, sin embeddings, sin una segunda
llamada al modelo.

- **`CourseScope`**: estructura determinística resuelta server-side desde
  `course_id` ya validado por el repositorio seguro existente (la misma
  función que sirve `GET /api/courses/{course_id}`) — título del curso,
  descripción si existe, títulos de módulos y tópicos. Nunca Markdown
  completo, nunca contenido inventado. Se envía al modelo únicamente en
  modo ampliado, marcado explícitamente como evidencia de dominio para
  juzgar relevancia — **nunca** como fuente de grounding: el Grounding
  Packet del tópico actual sigue siendo la única fuente real de
  conocimiento citable.
- **Contrato estructurado, no texto libre**: la decisión de alcance se
  representa con dos ENUMs cerrados —
  `scope_relation` (`current_topic` / `course_domain` / `unrelated`) y
  `topic_coverage` (`sufficient` / `partial` / `insufficient`) — en ese
  orden, antes de `response_type`, en un modelo interno
  (`ExpandedTutorReplyBody`) usado únicamente para la llamada LLM en modo
  ampliado. Ninguno de los dos campos se expone en el contrato público
  (`TutorReplyBody` no cambia) ni se persiste ni se loguea.
- **Invariantes deterministas** (sin ningún validador semántico):
  `scope_relation="unrelated"` exige `response_type="unrelated"`;
  `scope_relation` en (`current_topic`, `course_domain`) exige
  `response_type="answer"`; `topic_coverage="insufficient"` exige
  `answer_chunks=[]` — esto es lo que bloquea estructuralmente una cita
  débil (un `SourceBlock` que solo menciona un término de pasada, usado
  para "aparentar" que respalda una definición que en realidad no
  sostiene). Una respuesta que viole cualquiera de estas invariantes se
  rechaza y se reintenta, igual que cualquier otro problema de contrato.
- **Provenance sin cambios de fondo**: `answer_chunks` sigue siendo 100%
  grounded con `source_refs` reales; `general_knowledge_chunks` sigue
  siendo un campo estructuralmente distinto, sin ningún concepto de
  `source_refs` — estructuralmente imposible fingir que conocimiento
  general está grounded.

`TUTOR_PROMPT_VERSION`: `tutor-v3.1` → `tutor-v3.2` → `tutor-v3.2.1` →
`tutor-v3.3`. No participa de ninguna cache key (el tutor no se cachea).
Detalle completo, incluida la causa raíz de los dos gap-closures reales
encontrados en QA, en `docs/CLASSROOM_UX_V1_3.md` secciones 7.1 y 7.2.

## Hardening del release candidate

Auditoría del diff acumulado completo (`v1.2.0..HEAD`, los cuatro
bloques). Un bug real encontrado y corregido:

- **Overflow horizontal en mobile (390px)**: reproducido con Playwright
  contra un tópico real con una imagen ancha embebida (2022×764px). Causa
  raíz: `.classroom-grid` colapsa a una sola columna
  (`grid-template-columns: 1fr`) por debajo de 960px, que por default de
  CSS Grid equivale a `minmax(auto, 1fr)` — el ancho mínimo de esa
  columna compartida lo determina el mayor "min-content" de cualquier
  elemento en ella, y una imagen ancha (aunque tenga `max-width: 100%`
  para su tamaño renderizado) sigue contribuyendo su ancho intrínseco al
  cálculo de dimensionado del track del grid. `.classroom-stage` ya tenía
  `min-width: 0` (fix de una fase anterior), pero `.content-panel` no —
  como ambos comparten la misma columna en mobile, `.classroom-stage`
  terminaba igual de ancho que `.content-panel` por el stretch por
  defecto del grid, pese a su propio `min-width: 0`. Corregido agregando
  el mismo `min-width: 0` a `.content-panel`. Confirmado con Playwright:
  overflow horizontal eliminado (`document.documentElement.scrollWidth`
  vuelve a coincidir con `clientWidth`) en los dos tópicos con imágenes
  probados, sin tocar ningún componente de imagen ni ocultar overflow de
  forma global.

El resto de la auditoría (contrato del tutor, invariantes scope/coverage,
seguridad de SVG/diagramas, privacidad, secret scan del diff completo
contra v1.2.0, regresión de Certification/Learning Progress/animaciones
pedagógicas/StrictMode) **no encontró hallazgos nuevos** — ya estaba
correctamente cerrada por los bloques anteriores. 525 tests de backend y
420 de frontend pasando (sin regresiones); build de producción limpio;
build Docker `--no-cache` limpio.

## Qué NO afirma este release

- **No** hay clasificación de relevancia perfecta por parte del tutor: la
  decisión de `scope_relation`/`topic_coverage` sigue siendo un juicio del
  modelo LLM configurado, no una regla determinística de negocio. QA real
  mostró una mejora sustancial y consistente para términos ambiguos como
  "skill" (5/5 en las corridas finales), pero conceptos igualmente
  razonables como "LLM" o "agente de IA" pueden seguir clasificándose
  como `unrelated` para un `CourseScope` real concreto, de forma
  internamente consistente (nunca contradictoria) pero no siempre
  alineada con lo que un lector humano esperaría — documentado como
  límite real del modelo, no como un defecto de la arquitectura del
  contrato.
- **No** hay garantía de grounding semántico perfecto: `source_refs`
  demuestra trazabilidad estructural (la referencia citada existe
  realmente en el material), nunca una prueba de entailment semántico
  exacto de la afirmación puntual — las invariantes `topic_coverage`
  reducen significativamente el riesgo de citas débiles, no lo eliminan
  matemáticamente.
- **No** hay selección de `visual_type` perfecta, ni todas las imágenes
  del curso se usan, ni todos los tópicos terminan siendo diagramáticos —
  la distribución observada (mayoría textual, con visuales estructurados
  y animados en una porción real pero minoritaria de las escenas) no se
  tocó en este release ni se declara "resuelta".
- **No** hay sincronización semántica exacta entre narración y animación
  pedagógica — comparten control de pausa/reanudación, timing
  independiente.
- **No** hay RAG, no hay búsqueda web, no hay acceso a otros cursos ni al
  contenido real de otros tópicos del mismo curso en modo ampliado (solo
  a sus títulos, vía `CourseScope`) — "conocimiento general" en el modo
  ampliado del tutor significa exclusivamente el conocimiento de
  entrenamiento del modelo, nunca información en tiempo real ni
  verificable externamente.
- Sin LMS, sin soporte multi-usuario, sin progreso en la nube, sin
  predicción de resultado de examen real.

## Notas de actualización (v1.2.0 → v1.3.0)

- **Sin migración de base de datos** (el proyecto no usa una).
- **Sin migración de cursos**: el formato de Markdown/frontmatter no
  cambió.
- `APP_VERSION`: `1.2.0` → `1.3.0` (`backend/app/config.py`,
  `docker-compose.yml`, `.env.example`).
- `LESSON_PROMPT_VERSION`: efectivo `lesson-v3.3.1` (era `lesson-v3.2.1`
  en v1.2.0). Las caches de `lesson-v3`/`v3.1`/`v3.2`/`v3.2.1`/`v3.3` se
  conservan intactas en el filesystem — cambiar la versión invalida por
  diseño su reutilización, nunca las borra.
- `TUTOR_PROMPT_VERSION`: efectivo `tutor-v3.3` (era `tutor-v3.1` en
  v1.2.0). El tutor nunca se cachea, así que este cambio no invalida
  nada — solo trazabilidad/auditoría. Esta versión **no** se lee desde
  ninguna variable de entorno (a diferencia de `LESSON_PROMPT_VERSION`):
  es una constante de Python sin rol de cache key, por diseño.
- **El modo ampliado del tutor es completamente opt-in**: el switch
  "Ampliar con conocimiento general" arranca apagado por default en cada
  tópico nuevo, no persiste entre tópicos, y no requiere ninguna acción
  de configuración adicional — la app completa sigue funcionando
  exactamente igual si nunca se activa.
- CourseScope se resuelve on-demand (solo cuando el switch está activo en
  una consulta puntual), sin ningún costo ni cambio de comportamiento
  para el resto de la aplicación.
- Docker/bind mounts sin cambios funcionales adicionales a los ya
  existentes desde el Bloque 4 de v1.3.0 (`.env.example`/
  `docker-compose.yml` montados de solo lectura para el test de
  consistencia de versión).
- Ningún endpoint HTTP nuevo, ningún endpoint eliminado. El contrato de
  `POST .../tutor` (`TutorRequest`/`TutorReplyBody`) no gana ni pierde
  ningún campo público respecto a v1.2.0 más allá de
  `allow_general_knowledge` (ya introducido y documentado en un bloque
  anterior de este mismo release).
