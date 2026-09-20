# Release Notes — v1.4.0

Release candidate sobre v1.3.0. Un solo tema funcional grande —
**Course-Wide Grounded Tutor**, en tres bloques (retrieval determinístico,
integración con el contrato del tutor, provenance UX) — más un hardening
final. Sin cambios de arquitectura, sin dependencias nuevas, sin base de
datos, sin embeddings, sin vector DB, sin una segunda llamada LLM en
ningún punto, sin agentes, sin autenticación, sin analytics externo.

## Course-Wide Grounded Tutor

Hasta v1.3.0, el tutor solo conocía dos fuentes: el tópico actual
(siempre) y, en modo ampliado, conocimiento general del modelo. Preguntas
sobre un tema real del curso pero fuera del tópico actual terminaban en
`not_covered` (modo estricto) o dependían enteramente de que el modelo
"recordara" el tema con conocimiento general (modo ampliado, sin ninguna
evidencia real detrás). v1.4.0 agrega una tercera fuente real y
verificable: **el resto del curso**.

### Retrieval determinístico, sin embeddings

`app/services/course_retrieval.py` (nuevo) busca evidencia lexical en
TODOS los `SourceBlock`s de un curso (cruzando módulos y tópicos),
100% determinístico:

- Tokenización: Unicode NFKC + casefold + remoción de diacríticos,
  términos compuestos con guion preservados como palabra completa Y
  partes, stopwords español/inglés mínimas — sin stemming, sin
  diccionario de sinónimos.
- Scoring BM25-like con boost de campo (`topic_title` ×3,
  `heading_path` ×2, cuerpo ×1), IDF clásico, bonus de frase exacta y
  bonus de cobertura de términos, con un piso de cobertura mínima de
  términos (descarta matches de una sola palabra genérica en queries de
  2+ términos — la corrección real que eliminó falsos positivos en QA
  negativa).
- `CourseEvidenceCandidate`: identidad completa (`course_id`/`module_id`/
  `topic_id`/`source_ref` — nunca asume que `source_ref` es único a nivel
  de curso, porque no lo es), contenido literal nunca reformulado, score
  y términos matcheados.
- `exclude_topic_id`, `top_k` (default 6) y una selección con diversidad
  entre tópicos (máx. 3 candidatos por tópico antes de completar con el
  resto) — todo sin LLM, sin reranking semántico.
- Nada persistente: cada consulta escanea el contenido ACTUAL del curso,
  así que nunca puede quedar evidencia stale.

### `COURSE-SRC-XXX`: namespace temporal, nunca persistido

`app/services/course_grounding.py` (nuevo) resuelve un problema real de
identidad: `source_ref` (`SRC-001`, `SRC-002`, ...) se reinicia en CADA
tópico, así que dos tópicos casi siempre comparten el mismo `SRC-001`.
`COURSE-SRC-XXX` es un namespace exclusivo de CADA consulta puntual del
tutor — asignado en el orden de relevancia que ya decidió el retrieval,
nunca reordenado, nunca reutilizado entre preguntas, nunca confundible
con el `SRC-XXX` del tópico actual (namespaces validados por separado;
una referencia cruzada se rechaza por construcción).

### `course_coverage`: un tercer eje, independiente

El contrato interno del tutor (`StructuredTutorReplyBody`, reemplaza a
los dos modelos separados de v1.3.0) clasifica, en este orden, ANTES de
`response_type`:

```
scope_relation   -- pertenencia general (current_topic / course_domain / unrelated)
topic_coverage   -- cobertura del tópico actual (sufficient / partial / insufficient)
course_coverage  -- cobertura del resto del curso recuperado (sufficient / partial / insufficient)
```

Que el retrieval devuelva candidatos NO implica `course_coverage`
sufficient/partial — el modelo evalúa independientemente si esos bloques
recuperados realmente sostienen una respuesta, mismo criterio ya usado
para `topic_coverage` desde v1.3.0. Invariantes deterministas (sin
ningún validador semántico) bloquean citas débiles en ambos canales
grounded: `topic_coverage="insufficient"` exige `answer_chunks=[]`,
`course_coverage="insufficient"` exige `course_answer_chunks=[]`.

### Nueva semántica del switch "Ampliar con conocimiento general"

**Cambio de producto no negociable, reemplaza la semántica de v1.3.0**:
el switch dejó de controlar si el tutor puede usar evidencia de otros
tópicos del curso — eso corre siempre, en ambos modos. Controla
EXCLUSIVAMENTE si, además, se permite conocimiento general del modelo
que ninguna fuente curricular respalda:

| Switch | Fuentes disponibles |
|---|---|
| OFF | tópico actual + resto del curso |
| ON | tópico actual + resto del curso + conocimiento general del modelo |

`TUTOR_PROMPT_VERSION`: `tutor-v3.3` → `tutor-v4`. La clasificación de
los tres ejes es ahora universal (antes solo se agregaba en modo
ampliado); lo único que sigue siendo exclusivo del modo ampliado es la
regla de "conocimiento general como último recurso".

### Provenance UX: de dónde viene cada parte de la respuesta

El alumno ahora distingue visualmente, sin ver nunca un `SRC-XXX` ni un
`COURSE-SRC-XXX`:

- **"Basado en este tema"** — la parte de la respuesta grounded en el
  tópico actual.
- **"Basado en el curso"** — la parte grounded en otro tópico del mismo
  curso, con una sección compacta **"Temas relacionados"** debajo:
  módulo + tópico de origen, deduplicado por tópico (varios
  `SourceBlock`s del mismo tópico nunca producen más de un item) y en
  orden de relevancia real (nunca alfabético).
- **"Ampliado con conocimiento general"** — la parte sin respaldo
  curricular (solo posible con el switch activado). Nunca hereda fuentes
  del curso.

Una misma respuesta puede combinar los tres grupos simultáneamente, cada
uno con su propio contenido, sin mezclarse.

### "Ver tema relacionado": navegación real, sin routing nuevo

Cada tema relacionado tiene un CTA que reutiliza la navegación curricular
YA existente (`goToTopic`, la misma función de "Tema anterior/siguiente")
— cero sistema de routing nuevo. Como consecuencia, toda la limpieza que
ya disparaba un cambio de tópico normal llega gratis: se corta la voz
(navegador y neural, incluido el `AbortController` de v1.3.0), se
resetea el switch, se limpia cualquier animación pedagógica activa, y
**nunca se marca ningún tópico como completado** (ni el de origen ni el
de destino) — esa navegación jamás llama al ratchet de finalización, que
sigue siendo exclusivo de "Completar tema y continuar". Browser Back
funciona nativo (misma pila de historial de react-router).

La voz, corregida durante el hardening de este bloque, ahora incluye las
tres fuentes en orden (tópico actual → curso → conocimiento general) —
antes de la corrección, una respuesta cross-topic pura (sin
`answer_chunks`) quedaba en silencio total con la voz activada.

## Rendimiento del retrieval

Medido contra `spec-driven-design-expert` (53 tópicos, 1381 bloques,
696 buscables): escaneo completo del curso consistentemente entre
~0.6s y ~1.6s por consulta, sub-100ms a ~1s según el corpus cacheado por
el filesystem del container. Comparado contra la latencia del proveedor
LLM (1.2s–3.4s por llamada en QA real de este release), el retrieval
representa una fracción minoritaria del tiempo total de respuesta — no
se agregó ningún cache nuevo, decisión explícita respaldada por
medición real, no preventiva.

## Hardening del release candidate

Auditoría del diff acumulado completo (`v1.3.0..HEAD`, los tres
bloques). Dos hallazgos reales corregidos, ambos durante la inspección
del Bloque 3 (provenance UX), no durante este hardening final:

- **Voz incompleta**: la secuencia de texto leída en voz alta omitía
  `course_answer_chunks` — una respuesta cross-topic pura quedaba muda
  pese a mostrar contenido real en pantalla. Corregido; test de
  regresión agregado para las 6 combinaciones de canales posibles.
- **Copy obsoleto**: dos textos (el hint del switch, "El tutor responde
  únicamente en base al contenido de este tema", y el mensaje fijo de
  `not_covered`) seguían implicando que el switch apagado limitaba el
  tutor a un solo tema — ya no es cierto desde que el resto del curso
  está disponible incondicionalmente. Corregidos.

El resto de la auditoría de este hardening final (tokenizer/scoring de
retrieval, determinismo, identidad de fuentes, validación de refs,
invariantes del contrato estructurado, matrices switch OFF/ON completas,
deep provenance verificada byte a byte contra el `SourceBlock` original,
regresión de Skill (3 corridas reales consistentes), prompt injection
(usuario + `SourceBlock` del tópico actual + `SourceBlock` de COURSE
EVIDENCE), privacidad/logging seguro, seguridad (sin
`dangerouslySetInnerHTML`/`eval`/`new Function`, sin construcción de
paths desde input de usuario), aislamiento de Certification/Checkpoint/
Lesson Generation, overflow mobile con títulos de peor caso,
accesibilidad por teclado) **no encontró hallazgos nuevos** — ya estaba
correctamente cerrada por los tres bloques de desarrollo. 585 tests de
backend y 443 de frontend pasando (sin regresiones); build de producción
limpio; build Docker `--no-cache` limpio; `doctor.ps1` → "Todo en
orden."

## Qué NO afirma este release (límites honestos)

- **Retrieval puramente lexical, sin comprensión semántica**: no hay
  embeddings, no hay vector DB, no hay búsqueda por similitud semántica
  en ningún punto. Sinónimos sin overlap léxico ("existing repository"
  vs. "repositorio existente") pueden no encontrarse — confirmado de
  nuevo en QA real de este hardening, documentado como límite conocido y
  aceptado, no resuelto con más ingeniería.
- **Cross-language lexical mismatch**: una pregunta en un idioma
  distinto al del contenido del curso puede no recuperar evidencia real
  existente, aunque el tema esté cubierto en el idioma del curso.
- **`course_coverage` sigue siendo un juicio del LLM**, no una regla
  determinística de negocio: que el retrieval encuentre candidatos no
  garantiza que el modelo los use — y viceversa, el modelo puede (en
  casos límite) subestimar evidencia real. El retrieval hace candidate
  generation determinística; la clasificación final de cobertura sigue
  siendo responsabilidad del LLM, con la misma variabilidad inherente ya
  documentada para `topic_coverage` desde v1.3.0.
- **El conocimiento general puede no estar actualizado**: es exclusivamente
  el conocimiento de entrenamiento del modelo configurado, nunca
  información en tiempo real ni verificable externamente. No hay
  búsqueda web en ningún modo.
- **No hay garantía de relevancia perfecta** ni de que TODO tópico
  relevante del curso sea recuperado — el retrieval devuelve los `top_k`
  candidatos con mayor score lexical, no una búsqueda exhaustiva
  garantizada.
- **No** hay RAG como plataforma, no hay índice vectorial persistente, no
  hay un servicio de retrieval separado — todo corre in-process, síncrono,
  dentro del mismo request HTTP del tutor.
- Sin LMS, sin soporte multi-usuario, sin progreso en la nube, sin
  predicción de resultado de examen real (sin cambios respecto a
  releases anteriores).

## Notas de actualización (v1.3.0 → v1.4.0)

- **Sin migración de base de datos** (el proyecto no usa una).
- **Sin migración de cursos**: el formato de Markdown/frontmatter no
  cambió; los cursos existentes funcionan sin ninguna modificación.
- **Sin infraestructura nueva**: ningún vector DB, ningún índice nuevo,
  ningún servicio adicional. El retrieval course-wide se computa on
  demand desde los archivos del curso actuales, en cada consulta.
- `APP_VERSION`: `1.3.0` → `1.4.0` (`backend/app/config.py`,
  `docker-compose.yml`, `.env.example`).
- `LESSON_PROMPT_VERSION`: sin cambios, sigue en `lesson-v3.3.1`. Las
  caches de `LessonPlan` existentes se conservan intactas.
- `TUTOR_PROMPT_VERSION`: `tutor-v3.3` → `tutor-v4`. El tutor nunca se
  cachea (no participa de ninguna cache key), así que este cambio no
  invalida nada — solo trazabilidad/auditoría.
- **El comportamiento por defecto (switch apagado) cambia de alcance,
  no de superficie de configuración**: antes del switch, el modo
  estricto era "solo el tópico actual"; ahora es "el tópico actual +
  el resto del curso, nunca conocimiento general" — no hace falta
  ninguna acción del alumno ni del operador para beneficiarse de esto,
  funciona incondicionalmente en cuanto se actualiza el backend.
- Ningún endpoint HTTP nuevo, ningún endpoint eliminado. El contrato
  público de `POST .../tutor` gana dos campos opcionales y backward
  compatible (`course_answer_chunks`/`course_sources`, default `[]`) —
  un cliente que no los lea sigue funcionando exactamente igual que
  contra v1.3.0.
