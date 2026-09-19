# Visual Fidelity (v1.2.0, primer bloque)

> Continúa en [`VISUAL_SELECTION.md`](./VISUAL_SELECTION.md) (segundo
> bloque, `lesson-v3.2`): ajusta la selección de `visual_type` para los
> tres patrones de inconsistencia que quedaron abiertos acá (sección 11 y
> 12 de este documento) — nunca cambia lo que este documento describe
> sobre el renderer.

Este bloque corrige, con evidencia real (auditoría de 44 escenas lesson-v3
sobre `claude-foundations-certification`, ver el diagnóstico previo a
este documento), la brecha entre lo que `VisualPlan` ya podía expresar
declarativamente y lo que el alumno realmente veía en pantalla.

## 1. Problema encontrado

La auditoría encontró tres bugs concretos, no solo una percepción de
"mucho texto":

1. **`HierarchyVisual` ignoraba completamente `visual.nodes`/`visual.edges`**
   y usaba siempre `key_points` — incluso cuando el LLM ya había producido
   nodos bien estructurados (label/description/role) y, en un caso real,
   hasta edges `flows_to` describiendo una secuencia de 4 pasos.
2. **`ArchitectureVisual`/`ConceptMapVisual` nunca dibujaban una conexión
   geométrica real**: las `edges` se mostraban como una lista de texto
   "A → B" separada de las cajas de los nodos, nunca como líneas
   conectando las posiciones reales de esas cajas.
3. **`ComparisonPlan` en modo "cards" no tenía forma de dar contenido
   distinto por columna** — sin `rows`, todas las cards mostraban
   exactamente los mismos `key_points` de la escena.

Un cuarto hallazgo, de generación (no de renderer): en un caso real
(`modulo-2-descomposicion`), una secuencia explícita de "Paso 1/2/3/4"
terminó clasificada como `hierarchy` en vez de `process`; en otro
(`modulo-1-comparacion`), un contraste "antes/después" cuantificado
terminó como `visual_type=none` en dos escenas separadas.

## 2. Baseline de la auditoría (antes de este bloque)

- 44 escenas lesson-v3 reales auditadas.
- `bullets` + `none` = 23/44 (52%) — visualmente idénticos (título + lista).
- `architecture`/`concept_map`/`table`/`code`/`image`/`quote` = 0/44.
- `nodes` poblados: 3/44. De esas, **0/3 se veían como nodos/aristas
  reales** (siempre ignorados por el renderer o mostrados como texto).
- 4 oportunidades visuales HIGH identificadas → solo 1/4 (25%) llegaba a
  pantalla como un visual estructurado real.

## 3. Contratos visuales (backend)

### `ComparisonColumn` (nuevo, `backend/app/models/lesson.py`)

```python
class ComparisonColumn(BaseModel):
    title: str            # 1-60 caracteres
    points: list[str]     # hasta 6 puntos, cada uno hasta 160 caracteres
```

`ComparisonPlan` gana un tercer campo `columns: list[ComparisonColumn] = []`,
siempre opcional y backward-compatible:

| Modo | Condición | Contenido |
|---|---|---|
| Tabla | `rows` no vacío | sin cambios respecto a v1.1.0 |
| Cards con contenido propio (nuevo) | `rows` vacío, `columns` no vacío | `columns[i].points` — contenido real y distinto por columna |
| Cards legacy | `rows` y `columns` vacíos | comportamiento idéntico a antes de v1.2.0 (key_points compartidos) |

Validación: solo estructural (2-4 `columns` si están presentes, deben
coincidir en cantidad con `column_labels`; `points` no vacíos y acotados
en longitud). **Nunca** se exige que `columns[i].title` coincida
literalmente con `column_labels[i]` — una validación de igualdad de texto
agregaría presión de reintento sin beneficio real de grounding (ver
sección 8, "Validation pressure", ya documentada en el diagnóstico
previo). El grounding de `ComparisonColumn` sigue viviendo en
`VisualPlan.source_refs` a nivel de escena, igual que `ProcessStep` y
`GraphNode` — nunca un `source_ref` por punto.

Ningún campo nuevo acepta HTML, URLs ni markup: son `str` simples,
renderizados siempre como texto plano por React (mismo mecanismo que ya
protegía a `ProcessStep.label`/`GraphNode.label` — nunca
`dangerouslySetInnerHTML`). No se agregó un validador de regex para
"prohibir HTML/URLs" porque el codebase no tiene ese patrón en ningún
otro lado: la garantía de seguridad es arquitectónica (JSX escapa texto
siempre), no basada en filtrar el string de entrada.

## 4. Layout strategy (frontend)

Principio explícito (PARTE 4-7 de la especificación): **React calcula
todo el layout — el LLM nunca entrega coordenadas, SVG, CSS ni markup**.

### `DiagramCanvas` (`frontend/src/classroom/visuals/DiagramCanvas.tsx`)

Componente compartido por `ArchitectureVisual` (layout `"grid"`) y
`ConceptMapVisual` (layout `"radial"`):

- Los **nodos** se posicionan con CSS normal (grid responsivo para
  architecture; ángulos calculados uniformemente alrededor de un centro
  para concept_map — sin física ni force-layout).
- Las **edges** se dibujan como conectores SVG reales: un hook
  (`useDiagramEdgeGeometry`, `diagramGeometry.ts`) mide con
  `getBoundingClientRect()` la posición real de cada nodo YA renderizado
  por React, y dibuja una `<line>` (con flecha para relaciones
  direccionales — `depends_on`/`flows_to`/`contains`/`part_of`; sin
  flecha para `relates_to`/`connects_to` simétricas) entre los centros
  medidos. Un `ResizeObserver` recalcula ante cualquier cambio de tamaño.
- Un `edge.label` se muestra inline solo si mide ≤24 caracteres (PARTE 8);
  si es más largo, se omite visualmente pero sigue disponible en el texto
  accesible (ver sección 7).
- Si una `edge` referencia un nodo que no llegó a montar (dato corrupto,
  robustez defensiva), esa edge se omite del cálculo — nunca crashea,
  nunca inventa una posición.

### `HierarchyVisual`

No usa `DiagramCanvas` (no necesita conectores geométricos: un árbol de
un nivel se comunica bien con CSS simple — root, trunk, hijos). Usa
`hierarchyTree.ts::deriveHierarchyTree(nodes, edges)`:

1. Si `nodes` está vacío → **legacy exacto**: `key_points` como hijos de
   `scene.title` (comportamiento idéntico a antes de v1.1.0).
2. Si hay `nodes` pero no `edges` → todos los `nodes` son hijos de
   `scene.title` (ya es una mejora real: label/description/role en vez de
   key_points genéricos).
3. Si las `edges` forman un patrón "estrella" claro (exactamente un nodo
   sin edges entrantes, y **todas** las edges salen de ese nodo hacia el
   resto) → ese nodo es la raíz REAL (su propio label, no `scene.title`),
   el resto son sus hijos.
4. Cualquier otro caso (0 o >1 candidatos a raíz, edges que no forman una
   estrella limpia, edges hacia nodos no declarados) → degrada de forma
   segura al caso 2 (lista plana bajo `scene.title`). Nunca crashea,
   nunca inventa una relación padre/hijo que las edges no establecen.

**Limitación conocida y deliberada**: solo se reconoce un nivel de
jerarquía (raíz + hijos directos). Reconstruir sub-niveles arbitrarios a
partir de un array plano de `nodes`/`edges` sin una semántica de
"profundidad" explícita en el contrato requeriría heurísticas adicionales
no pedidas por la especificación de este bloque ("no hace falta construir
un graph engine general") — se documenta acá en vez de improvisarlo.

## 5. `ArchitectureVisual` / `ConceptMapVisual`: antes/después

**Antes**: grilla de cajas + una lista `<ul>` de texto "NodoA → NodoB"
debajo, completamente desconectada visualmente de las cajas.

**Después**: mismas cajas (architecture: grilla responsiva;
concept_map: nodo central fijo — siempre `scene.title`, nunca se asume
que "el primer node del array" es el centro, ya que el prompt no le pide
eso al LLM — con nodos relacionados distribuidos en círculo), más un
`<svg>` superpuesto con líneas reales conectando el centro medido de cada
caja. `ConceptMapVisual` deja de depender del `__stem` decorativo de 2px
(eliminado del CSS): ahora, si hay `edges` entre dos nodos relacionados,
esa relación se dibuja de verdad.

## 6. Prompt (`lesson-v3.1`)

Ajuste **quirúrgico** de REGLA 14 (nunca un rediseño completo del
prompt):

- **process vs. hierarchy**: se agrega el criterio explícito "el orden
  temporal manda sobre la composición" — si la fuente tiene "Paso 1/2/3",
  "primero/luego/finalmente", una dependencia causal explícita, o el
  modelo naturalmente pensaría en `relation_type="flows_to"`, debe
  preferir `process` aunque el mismo contenido también admita leerse como
  una descomposición. `hierarchy` queda reservado para composición SIN
  orden temporal ("contiene", "se compone de", "categorías").
- **comparison**: se agrega guía explícita para reconocer contraste
  implícito (antes/después, incorrecto/correcto, actual/propuesto,
  ventajas/desventajas) SIN exigir la palabra "vs"/"versus"/"comparación"
  — y se instruye a usar el nuevo campo `columns` cuando no haya una
  tabla clara para `rows`, nunca repitiendo puntos entre columnas. Sigue
  prohibido inventar el lado que falta si la fuente solo describe un
  enfoque.
- **densidad (REGLA 15)**: se agrega la preferencia explícita de frases
  de 3 a 7 palabras (en vez de oraciones completas de ~15) para
  `key_points`, `process_steps.label`, `nodes.label` y
  `comparison.columns.points` — como guía de generación, nunca como
  truncamiento automático.
- Se preserva explícitamente REGLA 14's principio rector: "el objetivo
  NUNCA es forzar un diagrama donde la fuente no lo justifica" —
  `bullets`/`hero`/`none` siguen siendo la elección correcta para
  contenido genuinamente declarativo (PARTE 15).

`LESSON_PROMPT_VERSION` pasa de `"lesson-v3"` a `"lesson-v3.1"` — forma
parte de la cache key (`content_sha256+provider+model+prompt_version`),
así que invalida por diseño la cache de `lesson-v3` **sin borrarla**: un
`LessonPlan` cacheado bajo `lesson-v3` sigue existiendo en el filesystem
y sigue siendo válido para renderizar (el frontend nunca exigió una
versión de prompt específica), simplemente deja de reutilizarse en la
próxima generación.

### Bug real encontrado durante este mismo bloque: `LESSON_PROMPT_VERSION`/`CERTIFICATION_MAX_CONCURRENCY` vía `.env`

Repetición del mismo patrón ya corregido en el hardening de v1.1.0: el
`.env` del host y el default de `docker-compose.yml` seguían fijados en
`lesson-v3` explícitamente. Como el `.env` del host nunca se copia a la
imagen (`.dockerignore` lo excluye) y el único canal real para que una
variable de `.env` llegue al container es el bloque `environment:` de
`docker-compose.yml`, esto habría hecho que el nuevo prompt **nunca se
usara realmente** en este entorno, pese a que el código ya lo tenía
correcto. Corregido en `.env`, `.env.example`, `docker-compose.yml` y
`docs/CONFIGURATION.md` — confirmado en runtime (`GET /api/system/status`
→ `"prompt_version":"lesson-v3.1"`) tras un rebuild limpio.

## 7. Accesibilidad

Los diagramas (`DiagramCanvas`) nunca dependen exclusivamente de líneas
visuales: cada instancia agrega un `<ul class="sr-only">` (utilidad CSS
estándar, nueva en `global.css`) con una oración por `edge`
("NodoA se relaciona con NodoB", "NodoA depende de NodoB", etc., usando
`relationText()` de `diagramGeometry.ts`) — nunca duplicado visualmente,
solo presente para tecnologías asistivas. Las cajas de nodos siguen
siendo texto real (nunca solo color/posición), y los labels de rol
(`GraphNode.role`) se muestran como texto, no solo como color.

## 8. Reduced motion / animaciones

Sin cambios: `DiagramCanvas` no introduce ninguna animación nueva (las
líneas SVG se dibujan en su posición final directamente, sin transición
de entrada). Los nodos siguen usando el mismo `classroom-stagger-item`
CSS ya existente (fade + translateY al montar), que ya respeta
`prefers-reduced-motion` desde v1.1.0 — sin cambios en ese mecanismo.
**No se implementó `AnimationPlan`/`RevealSequence` en este bloque** (ver
sección 10).

## 9. Overflow del `slide-panel` (bug real corregido)

`.slide-panel` tenía `aspect-ratio: 16/9` fijo + `overflow: hidden`, lo
que recortaba silenciosamente contenido denso (el 5º hijo de una
jerarquía de 5 quedaba parcialmente oculto — confirmado con captura real
en la auditoría). Se reemplazó por `min-height: clamp(220px, 45vw, 460px)`
(la proporción 16:9 queda como piso, no como techo) + `max-height: 640px`
como límite superior razonable. El `overflow-y: auto` que ya existía en
`.slide-panel__content` queda como último recurso genuino: la slide
crece primero: el scroll interno solo entra en juego si el contenido
supera los 640px. Confirmado en vivo (5 viewports, incluido 390×844): los
5 hijos de una jerarquía real ahora están completos en el DOM y
visualmente legibles, sin overflow horizontal en ningún ancho.

## 10. Deliberadamente NO implementado en este bloque

- **`AnimationPlan`/`RevealSequence`/`AnimatedEdge`**: la especificación
  de este bloque lo pide explícitamente fuera de alcance — primero
  visuales estáticos correctos. Con `ArchitectureVisual`/`ConceptMapVisual`
  ahora dibujando líneas geométricas reales, una futura animación de
  "revelar nodo → resaltar arista → revelar siguiente nodo" tendría algo
  real sobre lo cual animar (antes, con edges como texto plano, no había
  geometría que animar).
- **`SemanticTeachingAnalysis`**: no se agregó ninguna capa/pipeline
  adicional entre `CanonicalTopicContent` y `LessonPlan`. El pipeline
  sigue siendo Markdown → CanonicalTopicContent → GroundingPacket →
  LessonPlan → Renderer, sin cambios de arquitectura. La evidencia de
  este mismo bloque (ver "resultado real" abajo) confirma que un ajuste
  quirúrgico de prompt + arreglar el renderer ya produce una mejora
  medible sin esa complejidad adicional — justo la pregunta que este
  bloque debía responder antes de considerar esa idea.

## 11. Resultado real (regeneración con lesson-v3.1, mismo curso)

- `modulo-2-descomposicion` (el caso más grave del diagnóstico: 4 pasos
  reales terminaban en `hierarchy` con los datos ignorados por el
  renderer) → ahora `scene_type=process`, `visual_type=process`, con los
  4 `process_steps` reales ("Paso 1: Definir criterios" ... "Paso 4:
  Recomendar"). **MATCH limpio**, confirmado visualmente.
- `modulo-2-anatomia` (jerarquía de 5 componentes, nodes ignorados +
  overflow) → sigue eligiendo correctamente `hierarchy`, ahora con la
  raíz real detectada vía edges y los 5 hijos completos y legibles en
  pantalla (antes el 5º se cortaba). **Renderer fix confirmado
  visualmente.**
- `modulo-1-comparacion` (antes/después con datos cuantificados) → dejó
  de ser `none`×2: ahora produce `process`+`process`+`comparison` (una
  tabla de decisión real para la sección final del tópico). No logró
  exactamente el resultado "ideal" imaginado en el diagnóstico (una única
  escena `comparison` con las dos columnas "incorrecto"/"correcto"), pero
  es una mejora real y honesta: pasó de 100% texto plano a contenido
  parcialmente estructurado y grounded. **PARTIAL**, no MATCH.
- `modulo-1-modelos` (tabla real Haiku/Sonnet/Opus) → variable entre
  corridas: en algunas generaciones produce `comparison` con la tabla
  correcta (igual que con lesson-v3), en otras produce `hierarchy`. Esto
  refleja variabilidad real del proveedor (`gpt-4o-mini`, sin
  determinismo estricto entre reintentos), no un defecto del schema ni
  del prompt — se documenta honestamente en vez de reportar solo la
  corrida favorable.

Ningún caso regresionó: en el peor escenario observado, un tópico que
antes SIEMPRE producía contenido plano ahora produce contenido
estructurado la mayoría de las veces (con variabilidad normal de LLM), y
ningún dato estructurado que el LLM produce se pierde ya en el renderer.

## 12. Limitaciones conocidas

- La variabilidad de `gpt-4o-mini` entre generaciones significa que la
  mejora de generación (prompt) es probabilística, no una garantía
  determinística — el fix de renderer (nunca perder datos ya generados)
  sí es 100% determinístico.
- `HierarchyVisual` reconoce un único patrón de jerarquía (raíz +
  hijos directos, un nivel) — no reconstruye sub-niveles.
- `ComparisonPlan.columns` no valida que el contenido de cada columna sea
  realmente distinto entre sí (evitar duplicación es guía de prompt, no
  una regla Pydantic) — un LLM podría, en teoría, seguir repitiendo
  contenido entre columnas si no sigue la instrucción.
- No se agregó ninguna heurística de "consolidar escenas hermanas" (p.ej.
  5 propiedades paralelas mostradas como 5 escenas `none` separadas) en
  un overview jerárquico — quedó fuera de alcance de un ajuste quirúrgico
  de prompt.
