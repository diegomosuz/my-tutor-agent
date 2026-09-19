# Visual Selection Reliability (v1.2.0, segundo bloque)

Este bloque continúa directamente sobre [`VISUAL_FIDELITY.md`](./VISUAL_FIDELITY.md)
(primer bloque de v1.2.0, `lesson-v3.1`): ese bloque arregló el *renderer*
(los datos estructurados que el LLM ya generaba dejaron de perderse en
pantalla) y ajustó el prompt quirúrgicamente. Quedaron, documentados
honestamente en su sección 11/12, tres patrones de selección todavía
inconsistentes:

1. `modulo-1-comparacion`: una oportunidad de comparación HIGH que
   mejoró parcialmente (`none`×2 → `process`+`process`+`comparison`) pero
   sin consolidar en una única escena `comparison`.
2. `modulo-1-modelos`: contenido tabular/comparativo claro que producía
   `comparison` o `hierarchy` de forma inconsistente entre corridas.
3. Un patrón históricamente observado de secuencia "Paso 1/2/3/4" que
   podía terminar en `hierarchy` con edges `flows_to` en vez de `process`.

Este bloque **no agrega ningún visual_type nuevo, ningún `AnimationPlan`,
ningún `SemanticTeachingAnalysis` y no cambia la arquitectura general**
(`CanonicalTopicContent` → `GroundingPacket` → `LessonPlan` → Renderer
sigue igual). Es exclusivamente un bloque de **selección y consistencia**:
mejor guía de prompt + una validación determinística mínima sobre el
propio `VisualPlan` ya generado (nunca sobre el Markdown fuente).

## 1. Matriz semántica (fuente → visual_type)

Resumida al inicio de REGLA 14 del prompt (`backend/app/prompts/lesson.py`)
para que el modelo la use como referencia rápida, con el detalle de cada
tipo debajo para resolver casos límite:

| Estructura del material | `visual_type` |
|---|---|
| Secuencia temporal / pasos ordenados / "primero...luego...finalmente" / dependencia causal | `process` |
| Composición sin orden temporal ("contiene", "se compone de", categoría/subcategoría) | `hierarchy` |
| Componentes técnicos con conexiones reales entre ellos (sistema) | `architecture` |
| Relaciones conceptuales (no técnicas) entre ideas | `concept_map` |
| Dos o más alternativas/situaciones CONTRASTADAS explícitamente (ambos lados presentes en la fuente) | `comparison` |
| Datos tabulares reales cuyo propósito central es CONSULTAR filas/columnas | `table` |
| Esos mismos datos tabulares, cuando el propósito central es CONTRASTAR alternativas | `comparison` en modo tabla (mismo dato, mejor herramienta) |
| Código real citable / imagen real citable / definición o cita textual | `code` / `image` / `quote` |
| Explicación declarativa simple, sin ninguna de las estructuras anteriores | `bullets` / `hero` / `none` |

Esta matriz no introduce categorías nuevas — es el mismo criterio de
`lesson-v3.1`, resumido sin ambigüedad al principio de la regla.

## 2. `process` vs. `hierarchy` (y `concept_map`)

- **Criterio prioritario, sin cambios de fondo respecto a v3.1**: orden
  temporal manda sobre composición. Si hay "Paso 1/2/3", "primero/luego/
  finalmente", una dependencia causal, o una relación `flows_to`, es
  `process` — aunque el mismo contenido también admita leerse como una
  descomposición.
- **Nuevo en v3.2**: el prompt ahora prohíbe explícitamente usar
  `relation_type="flows_to"` en una escena `hierarchy` ("si la relación
  real entre los nodos es 'flows_to', eso significa que la escena es
  'process', no 'hierarchy'"), y avisa que esto **se valida
  automáticamente**. `concept_map` recibe la misma aclaración ("un mapa
  conceptual conecta ideas relacionadas, no pasos ordenados").
- Esto convierte una señal que antes era solo una preferencia de prompt
  en una contradicción estructural detectable en el propio `VisualPlan`
  ya generado — ver sección 4.

## 3. `comparison`: detección y modo de contenido

Ejemplos de contraste ampliados respecto a v3.1 (que ya cubría antes/
después e incorrecto/correcto): se agregan explícitamente actual/futuro,
opción A/opción B, alternativa 1/alternativa 2 y modelo A/modelo B — sin
exigir la palabra "vs"/"versus"/"comparación" en ningún caso. Sigue
prohibido inventar el lado que falta.

**Table vs. comparison (nuevo)**: una tabla Markdown real cuyo propósito
central es que el alumno CONSULTE información sigue siendo `table`; si esa
misma tabla existe principalmente para que el alumno CONTRASTE dos o más
alternativas (p.ej. "criterio → opción recomendada"), el prompt ahora
pide usar `comparison` en modo tabla en su lugar — mismos datos, mismo
`source_ref`, mejor herramienta pedagógica. Esto no es una regla nueva de
contenido: es una aclaración de cuál de los dos visual_types ya
existentes es la elección correcta para el mismo dato tabular.

## 4. Consolidación de escenas comparativas (REGLA 20, nueva)

Cuando dos o más fragmentos de la fuente forman una unidad comparativa
inseparable (incorrecto+correcto, antes+después, opción A+opción B,
modelo A+modelo B) y ambos lados están respaldados por `source_refs`
reales, el prompt pide representarlos en **una única escena**
`visual_type="comparison"`, nunca partidos en dos escenas consecutivas —
exactamente la brecha que dejó `modulo-1-comparacion` en v3.1. Esto es
guía de prompt, no una transformación posterior a la generación: **nunca
se fusionan escenas después de generadas** ni en el backend ni en el
renderer. No es una regla general de fusión de escenas — el resto de la
clase se sigue organizando en varias escenas como de costumbre (REGLA 7).

## 5. Coherencia `scene_type` ↔ `visual_type` (guía, sin validación rígida)

El prompt ahora pide coherencia razonable (`scene_type="process"` debería
normalmente usar `visual_type="process"`, ídem `comparison`/
`architecture`) sin exigir igualdad literal — un `visual_type` distinto
sigue siendo válido cuando el contenido puntual de esa escena
efectivamente lo amerita. **Deliberadamente no se agregó ninguna
validación en `lesson_validation.py` para esto**: forzarla en código
rechazaría casos legítimos (p.ej. una escena `scene_type="explanation"`
cuyo contenido real es una comparación puntual) sin ganancia real de
grounding. Es guía de prompt únicamente.

## 6. Validación determinística nueva: mismatch semántico interno

`backend/app/services/lesson_validation.py` agrega una única validación
nueva, estrictamente sobre el **propio `VisualPlan` ya generado** — nunca
reinterpreta el Markdown fuente:

```python
_HIERARCHY_LIKE_VISUAL_TYPES = (VisualType.hierarchy, VisualType.concept_map)

def _is_purely_sequential(edges: list) -> bool:
    if not edges:
        return False
    return all(edge.relation_type == RelationType.flows_to for edge in edges)
```

Si `visual_type` es `hierarchy` o `concept_map` y **todas** sus `edges`
(sin excepción) son `flows_to`, se rechaza con un problema que incluye el
marcador `[visual_semantic_mismatch_process]`. Decisiones de diseño,
explícitas:

- **Umbral "todas", no "la mayoría"**: una sola edge que no sea
  `flows_to` ya alcanza para NO marcar mismatch, aunque el resto sí lo
  sean. Evita falsos positivos sobre jerarquías legítimas que además
  declaran una relación de flujo puntual — el objetivo es una señal
  inequívoca, no una heurística de mayoría.
- **Sin edges no es mismatch**: ambigüedad (no hay señal) es distinto de
  inconsistencia (hay una señal que se contradice a sí misma). Una
  `hierarchy` sin `edges` sigue siendo válida si tiene `nodes` suficientes
  (ver `_MIN_GRAPH_NODES`, sin cambios de v1.1.0).
- **Nunca se reescribe automáticamente** `hierarchy → process` en código:
  eso implicaría que el backend reinterprete contenido pedagógico, algo
  que el proyecto evita explícitamente (CLAUDE.md sección 2/6). En su
  lugar, se rechaza con un `reason_code` específico para que el propio
  LLM lo corrija en un reintento acotado — nunca una heurística de texto
  decidiendo la estructura pedagógica.

Además, `comparison` sin ningún contenido real (ni `rows` ni `columns`
poblados) ahora se rechaza explícitamente (antes solo se exigía que el
campo `comparison` no fuera `None`, lo cual permitía un objeto
técnicamente presente pero vacío en ambos lados).

Ambas validaciones corren **solo en generación fresca**
(`validate_lesson_body`), nunca al leer una `LessonPlan` desde cache
(`_read_cache` solo hace `LessonPlan.model_validate_json`) — ningún
`LessonPlan` cacheado de `lesson-v3`/`lesson-v3.1` se invalida
retroactivamente por esta regla nueva.

### Por qué no se agregaron más validaciones

Se evaluaron explícitamente y se descartaron por no ser "inequívocas" sin
convertirse en un sistema experto de interpretación de contenido:

- **`architecture`/`concept_map` "representan componentes reales"**: ya
  cubierto por la validación de cantidad mínima de `nodes` existente
  desde v1.1.0; no hay una señal estructural adicional, no semántica, que
  agregar sin re-interpretar el contenido.
- **`concept_map` "no debería ser solo una secuencia lineal"**: cubierto
  por la MISMA regla de mismatch de la sección 6 (`concept_map` está en
  `_HIERARCHY_LIKE_VISUAL_TYPES`), sin necesitar una regla separada.
- **`comparison` "debe tener al menos dos lados genuinamente
  representables"**: implementado como la validación de contenido no
  vacío ya descripta arriba — deliberadamente no se valida que ambos
  lados sean "suficientemente distintos" (eso sí requeriría juzgar
  contenido, no estructura).

## 7. Mensaje de corrección para el retry

`build_correction_message` (`app/prompts/lesson.py`) quita el marcador
`[visual_semantic_mismatch_process]` (vía `_REASON_CODE_MARKER`, una
regex simple) antes de enviar el mensaje al LLM — el marcador es
exclusivamente para clasificación interna de logs
(`lesson_generator.py::_grounding_reason_codes`), nunca para el modelo.
El modelo recibe el resto del mensaje en lenguaje natural, por ejemplo:

> `SCENE-002.visual: declarado como 'hierarchy' pero TODAS sus edges son
> 'flows_to' (relación de secuencia temporal), no de composición
> jerárquica. Si el contenido citado en source_refs realmente describe una
> secuencia ordenada, usá visual_type='process' con 'process_steps' en su
> lugar. Si en cambio sí es una composición real sin orden temporal,
> cambiá el relation_type de esas edges a 'contains' o 'part_of' — nunca
> inventes una relación que la fuente no sostenga.`

Mismo mecanismo de reintentos de siempre (sin cambios): el
`AUTHORIZED SOURCE` ya enviado nunca se reemplaza, solo se agrega este
mensaje de corrección a la conversación existente.

## 8. Observabilidad

Se reutiliza la observabilidad ya agregada en `lesson-v3.1`
(`_visual_types_for_log`, log `lesson_generation_attempt` con
`visual_types` por escena en orden posicional, y
`_grounding_reason_codes` con el log `lesson_generation_retry`). El nuevo
`reason_code` `visual_semantic_mismatch_process` se agrega al
clasificador existente, con una precondición de orden importante: debe
evaluarse **antes** que la rama genérica `"process_steps" in problem`,
porque el propio mensaje de corrección del mismatch menciona
"process_steps" como sugerencia — sin ese orden, se clasificaría
incorrectamente como `process_steps_insufficient`.

Se evaluó agregar `scene_id`/`scene_type` explícitos junto al
`reason_code` en el log de retry, y se decidió que el mecanismo existente
ya alcanza el objetivo (correlacionar posicionalmente `visual_types` del
intento fallido con los `reason_codes` del retry siguiente reconstruye
"hierarchy → mismatch → retry → process" sin campos nuevos) — agregar más
estructura de logging sin un consumidor real todavía habría sido
anticipar una necesidad no pedida (CLAUDE.md sección 4). Nunca se loguea
texto libre, source real, ni la respuesta cruda del LLM — confirmado con
test (`test_L_semantic_mismatch_retry_logs_reason_code_never_source_content`).

## 9. Versión de prompt y cache

`LESSON_PROMPT_VERSION` pasa de `"lesson-v3.1"` a `"lesson-v3.2"` — forma
parte de la cache key (`content_sha256+provider+model+prompt_version`),
así que invalida por diseño la cache de `lesson-v3.1` **sin borrarla**
(sigue existiendo en el filesystem, igual que `lesson-v3` entre sí).
Actualizado en los 4 puntos de sincronización de siempre (mismo patrón ya
corregido dos veces antes, ver `VISUAL_FIDELITY.md` sección 6 y el
hardening de v1.1.0): `.env`, `.env.example`, `docker-compose.yml`
(`LESSON_PROMPT_VERSION: ${LESSON_PROMPT_VERSION:-lesson-v3.2}`) y
`docs/CONFIGURATION.md`. Confirmado en runtime tras un rebuild limpio:

```
$ curl -s http://localhost:8000/api/ai/status
{"provider":"openai","model":"gpt-4o-mini","configured":true,"prompt_version":"lesson-v3.2"}
```

## 10. QA dirigido (regeneración real, `claude-foundations-certification`)

**No es una métrica científica ni un benchmark global** — es QA dirigido
sobre los 4 casos conocidos del diagnóstico, con hasta 3 generaciones
frescas por tópico (`force_regenerate=true`) contra el proveedor real
configurado (`openai`/`gpt-4o-mini`), sin modificar ningún Markdown de
curso.

| Tópico | Familia esperada | Run 1 | Run 2 | Run 3 |
|---|---|---|---|---|
| `modulo-2-descomposicion` | `process` | `process` ✅ | `process` ✅ | `process` ✅ |
| `modulo-1-comparacion` | `comparison` consolidado en 1 escena | `comparison`, 1 escena ✅ | `comparison`, 1 escena ✅ | `comparison` con contenido real, pero además 2 escenas previas que narran cada lado por separado ⚠️ |
| `modulo-1-modelos` | `hierarchy` (menor variabilidad) | *(intento 1: `invalid_contract`, no relacionado con este bloque — ver abajo)* | `hierarchy` ✅ | `hierarchy` ✅ (+ `hierarchy` ✅ en un run adicional) |
| `modulo-2-anatomia` | `hierarchy` | `hierarchy` ✅ | `hierarchy` ✅ | `hierarchy` ✅ |

`semantic_selection_accuracy` sobre las generaciones que sí completaron
(12/12, excluyendo los 2 intentos que fallaron por `invalid_contract`
antes de llegar a proponer un `visual_type`): **12/12 en la familia
semántica esperada**. Repetimos: esto es una cifra de QA dirigido sobre 4
tópicos conocidos, no una tasa de éxito general del sistema.

**`modulo-1-modelos`, nota aparte**: 2 de los 5 intentos totales
fallaron con `reason=invalid_contract` (JSON/schema inválido del
proveedor, clasificado y logueado por el mecanismo de reintentos ya
existente desde Fase 3 — nunca llegó a evaluarse `validate_lesson_body`
en esos 2 intentos). Esto es variabilidad conocida de `gpt-4o-mini`
generando *function calling*/JSON estructurado para este tópico
específico, **no relacionada con la validación nueva de este bloque**
(los logs confirman `reason=invalid_contract`, nunca
`reason=grounding_invalid`). Se documenta honestamente en vez de
omitirse.

**`modulo-1-comparacion`, detalle real de los 3 runs** (ver también la
sección 11 para comparar contra el baseline `lesson-v3.1` real, no solo
descripto):

- Run 1: 3 escenas — `"Introducción a la Comparación Práctica"` (hero) →
  `"Comparación de Puntos de Entrada"` (**comparison**, modo tabla, 3
  filas con datos reales: Configuración/Duración/Calidad) →
  `"Recapitulación..."`. Consolidación completa.
- Run 2: 3 escenas — mismo patrón, título
  `"Puntos de Entrada Incorrecto vs Correcto"` (**comparison**).
  Consolidación completa.
- Run 3: 4 escenas — `"Punto de entrada incorrecto"` (visual `none`) →
  `"Punto de entrada correcto"` (visual `none`) →
  `"Comparación de puntos de entrada"` (**comparison**, modo tabla, 3
  filas con datos reales) → `"Decidir crear un Project"` (checkpoint).
  Consolidación **parcial**: REGLA 20 no se siguió completamente (los dos
  lados igual aparecen como escenas de texto separadas primero), pero el
  contenido comparativo SÍ termina representado como un `comparison` real
  y bien poblado — algo que **nunca ocurrió en el baseline real de
  `lesson-v3.1`** para este tópico (ver sección 11).

## 11. Comparación real contra el baseline `lesson-v3.1`

A diferencia de un bloque anterior que solo pudo describir el problema
narrativamente, acá se pudo comparar contra el `LessonPlan` real cacheado
de `lesson-v3.1` que seguía en el filesystem (`data/lesson-cache/`,
nunca borrado por diseño — ver sección 9):

- **`modulo-2-descomposicion`**: v3.1 y v3.2 coinciden — `process` con
  los 4 `process_steps` reales. Sin cambios (ya estaba correcto desde
  `VISUAL_FIDELITY.md` sección 11).
- **`modulo-2-anatomia`**: v3.1 y v3.2 coinciden — `hierarchy` para el
  contenido central. Sin cambios (ya estaba correcto).
- **`modulo-1-modelos`**: la única corrida cacheada de v3.1 ya elegía
  `hierarchy` correctamente para el contenido central — el problema
  reportado ("a veces comparison, a veces hierarchy") reflejaba
  variabilidad entre generaciones que un único snapshot no puede medir.
  Lo que sí se pudo medir en v3.2 es **consistencia**: 3/3 generaciones
  frescas nuevas coincidieron en `hierarchy` para el contenido central.
- **`modulo-1-comparacion`** (el caso con la evidencia más clara): el
  `LessonPlan` real cacheado de v3.1 tiene
  `SCENE-001 "Punto de entrada incorrecto"` con **`visual_type=process`**
  y `SCENE-002 "Punto de entrada correcto"` con **`visual_type=process`**
  — es decir, v3.1 partió el contraste en dos escenas Y clasificó
  ambas con el visual_type equivocado (`process`, no `comparison`). El
  único `visual_type=comparison` de todo ese `LessonPlan` v3.1
  (`SCENE-003`) es sobre un contenido **distinto** (criterios para
  decidir crear un Project), no sobre el contraste incorrecto/correcto
  en sí. En v3.2: 2 de 3 runs consolidan el contraste completo en una
  única escena `comparison` real; el tercero sigue partiendo el texto en
  dos escenas previas pero YA clasifica el contraste central como
  `comparison` con contenido real (algo que v3.1 nunca lograba, en
  ninguna corrida observada). **Mejora real y verificable, no completa.**

## 12. Densidad de texto (verificación, sin endurecer la regla)

Spot-check sobre contenido real generado con `lesson-v3.2` (no una
medición automatizada nueva — la regla sigue siendo guía de prompt, nunca
un contrato validado): `process_steps.label` ("Paso 1: Definir
criterios"), `comparison.columns.points` ("La misma configuración cada
semana", "Configurar una vez, beneficiarse en cada sesión") se mantienen
en el rango de 3-7 palabras orientativo de REGLA 15. Ninguna generación
fue rechazada por densidad — sigue sin ser una regla dura, tal como se
decidió en `lesson-v3.1`.

## 13. Frontend

**Sin cambios.** Ninguna validación ni ajuste de prompt de este bloque
requirió tocar `frontend/`. Los 11 visual renderers y `SceneRenderer`
siguen siendo exactamente los de `VISUAL_FIDELITY.md` — confirmado
visualmente regenerando y navegando `modulo-1-comparacion` (escena
`comparison` en modo tabla, columnas "Incorrecto"/"Correcto" con datos
reales) y `modulo-2-descomposicion` (escena `process`, 4 pasos numerados
con conectores) en un smoke real (Playwright headless, 10 páginas/estados
capturados, 0 errores de consola). Suite de Vitest sin cambios: 348 tests
verdes, mismos archivos que antes de este bloque.

## 14. Limitaciones conocidas

- La validación de mismatch semántico cubre un único patrón inequívoco
  (`hierarchy`/`concept_map` 100% `flows_to`). No cubre, a propósito,
  patrones más ambiguos (p.ej. una `hierarchy` con mezcla de
  `relates_to`/`flows_to`) — eso requeriría juicio semántico, no una
  regla estructural cierta.
- La consolidación de escenas comparativas (REGLA 20) es guía de prompt,
  no una garantía: el run 3 de `modulo-1-comparacion` en la sección 10
  demuestra que el modelo todavía puede, en algunas corridas, narrar cada
  lado en su propia escena antes de la escena de comparación consolidada.
  No se agregó una validación dura para esto porque forzarla arriesgaría
  rechazar clases legítimas donde SÍ tiene sentido una breve escena de
  contexto antes del contraste.
- La variabilidad de `gpt-4o-mini` en JSON/function-calling (fallas
  `invalid_contract` no relacionadas con este bloque, ver
  `modulo-1-modelos` en la sección 10) sigue siendo un límite conocido del
  proveedor, no de este mecanismo de validación.
- El QA de este bloque es dirigido (4 tópicos, hasta 3 corridas), no una
  medición estadística representativa de las 57 tópicos del curso.
