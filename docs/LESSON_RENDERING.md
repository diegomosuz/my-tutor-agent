# Rendering pedagógico de clases (v1.1.0)

Este documento describe el tercer bloque funcional de v1.1.0: la
arquitectura visual/pedagógica de una `LessonPlan` generada con
`lesson-v3`. Complementa `docs/ARCHITECTURE.md` (secciones 6-9) — acá se
detalla específicamente qué cambió respecto de Fase 3/4.

## 1. Principio de fondo (sin cambios)

El Markdown del tópico (`CanonicalTopicContent`/Grounding Packet) sigue
siendo la ÚNICA fuente de verdad pedagógica. El LLM produce exclusivamente
un modelo DECLARATIVO (`GeneratedLessonBody`); React renderiza el 100% de
la UI con componentes escritos por el equipo. Nunca hay
`dangerouslySetInnerHTML`, `eval`, `new Function`, HTML/SVG/Mermaid
arbitrario, ni ejecución de código del LLM en ningún componente de
`frontend/src/classroom/`.

## 2. Qué cambió: separar QUÉ ENSEÑAR de CÓMO MOSTRARLO

Antes de este bloque, `VisualPlan` era plano (`visual_type`, `layout_hint`,
`source_refs`, `description`) y los renderers de Process/Comparison/
Architecture/ConceptMap/Hierarchy trataban `scene.key_points` (una lista
plana de `GroundedText`) como si fueran pasos/nodos/columnas genéricos —
nunca había una relación estructural real entre ellos (ver auditoría más
abajo). `VisualPlan` ahora tiene contenido estructurado OPCIONAL específico
por tipo:

- `process_steps: ProcessStep[]` (`label` + `detail` cortos) — para
  `process`.
- `comparison: ComparisonPlan | None` (`column_labels` + `rows`
  opcionales) — para `comparison`.
- `nodes: GraphNode[]` + `edges: GraphEdge[]` (`id`/`label`/`description`/
  `role`; `from_id`/`to_id`/`relation_type` de un enum cerrado) — para
  `architecture` y `concept_map`.
- `emphasis: VisualEmphasis` (`neutral`/`primary`/`secondary`/`warning`) —
  mapea a un token de color PwC fijo, nunca a un color arbitrario.

Estos campos son texto CORTO de presentación (como ya lo era
`description`), nunca `GroundedText` individual: el grounding de todo el
visual lo sigue garantizando `VisualPlan.source_refs` a nivel de escena
(decisión deliberada — ver sección 8, "qué NO se hizo").

`visual_type="image"` es nuevo y reutiliza EXACTAMENTE el mismo patrón que
ya usaban `table`/`code`/`quote`: cita un `SourceBlock` real (tipo
`"image"`) vía `source_refs`. No existe ningún campo de URL en el
contrato — es estructuralmente imposible que el LLM apunte a una imagen
que no exista en el material.

## 3. Auditoría del sistema anterior (resumen)

- **visual_type usados de verdad**: todos los 11 originales tenían
  renderer, pero Process/Architecture/ConceptMap/Hierarchy/Comparison
  producían resultados visualmente MUY similares entre sí (todos
  "boxes con key_points"), porque no había forma de que el LLM expresara
  una relación real.
- **Dónde el LLM tenía demasiada libertad**: en la elección de
  `visual_type` sin ninguna guía de "cuándo usar cada uno" más allá de
  `layout_hint`/`description` — nada impedía elegir `architecture` para
  contenido sin relaciones reales.
- **Dónde tenía muy poca información**: exactamente en esos mismos 5
  tipos — no había manera de que el LLM declarara "A depende de B", una
  secuencia con detalle por paso, o una comparación fila por fila.

## 4. Scene roles (`scene_type`)

Se reutilizó el campo `scene_type` existente (que ya cumplía el rol de
"scene_role" pedido) en vez de agregar un campo paralelo redundante.
Pasó de 5 a 10 valores: `opening`, `concept`, `explanation`, `process`,
`comparison`, `example`, `architecture`, `recap`, `checkpoint`, `closing`.
Nunca se usa para dispatch de renderer (eso lo sigue haciendo
`visual.visual_type`) — es metadata pedagógica que guía composición,
densidad, ritmo y narración; nunca contenido pedagógico en sí mismo.

## 5. Visual types (final)

| visual_type | Contenido estructurado | Fallback si falta |
|---|---|---|
| `hero` | — (título + hasta 2 key_points) | — |
| `bullets` | — (key_points) | — |
| `process` | `process_steps` (2-8, label+detail) | key_points como pasos sin detail |
| `comparison` | `comparison` (2-4 columnas, rows opcionales) | 2 key_points → pares A/B; si no, cards neutrales |
| `hierarchy` | — (title=raíz, key_points=hijos, un nivel) | — |
| `architecture` | `nodes` (2-8) + `edges` (0-12, relation_type cerrado) | key_points como nodos sueltos, sin relaciones |
| `concept_map` | igual que architecture, máx. 7 nodos, layout radial | key_points como nodos sueltos |
| `table` | SourceBlock citado `block_type="table"` | key_points en lista |
| `code` | SourceBlock citado `block_type="code"` | key_points en lista |
| `quote` | SourceBlock citado `block_type="blockquote"` | primer key_point o title |
| `image` | SourceBlock citado `block_type="image"` | key_points en lista (nunca imagen rota) |
| `none` | — | — |

`architecture` vs. `concept_map` comparten el modelo `nodes`/`edges` pero
tienen layouts visualmente distintos (grid vs. radial) para que se
perciban como cosas distintas: uno es un diagrama técnico, el otro un
mapa de relaciones conceptuales.

### Grafos (architecture/concept_map): seguridad y límites

- Nunca coordenadas, tamaños, CSS ni SVG del LLM: React decide el layout
  (grid responsivo para nodos, lista de relaciones para edges).
- `edges` se valida ESTRUCTURALMENTE contra `nodes` declarados en la MISMA
  visual (`VisualPlan._graph_edges_reference_declared_nodes`, Pydantic):
  una arista hacia un nodo inexistente se rechaza siempre, antes de que la
  LessonPlan pueda cachearse.
- Límites duros: máx. 8 nodos, máx. 12 edges (arquitectura); el prompt
  pide máx. 7 nodos para concept_map (mapas más grandes se vuelven
  ilegibles).
- Si `nodes` no viene poblado (robustez ante una LessonPlan vieja en
  cache, de antes de `lesson-v3`), el renderer degrada a mostrar
  `key_points` como componentes sueltos sin conexiones — el mismo
  comportamiento que existía antes de este bloque. Nunca crashea.

### Imágenes: política

- Solo se sirven desde el filesystem del curso, vía el endpoint de assets
  ya existente (Fase 7): allow-list de extensiones, traversal
  estructuralmente imposible.
- `SafeMarkdown` (mismo componente que ya usa el panel de contenido)
  resuelve el asset relativo de forma segura y bloquea cualquier imagen
  externa (`http(s)://`, `data:`) sin cargarla automáticamente.
- El LLM nunca puede introducir una URL: no existe el campo. Un
  `visual_type="image"` que cite un `source_ref` que NO sea un bloque de
  imagen real se rechaza en `lesson_validation.py`.
- Sin generación de imágenes, sin búsqueda web, sin CDN externo nuevo.

### Código: política

- Igual que antes: el `SourceBlock` citado se muestra literal, en
  monoespaciado, con scroll interno (`max-height` + `overflow-y: auto`).
  Nunca se ejecuta.

## 6. Densidad y narración vs. slide

El prompt (`REGLA 15`) pide title breve, 3-5 key_points, 2-8 process_steps,
2-4 columnas de comparison. Estos son límites de CALIDAD guiados por el
prompt — la validación dura (Pydantic + `lesson_validation.py`) es
deliberadamente más generosa (para no generar loops de reintento por casos
límite legítimos), documentado en el código como "rango práctico".

`REGLA 16` pide explícitamente que la narración NUNCA sea una lectura
literal de la slide — puede contextualizar, conectar escenas, explicar una
relación o ampliar un tecnicismo ya presente en la fuente, siempre
grounded.

## 7. Énfasis visual

`emphasis` (`neutral` por defecto) se aplica como una clase
`emphasis-{valor}` en el wrapper de la escena (`SceneRenderer.tsx`), que
agrega un borde de acento discreto (`--color-primary` para `primary`,
`--color-accent-red` para `warning`, gris translúcido para `secondary`) —
nunca un color arbitrario ni un fondo saturado. El prompt pide usarlo con
moderación.

## 8. Qué NO se hizo (limitaciones documentadas)

- **Highlighting de SourceBlocks en el panel derecho** (source_refs de la
  escena activa → resaltado en el Markdown renderizado): el panel derecho
  renderiza `topic.content_markdown` como un único blob vía
  `react-markdown` (`SafeMarkdown`), sin que cada nodo del árbol quede
  identificado por su `source_ref`. Implementarlo bien requeriría un
  renderer custom de `react-markdown` que mapee la posición (`start_line`/
  `end_line`, ya expuesta por `SourceBlock`) de cada nodo renderizado a su
  `source_ref` — una reescritura del componente, no un cambio incremental
  seguro dentro del alcance de este bloque. Se documenta como limitación
  conocida en vez de forzarlo (permitido explícitamente por la
  especificación de este bloque).
- **Reveal progresivo "bloqueante"** (p.ej. que Next espere a que todos los
  pasos de un `process` terminen de aparecer): NO se implementó — ya
  existía una entrada animada simple con stagger (`classroom-stagger-item`,
  Fase 4) para bullets/process/comparison/hierarchy/architecture/
  concept_map, y se extendió al mismo patrón para los nuevos elementos
  (edges, image points). Nunca bloquea Next ni interfiere con la
  sincronización de voz — exactamente lo que pide la especificación como
  alternativa válida a un reveal progresivo complejo.
- **ErrorBoundary local por escena**: no se agregó. Cada renderer ya
  degrada de forma defensiva (nunca lee un campo estructurado sin
  verificar que esté poblado) y el `LessonPlan` que llega al frontend ya
  pasó validación Pydantic + `lesson_validation.py` en el backend antes de
  cachearse — un `VisualPlan` estructuralmente inválido nunca llega a
  React. Sumado a que ya existe un `ErrorBoundary` raíz (Fase 7), un
  ErrorBoundary por escena se juzgó redundante para el riesgo real.
- **Golden lessons**: se armó un subconjunto representativo
  (`frontend/src/test/fixtures/lessons/`: process-heavy, comparison-heavy,
  architecture-heavy — incluye también code/concept_map —, minimal-topic),
  no los 7 casos listados en la especificación original. table-heavy/
  image-heavy ya tienen cobertura directa de renderer en
  `visuals/__tests__/visuals.test.tsx` sin necesitar una LessonPlan
  completa dedicada.

## 9. lesson-v3

`LESSON_PROMPT_VERSION` pasó de `lesson-v2` a `lesson-v3` — invalida por
diseño la cache de LessonPlans generadas con el prompt anterior (mismo
mecanismo de siempre: la versión forma parte de la cache key). Reglas
nuevas del prompt: 14 (elegir visual_type por estructura, nunca por
variar — con guía explícita de cuándo usar cada tipo), 15 (densidad), 16
(narración nunca es lectura literal), 17 (imágenes nunca inventadas), 18
(código nunca inventado), 19 (español/tecnicismos, reafirmada para los
campos nuevos).

## 10. Panel DEV

`GroundingPanel` (solo `import.meta.env.DEV`) ahora también muestra
`scene_type` y `visual_type` de la escena activa, además de las
`source_refs` que ya mostraba — nunca visible para el alumno en
producción.
