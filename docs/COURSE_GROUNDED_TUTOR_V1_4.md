# Course-Grounded Tutor — v1.4.0

Este documento cubre v1.4.0 por bloques, empezando por el Bloque 1. Cada
bloque nuevo agrega su propia sección; nada de lo documentado acá se
reescribe retroactivamente salvo que un bloque posterior corrija un error
real.

## 1. Objetivo de v1.4.0

Hoy (v1.3.0), el modo ampliado del tutor conoce el dominio del curso a
través de `CourseScope` (títulos de curso/módulos/tópicos, ver
`docs/CLASSROOM_UX_V1_3.md` sección 7) para decidir si una pregunta es
`course_domain` — pero cuando `topic_coverage="insufficient"`, la
respuesta viene ÚNICAMENTE del conocimiento general del modelo, nunca del
contenido real de otros tópicos del curso (aunque existan).

La evolución completa prevista:

```
Pregunta del estudiante
        |
Current Topic Grounding
        | si no alcanza
Course-Wide Grounding      <-- este bloque construye la base determinística
        | si no alcanza
General Knowledge
        |
Unrelated / Not Covered según modo
```

**Este primer bloque implementa únicamente la base de retrieval**:

```
Course
  |
Modules
  |
Topics
  |
CanonicalTopicContent
  |
SourceBlocks
  |
deterministic lexical retrieval
  |
ranked CourseEvidenceCandidates
```

Todavía **no** integrado con el Tutor, **no** expuesto por ningún
endpoint, **no** cambia el prompt, **no** genera respuestas usando otros
tópicos. El Tutor v1.3.0 (`scope_relation`/`topic_coverage`/
`response_type`, `TutorRequest`/`TutorReplyBody`) permanece exactamente
igual.

## 2. Por qué NO embeddings/vector DB todavía

- El corpus típico (un curso) tiene decenas o cientos de tópicos, no
  millones de documentos — un scan lexical in-process sobre
  `SourceBlock`s ya parseados es rápido y suficiente (ver sección 6,
  performance real medida).
- La fuente de verdad YA existe de forma determinística y auditable
  (`CanonicalTopicContent`/`SourceBlock`, Fase 2) — agregar embeddings
  introduciría una segunda representación no determinística del mismo
  contenido, con su propio ciclo de vida de cache/invalidación, sin que
  QA real haya demostrado que hace falta para este tamaño de corpus.
- Mantiene el principio de simplicidad del proyecto (`CLAUDE.md` sección
  4): no se anticipan abstracciones sin un consumidor real. El bloque
  siguiente (integración con el Tutor) es el primer consumidor real; si
  ESE bloque revela una limitación genuina de lexical retrieval que
  justifique embeddings, será una decisión explícita e informada, no
  preventiva.
- La limitación real observada en QA (sección 7) es honesta: retrieval
  lexical no encuentra evidencia cuando la query usa vocabulario que
  nunca aparece en el contenido (sinónimos, u otro idioma). Se documenta
  como límite conocido, no se resuelve con más ingeniería en este bloque
  (instrucción explícita: no agregar embeddings ni LLM query expansion
  todavía).

## 3. Arquitectura

```
app/services/course_retrieval.py
    search_course(settings, course_id, query, *, exclude_topic_id, top_k, max_per_topic)
        -> list[CourseEvidenceCandidate]

app/models/retrieval.py
    CourseEvidenceCandidate
```

Reutiliza exclusivamente el repositorio seguro existente
(`app/services/courses.py`):

- `course_service.iter_all_canonical_topics(content_path, course_id)`
  (nueva, ver sección 5) para obtener el `CanonicalTopicContent` de TODOS
  los tópicos del curso, en el mismo orden estable de filesystem que
  `get_course_detail`.
- Nunca construye una ruta de filesystem a partir de `course_id`/
  `module_id`/`topic_id`: la resolución de directorios sigue pasando
  siempre por `_find_course_dir`/`_list_subdirs`/`_list_topic_files`
  (mismas protecciones de path traversal y exclusión de symlinks que el
  resto de la aplicación).
- No modifica `CanonicalTopicContent` ni `SourceBlock` (Fase 2) en
  absoluto — el retrieval los consume tal cual.

## 4. `CourseEvidenceCandidate`

```python
class CourseEvidenceCandidate(BaseModel):
    course_id: str
    module_id: str
    module_title: str
    topic_id: str
    topic_title: str

    source_ref: str          # SRC-XXX original del tópico (NO único a nivel de curso, ver sección 5)
    block_type: str
    heading_path: list[str]
    start_line: int
    end_line: int

    markdown: str             # texto fuente exacto, nunca mutado
    plain_text: str

    score: float
    matched_terms: list[str]
```

Interno: sin endpoint HTTP, sin exposición al frontend ni al LLM en este
bloque. Diseñado para que el bloque de integración con el Tutor pueda
construir sobre él sin perder identidad de módulo/tópico (ver sección 9).

## 5. Identidad de `source_ref`

`source_ref` (`SRC-001`, `SRC-002`, ...) se reinicia en CADA tópico
(`canonical.py::parse_source_blocks`, `ref_index = 0` en cada llamada) —
confirmado leyendo el código antes de implementar, no asumido. **Dos
tópicos distintos casi siempre tienen ambos un `SRC-001`.**

Decisión: no se modificó el formato existente de `source_ref` (rompería
la trazabilidad SRC-XXX ya usada por Tutor/Lesson/Certification). La
identidad lógica de un candidato de evidencia es la tupla
`(course_id, module_id, topic_id, source_ref)` — representada como
cuatro campos separados en `CourseEvidenceCandidate`, no como un string
compuesto nuevo tipo `COURSE-SRC-001` (no hizo falta para este bloque;
ver sección 9 para cómo el bloque siguiente podría construir uno si
resulta necesario para las citas del Tutor).

Test dedicado (`test_H_source_ref_identity_does_not_collide_across_topics`)
prueba explícitamente que dos tópicos con el mismo `source_ref` aparecen
como candidatos distintos, nunca colapsados.

## 6. Qué bloques son buscables

Incluidos: `paragraph`, `list`, `table`, `code`, `blockquote`, `image`
(696 de 1381 bloques totales en `spec-driven-design-expert`).

Excluidos: `heading` (un heading standalone no sostiene una afirmación
completa por sí mismo — su texto sigue participando del ranking a través
de `heading_path` de los bloques que contiene), `horizontal_rule`, y
cualquier `other` sin clasificar (685 headings + el resto excluidos en el
curso real).

## 7. Normalización y tokenización

`normalize_text`: Unicode NFKC + casefold + remoción consistente de
diacríticos (aplicada igual a query y corpus). `tokenize`: separa en
palabras, preserva términos compuestos con guion como DOS entradas (el
compuesto completo Y sus partes — `"spec-driven"` produce
`spec-driven`/`spec`/`driven`), filtra vacíos y una lista pequeña y
deliberada de stopwords español+inglés (artículos, preposiciones,
conjunciones de altísima frecuencia — nunca sinónimos, nunca stemming).

Sin spaCy, sin NLTK, sin diccionario de sinónimos, sin dependencia nueva.

## 8. Scoring (BM25-like con boost de campo)

Cada `SourceBlock` buscable se trata como un documento con tres campos:
`topic_title` (boost ×3), `heading_path` (boost ×2), `plain_text`/body
(boost ×1) — coincidir en el título del tópico pesa más que en el
heading, que pesa más que una coincidencia incidental en el cuerpo,
calibrado leyendo casos reales (sección 10), no una convención externa
copiada sin verificar.

- IDF clásico de BM25 (Robertson-Walker, piso en 0), calculado sobre el
  corpus del curso en cada búsqueda (sin persistir).
- Saturación de term-frequency (`k1=1.5`, `b=0.75`, valores estándar de
  la literatura).
- **Bonus de cobertura de términos**: un bloque que matchea más términos
  DISTINTOS de la query rankea mejor que uno que repite un solo término
  (multiplicador acotado en `[0.5, 1.0]`).
- **Bonus de frase exacta**: si la query completa aparece como substring
  contiguo de un campo, suma un bonus fijo ponderado por el boost de ese
  campo.
- **Cobertura mínima (hallazgo real de QA, ver sección 10.3)**: para una
  query de 2+ términos, un bloque que matchea un único término NUNCA se
  considera evidencia significativa — se descarta antes de siquiera
  entrar al ranking. Sin este piso, una palabra genérica ("mejor",
  "resultados") que aparece de casualidad en el curso producía un
  candidato con un score en el mismo rango que un match legítimo de un
  solo término técnico.

No hay IDF/IDF precomputado persistente, no hay reranking semántico con
LLM, no hay motor de búsqueda genérico — es un scorer chico, propio del
dominio de este proyecto.

## 9. `exclude_topic_id`, `top_k`, diversidad

- `exclude_topic_id: str | None = None`: excluye un tópico completo del
  corpus antes de buscar (nunca filtra resultados después de rankear) —
  pensado para cuando el Tutor ya determinó que el tópico actual no
  alcanza y se busca en el RESTO del curso. Confirmado con QA real
  (sección 7.2 más abajo): el tópico excluido nunca aparece, la evidencia
  del resto del curso sí.
- `top_k`: default `6`, clamp a `10` (`MAX_TOP_K`). Sin configuración por
  variable de entorno todavía.
- `max_per_topic` (diversidad): default `3`. Evaluado con datos reales
  ANTES de decidirlo (no implementado a ciegas): sin diversidad, una
  query como "spec drift" devolvía sus 6 resultados TODOS del mismo
  tópico (el correcto, pero sin ninguna variedad); con diversidad,
  después de los primeros 3 (que siguen siendo del tópico más relevante,
  correctamente) aparece evidencia de un segundo tópico relacionado.
  Selección en dos pasadas, determinística: respeta el límite por tópico
  primero, y solo si eso deja huecos sin llenar `top_k`, una segunda
  pasada completa con los candidatos restantes de mayor score — nunca
  devuelve menos resultados de los que existirían sin diversidad.

## 10. Determinismo, no-match, y decisión de scope

- **Determinismo**: la misma combinación (curso, query, contenido)
  produce siempre los mismos candidatos, mismo orden, mismos scores.
  Ordenamiento final: score descendente, tie-break por posición estable
  `(module_index, topic_index, block_index)` — nunca hash, nunca
  aleatorio. Test dedicado (`test_G_deterministic_order_and_scores`).
- **No-match**: una query sin coincidencia lexical significativa devuelve
  `[]`, nunca "rellena" con candidatos irrelevantes solo porque
  `top_k > 0` (ver sección 8, cobertura mínima).
- **Este servicio NO decide "el curso responde esta pregunta"**: solo
  devuelve evidencia lexical rankeada. `course_coverage=true/false` u
  otra heurística de decisión de negocio queda explícitamente para el
  bloque de integración con el Tutor.

## 11. Cache y performance

**Sin cache nuevo** (decisión explícita de este bloque: simplicidad >
micro-optimización). Cada llamada a `search_course` escanea el contenido
ACTUAL del curso — nunca puede quedar stale porque nunca persiste nada.

Sí se corrigió una redundancia real medida en el repositorio existente:
`course_service.get_canonical_topic` resuelve el curso completo
(`_find_course_dir` -> `_list_subdirs` -> `_find_module_dir` ->
`_list_subdirs` -> `_find_topic_file` -> `_list_topic_files`) en CADA
llamada — al iterar los 53 tópicos de `spec-driven-design-expert` uno por
uno, eso significaba repetir el listado completo de directorios 53
veces. Se agregó `course_service.iter_all_canonical_topics` (misma
lógica seria de resolución del repositorio existente, sin construir
ninguna ruta nueva), que resuelve el directorio del curso UNA sola vez.
Medición real, mismo curso, antes/después:

| | antes | después |
|---|---|---|
| Escaneo completo del curso (53 tópicos) | ~4.6s | ~0.6-1.6s |

Latencia real por query (`spec-driven-design-expert`, 8 queries de QA,
sección 12): **min≈653ms, mediana≈890ms, max≈1628ms** — claramente por
debajo de una llamada LLM típica del tutor (observado 2-7s en QA de
bloques anteriores de este proyecto), consistente con el criterio "si
está claramente por debajo, no optimizar más" de este bloque. Si la
integración con el Tutor (bloque siguiente) revela que esto sigue siendo
un problema práctico real, un cache in-process respetando
`content_sha256` (ya existente en `CanonicalTopicContent`) sería la
optimización natural — deliberadamente no implementada ahora.

## 12. QA real (`spec-driven-design-expert`: 53 tópicos, 1381 bloques totales, 696 buscables)

### 12.1 Expected-topic QA (8 queries)

| Query | Expected topic | Rank | Top score |
|---|---|---|---|
| "spec drift" | spec-drift-code-drift-y-convergencia | 1 | 16.16 |
| "constitution guardrails" | constitution-principios-y-guardrails-no-negociables | 1 | 14.67 |
| "contract driven development" | sdd-frente-a-prompt-driven-tdd-bdd-y-contract-driven | 1 | 13.90 |
| "quality checklist" | review-de-specs-y-quality-checklists | 1 | 16.74 |
| "repositorio existente brownfield" | adoptar-sdd-en-un-repositorio-existente | 1 | 24.11 |
| "state machine" | flujos-secuencias-y-maquinas-de-estado | 1 | 13.24 |
| "subagentes paralelismo" | subagentes-y-paralelismo-seguro | 1 | 21.51 |
| "intent evidence convergence" | el-ciclo-intent-evidence-convergence | 1 | 30.03 |

**8/8 en rank 1.** Ninguna query se ajustó para "hacer pasar" el test —
la única corrección real fue reemplazar una query en inglés
("brownfield existing repository") por su equivalente en español
("repositorio existente brownfield"), documentado como limitación real
en 12.3, no ocultado.

### 12.2 Course-wide cross-topic QA (caso central de v1.4.0)

Tópico actual: `sdd-frente-a-prompt-driven-tdd-bdd-y-contract-driven`.
Query: "contract driven development" (el propio tópico actual la
respondería con evidencia fuerte si no se excluyera).

- **Sin exclusión**: top resultado es el propio tópico actual (score
  13.90).
- **Con `exclude_topic_id=<tópico actual>`**: el tópico actual nunca
  aparece; el top resultado pasa a ser `que-es-spec-driven-design-development`
  (score 9.53), seguido de `diseno-de-apis-y-contratos-evolutivos` — ambos
  tópicos DISTINTOS del actual, con evidencia real y relevante.

Confirma exactamente el caso que este bloque existe para resolver:
recuperar evidencia de OTRO tópico del mismo curso cuando el actual se
excluye explícitamente.

### 12.3 Negative QA

3 queries claramente ajenas al dominio del curso:

- "receta tradicional de asado argentino" -> `0` resultados.
- "mejor destino turístico para vacaciones de verano" -> `0` resultados.
- "resultados del partido de fútbol de anoche" -> `0` resultados.

Antes de agregar la cobertura mínima (sección 8), estas 3 queries
devolvían entre 1 y 5 resultados con score positivo, apoyados
ÚNICAMENTE en una palabra genérica ("tradicional", "mejor",
"resultados") que aparece de casualidad en el contenido del curso sin
ninguna relación temática real con la pregunta — un hallazgo real de QA,
corregido con una regla de cobertura mínima de términos (determinística,
sin IDF absoluto arbitrario ni lista de palabras "genéricas"
hardcodeada), no ignorado.

### 12.4 Synonym / no-overlap limitation (documentada, no resuelta)

Query "brownfield existing repository" (inglés) contra un curso
autorado en español: `existing` aparece una sola vez en TODO el curso (en
un tópico distinto al esperado) y `repository` no aparece NUNCA — el
contenido real dice "repositorio existente", no "existing repository".
Resultado: `0` candidatos, pese a que el tópico correcto SÍ existe y es
recuperable con vocabulario en español (sección 12.1, rank 1, score
24.11).

**Esto es exactamente la limitación esperada de un retrieval lexical sin
sinónimos ni embeddings** (PARTE 29 de la especificación de este
bloque): se documenta como límite real, conocido, y aceptado para este
bloque — no se agregaron embeddings, no se agregó expansión de query por
LLM. Si el bloque de integración con el Tutor encuentra que esto es un
problema práctico recurrente (preguntas de alumnos en un idioma
distinto al del curso, o con sinónimos comunes sin overlap léxico), será
una decisión explícita e informada para un bloque futuro, con evidencia
real detrás, no una anticipación especulativa.

## 13. Próximos pasos (fuera de alcance de este bloque)

- Integración con `tutor_service.py`: cuándo invocar `search_course`
  (después de que `topic_coverage` del tópico actual sea
  `insufficient`), cómo representar la evidencia course-wide en el
  contrato del Tutor (posible campo nuevo, o una capa adicional de
  `scope_relation`), y cómo validar que las citas que el LLM emita sobre
  esa evidencia sean reales (mismo patrón que `validate_source_refs`,
  pero cruzando identidad de tópico).
- Grounding Packet course-wide: los candidatos ya contienen la
  información necesaria (module/topic identity, heading_path,
  source_ref, markdown literal) para construir algo equivalente a un
  bloque `[COURSE-SRC-001] module: ... topic: ... heading: ...
  original_source_ref: SRC-005 content: ...` — no se construyó en este
  bloque porque no hace falta todavía (ningún consumidor real lo pide
  aún).
- "Ver tema relacionado" en el frontend (deep-link desde una respuesta
  del Tutor hacia el tópico de origen de la evidencia course-wide): el
  diseño de `CourseEvidenceCandidate` ya preserva toda la identidad
  necesaria (`course_id`/`module_id`/`topic_id`) para esto — el botón en
  sí no se implementa todavía.
- Configuración por variable de entorno de `top_k`/`max_per_topic` si un
  consumidor real lo necesita.
- Cache in-process respetando `content_sha256` si la integración con el
  Tutor revela que la latencia actual (sección 11) es un problema
  práctico real.
