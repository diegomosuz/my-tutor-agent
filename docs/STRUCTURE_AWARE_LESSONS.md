# Structure-Aware Lesson Generation (v1.3.0, Bloque 3)

Este bloque implementa las conclusiones de un diagnóstico previo
("Rich Markdown → Visual Lesson", ejecutado sin tocar código) que
encontró, con evidencia real contra el curso `spec-driven-design-expert`
y el proveedor configurado (`gpt-4o-mini`), que bloques estructurados del
Markdown (tablas, imágenes, código, procesos ordenados) llegaban al LLM
con su sintaxis literal intacta pero sin ninguna etiqueta explícita de
tipo, y en la práctica desaparecían de la `LessonPlan` con más frecuencia
de la esperada — un caso concreto (una tabla comparativa real, 5×3)
desapareció en 3/3 generaciones frescas, no por falta de espacio en el
packet (~880 tokens totales, lejos de cualquier límite) sino por
decisiones del modelo sobre qué priorizar dentro de un presupuesto de
escenas bajo.

## 1. Diagnóstico precedente (resumen)

- El parser (`markdown-it-py`) reconoce correctamente tablas, código,
  imágenes, listas ordenadas/no ordenadas, blockquotes y headings.
- `SourceBlock.markdown` preserva el Markdown literal completo de cada
  bloque (pipes de tabla, fences de código, sintaxis `![]()`, numeración
  de listas) — nunca se pierde a nivel de contenido.
- `build_grounding_packet` (antes de este bloque) solo emitía
  `[SRC-XXX]` + el Markdown crudo, sin ningún campo `type`/`heading_path`
  explícito — el LLM tenía que re-descubrir "esto es una tabla" leyendo
  sintaxis cruda, sin ninguna etiqueta.
- `SourceBlock.block_type` colapsa `ordered_list_open`/`bullet_list_open`
  al mismo valor `"list"` — la ordinalidad solo es recuperable releyendo
  el Markdown crudo (que sí la conserva).
- No existe truncamiento de ningún tipo: el packet completo, siempre.
- El heading "Desarrollo técnico" (presente en las 53 tópicos de este
  curso, por ser una plantilla uniforme) se asociaba con `scene_type`/
  `visual_type="process"` en 12/12 tópicos auditados, incluso cuando el
  contenido real de esa sección eran principios paralelos sin orden
  temporal — el modelo llegó a fabricar `process_steps` con ordinalidad
  falsa (paso 1 → paso 2) para contenido que la fuente nunca presenta
  como secuencial.
- Distribución real observada (12 tópicos, 52 escenas, `lesson-v3.2.1`):
  `bullets` 28.8%, `none` 23.1%, `process` 23.1%, `hero` 9.6%, `image`
  5.8%, `table` 3.8%, `hierarchy` 1.9%, `code` 1.9%, `quote` 1.9%,
  `comparison`/`architecture`/`concept_map` 0% cada uno. Solo 13/52
  (25%) de las escenas eran elegibles para Pedagogical Animations
  (v1.2.0) — el resto (bullets/none/table/code/quote/image) no tiene
  reveal progresivo, lo que explica la percepción de "no veo
  animaciones".

Ver la conversación de diagnóstico original para el detalle completo
(inventario Markdown, trace RAW→AST→Canonical→SourceBlock→Packet,
opportunity matrix por tópico) — no se generó un documento separado para
esa fase porque fue puramente de lectura/instrumentación, sin cambios de
código.

## 2. Cambio 1: metadata estructural mínima en el Grounding Packet

`canonical.py::build_grounding_packet` gana un parámetro
`include_structural_metadata: bool = False`. Cuando es `True`, cada
sección `[SRC-XXX]` antepone al Markdown literal (que sigue viajando
COMPLETO, sin ningún recorte) unas pocas líneas puramente descriptivas,
derivadas 100% determinísticamente de lo que el propio parser ya sabía en
tiempo de parseo — nunca un análisis nuevo, nunca una relación inferida:

```
[SRC-015]
type: table
heading_path: SDD frente a Prompt-Driven, TDD, BDD y Contract-Driven > Ejemplo aplicado
| Práctica | Pregunta principal | Artefacto típico |
|---|---|---|
| SDD | ¿Qué debemos construir y por qué? | spec / plan / tasks |
...
```

```
[SRC-015]
type: code
lang: yaml
heading_path: Contratos, modelos de datos y artefactos de interfaz > Ejemplo aplicado
```yaml
POST /v1/reports
...
```
```

- `type`: siempre presente, el mismo `SourceBlock.block_type` de siempre
  (heading/paragraph/list/blockquote/table/code/image/horizontal_rule/other).
- `list_kind` (`ordered`/`unordered`/`task`): solo para `type: list`,
  derivado mirando el marcador del primer ítem de la lista en el
  Markdown literal — sin heurísticas de contenido, sin tocar
  `SourceBlock` (PARTE 4 de la especificación evaluó agregar esto como
  campo del modelo canónico y decidió que NO era necesario: alcanza con
  derivarlo on-the-fly en el momento de serializar el packet, ver
  `canonical.py::_detect_list_kind`).
- `lang`: solo para `type: code` con un identificador de lenguaje
  declarado en la línea de apertura del fence (` ```python `); un bloque
  de código indentado o sin lenguaje simplemente omite este campo
  (`canonical.py::_detect_code_lang`).
- `heading_path`: serializado como `A > B > C` (el formato más simple
  posible, nunca una estructura JSON anidada dentro del prompt) — omitido
  cuando está vacío.

**Alcance deliberadamente acotado**: este parámetro es exclusivo de
`lesson_generator.py` (el único llamador que pasa
`include_structural_metadata=True`). El tutor, los checkpoints, la
certificación y el endpoint de inspección `/grounding` siguen llamando a
`get_grounding_packet` sin este argumento (default `False`) y reciben el
packet exactamente byte-por-byte igual que antes de este bloque —
verificado con un test dedicado
(`test_metadata_disabled_by_default_matches_historical_packet`) y con una
comprobación directa contra el proveedor real. Esto respeta al pie de la
letra la restricción "NO tocar Tutor / NO tocar Classroom UX" del bloque.

## 3. Cambio 2: prompt versionado (`lesson-v3.3`)

`LESSON_PROMPT_VERSION` pasa de `lesson-v3.2.1` a `lesson-v3.3` (cambia
la cache key por diseño; las caches `v3`/`v3.1`/`v3.2`/`v3.2.1` se
conservan intactas en el filesystem, nunca se borran). **Hallazgo real
durante la implementación**: `.env`, `.env.example` y el fallback de
`docker-compose.yml` tenían `LESSON_PROMPT_VERSION=lesson-v3.2.1`
hardcodeado como variable de entorno — el mismo patrón de bug ya
documentado en `CLAUDE.md` (v1.1.0): un test (`test_H_default_lesson_...`)
detectó que el código traía `lesson-v3.3` pero el runtime real seguía
sirviendo `lesson-v3.2.1` porque la variable de entorno pisaba el default
de Python. Corregido en los 3 archivos — ver sección 8.

### REGLA 7 reformulada (scene budget)

Antes, "3 a 8 escenas" sonaba a objetivo de compresión. Ahora es
explícitamente un rango típico observado, nunca una meta: si hay bloques
estructurados de alto valor (tabla/imagen/código/proceso real) que no
entran en 8 escenas sin sacrificarlos, la instrucción es preferir
superarlas levemente antes que descartarlos, y consolidar primero
contenido textual secundario (recapitulaciones parciales, reflexiones,
"errores frecuentes" ya cubiertos implícitamente). Explícitamente
también aclara que esto NO significa una escena por `SourceBlock`.

### REGLA 21 (nueva): bloques estructurados son evidencia de alto valor

Cubre, en este orden:

1. **Vocabulario de la metadata nueva** (`type`/`list_kind`/`lang`/
   `heading_path`) y su naturaleza puramente descriptiva.
2. **No desaparecer en silencio**: tabla/imagen/código relevantes tienen
   que sobrevivir citados en el `source_refs` de alguna escena.
3. **El heading da contexto, nunca determina `visual_type`**: ejemplo
   genérico explícito de que un heading "Desarrollo técnico" o
   "Arquitectura" no implica automáticamente `process`/`architecture` si
   el contenido real no lo sostiene.
4. **Process requiere orden explícito en el CONTENIDO**, con la lista
   exacta de señales válidas (numeración, palabras de secuencia,
   dependencia causal, `flows_to`) — el orden de aparición en el
   documento NUNCA es orden temporal por sí solo.
5. **Guía por tipo** para tabla/imagen/código/blockquote/checklist —
   ver sección 4 para el detalle de tabla, que resultó ser el punto más
   delicado de todo el bloque.
6. **Regla dura de cobertura de tablas**: un chequeo explícito, tipo
   checklist, que el modelo debe hacerse a sí mismo antes de responder
   ("¿cada bloque `type: table` aparece citado en alguna escena?").

## 4. El hallazgo más importante de la implementación: tabla vs. comparison

La hipótesis inicial (permitir que una tabla real se represente como
`table` O `comparison` según su propósito, igual que ya decía REGLA 14
desde `lesson-v3.2`) resultó ser la causa raíz de un fallo sistemático de
**contrato**, no de selección. `ComparisonPlan.rows` exige que cada fila
tenga exactamente la misma cantidad de valores que `column_labels`
(validación pre-existente de v1.1.0/v1.2.0, no tocada en este bloque). El
patrón más común de una tabla real es "una fila por entidad, una columna
por atributo" — para expresar eso como `comparison`, las entidades deben
pasar a ser `column_labels` y cada atributo original debe convertirse en
una fila de `rows` (una transposición completa). El modelo probado
(`gpt-4o-mini`) intentó esa transposición de forma consistentemente
incorrecta: declaraba `column_labels` con los nombres de las entidades
pero conservaba `rows` con la forma original de la tabla (una fila por
entidad, con solo los valores de atributo) — un desajuste de longitud
que Pydantic rechaza correctamente en cada intento, agotando los
reintentos.

**QA real de esto** (contra el proveedor configurado, sin fakes):
sucesivas rondas de refuerzo del prompt —incluyendo un ejemplo de
transposición completamente genérico embebido en REGLA 14, una excepción
explícita a la regla de "coherencia scene_type/visual_type", y una regla
dura "nunca comparison para una tabla real"— mostraron que el modelo
seguía intentando `comparison` para esta tabla en una fracción real de
los intentos, incluso con la instrucción explícita "NUNCA, sin
excepción" repetida en tres lugares distintos del prompt. Se identificó
además una contradicción real y no intencional: la matriz semántica de
referencia rápida al inicio de REGLA 14 (la primera guía que el modelo
lee) todavía recomendaba "comparison en modo tabla" para tablas de
contraste — una instrucción más temprana y más fuerte que las
correcciones agregadas después. Se corrigió esa matriz para eliminar la
recomendación de `comparison` para cualquier tabla real, dejando `table`
como la única opción para bloques `type: table`, sin excepción, en las
tres menciones del prompt (matriz semántica, bullet de REGLA 14, y REGLA
21).

**Resultado final medido** (7 generaciones frescas del caso crítico,
proveedor real, tras la corrección de la matriz semántica): 4/7
generaciones completaron exitosamente, y **4/4 de las que completaron
preservaron la tabla correctamente como `visual_type="table"`** (una de
ellas con `scene_type="comparison"` + `visual_type="table"`, exactamente
la excepción de coherencia diseñada a propósito). Las 3/7 generaciones
que fallaron lo hicieron con un error 422 explícito y honesto ("no se
pudo generar una lección válida") — nunca con una `LessonPlan` que omite
la tabla en silencio, que era el comportamiento original documentado en
el diagnóstico (0/3 en la línea base, la tabla SIEMPRE desaparecía sin
ningún error visible). Este es un cambio de naturaleza del fallo, no solo
de frecuencia: de "silenciosamente incompleto" a "explícitamente
reintentable" (el botón "Regenerar clase con IA" ya existente en el aula
cubre este caso sin cambios adicionales).

**Limitación conocida, no bloqueante**: el modelo probado no logra el
100% de éxito en el primer intento para esta tabla específica (5
entidades × 2 atributos, contenido de comparación de metodologías).
Resolver esto de forma más confiable requeriría, en un bloque futuro,
relajar `ComparisonPlan.rows` para tolerar la forma "fila = entidad,
con un valor de identificación + N atributos" sin exigir la
transposición completa — un cambio de `VisualPlan`/schema explícitamente
fuera de alcance de este bloque ("NO cambiar VisualPlan schema
todavía"). Documentado acá para una futura iteración, mismo patrón que
otras deudas conocidas del proyecto (ver `CLAUDE.md` sección 14).

## 5. QA real — casos críticos

### Caso 1: tabla comparativa (`sdd-frente-a-prompt-driven-tdd-bdd-y-contract-driven`)

Ver sección 4. 4/7 generaciones exitosas, 4/4 de ellas con la tabla
preservada como `table`.

### Caso 2: imagen explicativa (`el-ciclo-intent-evidence-convergence`)

3 generaciones frescas: 2/3 exitosas, **ambas con la imagen preservada**
como `visual_type="image"` citando el `SRC` real de la imagen, Y con la
tabla de "Ejemplo aplicado" preservada como `table` en la MISMA
generación — confirmando que la estrategia de "una segunda escena para
otro bloque fuerte" (PARTE 22) funciona en la práctica: la sección
"Conceptos esenciales" (que en la línea base consolidaba lista + imagen
en una sola escena "hierarchy", perdiendo la imagen) ahora se separa en
dos escenas `concept` distintas cuando ambos elementos son relevantes.

### Caso 3: principios paralelos (`arquitectura-trazable-a-requisitos`)

1 generación fresca: la tabla de "Ejemplo aplicado" se preservó
correctamente como `table`. La sección "Desarrollo técnico" (3 principios
de diseño independientes: "Architecture by drivers", "Diagramas con
propósito", "Evitar premature distribution", sin ningún orden temporal
real entre ellos) siguió generando `scene_type="process"` con
`process_steps` numerados en esta muestra puntual — el "process guard"
de REGLA 21 no eliminó completamente este patrón para este caso concreto.
Reportado con honestidad: mejora real y medible en table/image/code
(sección 6), pero el guard de "no fabricar orden temporal falso" es una
mejora de PROMPT (probabilística, no una validación determinística) y no
se verificó consistente al 100% en esta única muestra.

### Caso 4: código relevante (`contratos-modelos-de-datos-y-artefactos-de-interfaz`)

1 generación fresca: el bloque de código (`type: code`, `lang: yaml`) se
preservó correctamente como `visual_type="code"`, citado literalmente.
Sin regresión respecto de la línea base (que ya usaba `code`
correctamente para este tópico).

## 6. Métrica principal: Structured Source Utilization

Por instrucción explícita del bloque, "menos bullets" NO es el KPI —
la métrica real es cuántos bloques estructurados disponibles
(tabla/imagen/código) terminan citados en al menos una escena.

| Constructo | Línea base (`lesson-v3.2.1`, 12 tópicos) | `lesson-v3.3` (11 tópicos, tras la corrección de la matriz) |
|---|---|---|
| Tabla | 2/4 tópicos con tabla real la usaron (50% miss) | 3/3 tópicos con tabla real la usaron (**0% miss**) |
| Imagen | 3/8 tópicos con imagen real la usaron (62.5% miss) | 3/7 tópicos con imagen real la usaron (57% miss — mejora modesta) |
| Código | prácticamente sin datos (1/52 escenas totales) | 6/7 tópicos con código real lo usaron (**14% miss**) |

`bullets`+`none` combinados: 51.9% (línea base) vs. 51.7% (`lesson-v3.3`)
— prácticamente sin cambio, confirmando que la mejora NO vino de "forzar
menos bullets" sino de redirigir contenido HACIA los tipos correctos
(tabla/código) que antes se perdían o se mal-representaban. `comparison`/
`architecture` siguen en 0% en la muestra de `lesson-v3.3` — `comparison`
nunca sobrevive una generación exitosa (siempre termina siendo
rechazada, ver sección 4); `architecture` sigue sin aparecer en ningún
tópico auditado. Escenas elegibles para Pedagogical Animation: 19.0%
(`lesson-v3.3`) vs. 25.0% (línea base) — una baja esperada y correcta,
no una regresión: gran parte de la mejora consistió en mover contenido
DESDE `process` (animable) HACIA `table`/`code` (no animables, por
diseño, ver v1.2.0) porque esa es la representación correcta, no la más
vistosa (ver PARTE 37 de la especificación: "no exigir un porcentaje
artificial... queremos mejor uso semántico, no animación por decoración").

## 7. Observabilidad (PARTE 25)

`lesson_generation_completed` ahora incluye dos conteos agregados y
seguros (nunca contenido pedagógico, nunca texto libre):

```
source_structured_counts={'table': 1, 'image': 1, 'code': 0, 'list': 4}
selected_visual_counts={'concept': ..., 'table': 1, 'image': 1, ...}
```

Permite, con el tiempo, medir en producción si el material estructurado
disponible en un tópico realmente se traduce en visuales estructurados,
sin necesitar QA manual repetida.

## 8. Bug real encontrado y corregido: `.env` pisaba `LESSON_PROMPT_VERSION`

Igual que en v1.1.0 (ver `CLAUDE.md`), `docker-compose.yml` reenvía
`LESSON_PROMPT_VERSION` como variable de entorno con un fallback
(`${LESSON_PROMPT_VERSION:-lesson-v3.2.1}` antes de este fix), y `.env`/
`.env.example` tenían el valor viejo hardcodeado — la variable de entorno
gana sobre el default de Python en `Settings`. Un test
(`test_H_default_lesson_prompt_version_is_not_lesson_v3`) detectó la
discrepancia real: el código decía `lesson-v3.3` pero el runtime seguía
sirviendo `lesson-v3.2.1`. Corregido en `.env`, `.env.example` y
`docker-compose.yml` (los 3 al valor nuevo) — verificado con
`GET /api/ai/status` devolviendo `prompt_version: "lesson-v3.3"` después
del fix.

## 9. Gaps de schema conocidos, no resueltos en este bloque

- **Checklist** (`list_kind: "task"`): sigue degradando a `bullets`, sin
  `visual_type` dedicado — documentado, no resuelto (PARTE 20).
- **Diagrama de texto/ASCII** (flechas `→` dentro de un párrafo): sin
  `SourceBlock` dedicado, sigue tratándose como texto — no se agregaron
  heurísticas (PARTE 21).
- **`ComparisonPlan.rows`**: no tolera la forma más común de tabla real
  (entidad-como-fila) sin una transposición completa — ver sección 4.
  Candidato de un bloque futuro, requiere cambiar el schema.
- **`VisualPlan` sigue siendo 1-visual-por-escena**: no se cambió la
  cardinalidad (PARTE 42). La estrategia de "una segunda escena para el
  segundo bloque fuerte" (PARTE 22) demostró ser suficiente en el caso 2
  (imagen + tabla en la misma generación, dos escenas distintas) — no se
  encontró evidencia concreta en este bloque que justifique cambiar la
  cardinalidad.

## 10. SemanticTeachingAnalysis: sigue siendo innecesario

Confirmado con evidencia nueva. El problema nunca fue que el LLM no
pudiera combinar estructura ya presente — era una combinación de (a)
falta de etiqueta explícita de tipo (resuelto con una línea de texto por
bloque, sin ningún análisis nuevo) y (b) un prompt con una contradicción
real no intencional (matriz semántica vs. reglas más específicas
agregadas después) más un scene-budget percibido como objetivo de
compresión. Ninguna de las dos causas requería ni requiere una capa
semántica adicional de LLM, embeddings, ni un segundo agente.

## 11. Alcance explícitamente NO tocado (Bloque 3)

`VisualPlan` (schema sin cambios), renderers del frontend, Pedagogical
Animations, Tutor (packet histórico intacto, verificado byte a byte),
Classroom UX, `TUTOR_PROMPT_VERSION` (sigue en `tutor-v3.1`), `APP_VERSION`
(sigue en `1.2.0`).

## 12. Generation Reliability (v1.3.0, Bloque 4 — `lesson-v3.3.1`)

Bloque 4 partió de un hallazgo real del Bloque 3: el caso crítico de la
tabla comparativa, aun con la tabla preservándose correctamente en TODAS
las generaciones exitosas, seguía terminando en un `422` explícito en
3/7 intentos frescos. Este bloque diagnosticó la causa raíz exacta y la
corrigió, sin tocar `VisualPlan`, sin agregar reintentos, sin agregar una
segunda llamada LLM.

### 12.1. Causa raíz exacta de los 3/7 `422`

Los 3 fallos compartían **el mismo patrón exacto**: `ComparisonPlan.rows`
con una cantidad de valores distinta a `column_labels` — es decir, el
modelo seguía intentando `visual_type="comparison"` para la tabla real
pese a la regla dura de `lesson-v3.3`. Auditando el prompt completo (no
solo la sección donde se agregó la regla) se encontró la causa raíz
real: la **matriz semántica de referencia rápida**, al inicio de REGLA
14 — la primera guía que el modelo lee, y la más influyente en la
práctica — todavía recomendaba `"comparison" en modo tabla` para tablas
de contraste. Las correcciones agregadas más abajo en el prompt (excepción
de coherencia scene_type/visual_type, regla dura explícita, ejemplo de
transposición) llegaban DESPUÉS de que el modelo ya hubiera anclado su
decisión en esa primera línea. Corregida la matriz (única mención de
"comparison en modo tabla" en todo el prompt, eliminada), el patrón de
fallo prácticamente desapareció — ver 12.4.

**Taxonomía de fallos observados** (Bloque 3, 3 generaciones `422`):

| Failure reason | Count | Attempt | Retry corrected? | Final 422? |
|---|---|---|---|---|
| `ComparisonPlan.rows` longitud inconsistente (contrato Pydantic) | 3/3 | 1 y 2 | No (mismo patrón se repitió) | Sí, las 3 |

Ninguno de los 3 fue: grounding (`source_refs` inválidos), mismatch
semántico de `hierarchy`/`concept_map`, ni fallo del proveedor (las 3
llamadas HTTP fueron `200 OK` — nunca un `LLMUpstreamError`; el problema
siempre fue JSON válido con un contrato Pydantic interno inconsistente,
nunca una falla de red o de autenticación). Clasificación correcta:
**STRUCTURAL CONTRACT** (Pydantic, capa `provider.generate_structured`),
nunca GROUNDING ni PROVIDER.

### 12.2. Correction messages mejorados

`_augment_contract_correction` (`lesson_generator.py`) agrega, cuando el
texto de error de Pydantic contiene `"ComparisonPlan.rows"`, una
sugerencia concreta y accionable ADEMÁS del error crudo (nunca lo
reemplaza): *"cambiá visual_type a 'table' en esa escena en su lugar"*.
El error crudo de Pydantic ya era específico (campo, cantidad recibida,
cantidad esperada) pero QA real mostró que no bastaba para que el modelo
abandonara la ruta de `comparison` de forma confiable — el mensaje nuevo
ofrece explícitamente la salida más simple ya disponible.

### 12.3. Reason-code taxonomy más específico

`invalid_contract` (antes un cajón genérico) ahora se desglosa en logging
vía `_invalid_contract_reason_code`: `comparison_contract_invalid`,
`visual_contract_invalid`, `source_refs_invalid`,
`pydantic_contract_invalid` (default). Del lado de la validación de
grounding, se agregó `process_without_sequence_evidence` (ver 12.5) a
`_grounding_reason_codes`. Nunca se loguea contenido — solo los mismos
campos ya seguros de siempre (`attempt`, `reason`, `reason_code`).

### 12.4. Caso crítico tabla — 5 generaciones frescas (`lesson-v3.3.1`)

| run | scenes | table cited? | visual_type | attempts | reason_codes |
|---|---|---|---|---|---|
| 1 | 5 | Sí | table | 1 | — |
| 2 | 6 | Sí | table | 1 | — |
| 3 | 5 | Sí | table | 1 | — |
| 4 | 5 | Sí | table | 1 | — |
| 5 | 5 | Sí | table | 1 | — |

**5/5 exitosas (100%, vs. 4/7 = 57% en `lesson-v3.3`), 5/5 preservaron la
tabla correctamente, 0 reintentos en las 5** (ningún intento propuso
`comparison` esta vez). Objetivo A/B/C de PARTE 14 cumplidos con margen.

### 12.5. False-process: causa raíz y guard determinístico

Inspección real de `arquitectura-trazable-a-requisitos` (PARTE 7):
los tres "principios" citados por la escena problemática
(`SourceBlock` `SRC-010`/`SRC-012`/`SRC-014` en distintas corridas) son
**headings H3 + paragraphs**, NUNCA una lista — cada principio es su
propia subsección con un párrafo de una oración. Esto es exactamente el
caso que PARTE 10 advertía no intentar resolver con una regla rígida
("process requiere ordered_list" rompería procesos legítimos narrados en
prosa): no existe una señal estructural determinística que distinga acá
una secuencia real de una enumeración paralela.

**Guard implementado** (`lesson_validation.py::_process_lacks_sequence_evidence`,
reason_code `process_without_sequence_evidence`): deliberadamente
CONSERVADOR — dispara ÚNICAMENTE cuando el 100% de los `source_refs`
citados por una escena `process` son bloques `type: list` con
`list_kind="unordered"` (reutiliza `_detect_list_kind`, la misma lógica
determinística del Bloque 3, nunca un análisis nuevo). Si hay siquiera un
bloque no-lista entre los citados (heading, paragraph, blockquote), el
guard NO dispara — la ambigüedad se resuelve solo por prompt. Este guard
es correcto por diseño pero **no cubre el caso paragraph-based real
observado** — eso se documenta honestamente como limitación (ver 12.7),
no se fuerza una regla insegura para cerrarlo.

**Reforzado por prompt** (REGLA 21, PARTE 11): ejemplo genérico compacto
("Principio A/B/C" en lista sin numerar -> bullets/hierarchy, NUNCA
"Paso 1/2/3"). QA real (3 generaciones frescas de
`arquitectura-trazable-a-requisitos`): el false-process (antes
persistente, observado 1/1 en el Bloque 3) apareció en **1/3** corridas
frescas — mejora real aunque no eliminación completa, consistente con que
la causa observada es prosa (fuera del alcance seguro del guard
determinístico). Las 3/3 corridas preservaron la tabla correctamente como
`table`.

**Control — proceso genuino** (`explore-plan-implement-verify`, 3
generaciones frescas): **3/3 siguieron produciendo `process` legítimo**
(evidencia real de secuencia temporal en la fuente) — el guard nunca
rechazó un proceso real. 3/3 también preservaron el bloque de código como
`code`.

### 12.6. Regresión de tabla/imagen/código (Bloque 3 vs. Bloque 4)

- **Tabla**: mini-bench de 12 tópicos, `lesson-v3.3.1`: **4/4 tópicos con
  tabla real la usaron (100%)**, igual que el 3/3 del Bloque 3 — sin
  regresión, con más muestra.
- **Imagen**: `el-ciclo-intent-evidence-convergence` (regresión dirigida,
  2 corridas): 1/2 usó `image` — sigue siendo posible, metadata sigue
  llegando, sin romper lo logrado en el Bloque 3. Mini-bench completo:
  4/8 (50%), mejora modesta sobre el 3/7 (43%) del Bloque 3 — nunca se
  buscó optimizar esto en este bloque (PARTE 25).
- **Código**: `contratos-modelos-de-datos-y-artefactos-de-interfaz`
  (regresión dirigida): confirmado `visual_type="code"`. Mini-bench
  completo: 5/7 (71%), dentro de la variabilidad normal del 6/7 (86%) del
  Bloque 3 — muestra distinta, sin patrón de regresión.

### 12.7. KPIs

**Reliability KPI** — mini-bench de 12 tópicos + el caso crítico (20
generaciones frescas totales en este bloque): **20/20 exitosas (100%)**,
**6 reintentos en total (0.3 reintentos promedio por lección exitosa)**,
**0 fallos finales (`422`)**. QA dirigido, no benchmark científico global
(PARTE 20).

**Semantic KPI** (aparte, nunca mezclado con reliability — PARTE 21):
false-process observado en 1/3 corridas de `arquitectura-trazable-a-requisitos`
(mejora real sobre el 1/1 del Bloque 3, no eliminación); 0 casos de
bloque estructurado (tabla/imagen/código) omitido en silencio en una
`LessonPlan` exitosa, en las 20 generaciones de este bloque.

**Animation eligibility**: 16.1% en el mini-bench de este bloque (vs.
19.0% Bloque 3, vs. 25.0% línea base). Interpretación mantenida sin
cambios (PARTE 26): esto refleja selección semánticamente MÁS correcta
(menos `process` mal-usado, más `table`/`code` reales), nunca una
regresión — no se optimiza para subir este número.

### 12.8. Structured source omission: cómo se garantiza hoy

Depende exclusivamente del prompt (REGLA 21, Bloque 3) — documentado
explícitamente acá (PARTE 23). NO se agregó una validación determinística
de tipo "cada table/image/code debe aparecer citada" porque sería
demasiado rígida (una imagen genuinamente decorativa, o un bloque de
código accesorio, puede omitirse legítimamente — exigir su presencia
generaría reintentos innecesarios o fuerza contenido irrelevante a
aparecer). La validación existente y SÍ determinística sigue siendo la de
grounding (`source_refs` deben existir) — nunca "está feo que falte", solo
"lo que se citó, existe realmente".

### 12.9. Bug real corregido (recurrente): `.env`/`.env.example`/`docker-compose.yml`

Mismo patrón que el Bloque 3 y que v1.1.0 (ver `CLAUDE.md`): los 3
archivos seguían con `lesson-v3.3` tras el bump a `lesson-v3.3.1`.
Corregido en los 3. **Convertido en regresión permanente**
(`backend/tests/test_config_version_consistency.py`, PARTE 28): dos tests
nuevos leen `.env.example` y el fallback de `docker-compose.yml`
directamente (montados de solo lectura en el container del backend,
`docker-compose.yml` PARTE 28) y comparan contra
`app.prompts.lesson.LESSON_PROMPT_VERSION` — fallan explícitamente si
alguno de los 3 vuelve a divergir. `.env` (personal, gitignored) nunca se
testea.

### 12.10. Alcance explícitamente NO tocado (Bloque 4)

`VisualPlan` (ningún campo nuevo, ninguna cardinalidad nueva, ningún
`visual_type` nuevo), renderers, Pedagogical Animations, Tutor/Classroom
UX, `checklist`/`timeline`/`matrix` (siguen sin schema propio),
animación de `table`/`code`/`image` (siguen sin ser animables, por
diseño). `TUTOR_PROMPT_VERSION` sigue en `tutor-v3.1`. `APP_VERSION`
sigue en `1.2.0`. MAX_GENERATION_ATTEMPTS sin cambios (3) — la mejora de
reliability vino de reducir la necesidad de reintentos, nunca de
aumentar su presupuesto.

### 12.11. SemanticTeachingAnalysis: reevaluado, sigue innecesario

La condición explícita para reconsiderarlo (PARTE 32) era: metadata de
fuente completa + prompt claro + validación coherente, y AUN ASÍ una tasa
importante de errores semánticos no detectable determinísticamente. Con
0 fallos finales y solo 1/3 casos de false-process residual (un caso
específicamente fuera del alcance seguro de detección determinística, ya
documentado y con causa raíz clara), la tasa de error restante no es
"importante" en el sentido de esa condición — sigue sin haber evidencia
que justifique una capa semántica adicional de LLM.
