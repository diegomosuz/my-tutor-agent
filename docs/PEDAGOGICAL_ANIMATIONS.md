# Pedagogical Animations v1 (v1.2.0, tercer bloque)

Este bloque continúa sobre [`VISUAL_FIDELITY.md`](./VISUAL_FIDELITY.md)
(Bloque 1: el renderer deja de perder datos estructurados) y
[`VISUAL_SELECTION.md`](./VISUAL_SELECTION.md) (Bloque 2: el LLM elige
mejor el `visual_type`). Con el `VisualPlan` ya validado y bien
seleccionado, este bloque agrega **progresión visual real** sobre esos
mismos visuales estructurados — nunca más contenido, nunca más
interpretación.

## 1. Objetivo

Convertir visuales estáticos (nodo/paso/columna apareciendo todos de
golpe, con a lo sumo un fade-in decorativo escalonado) en explicaciones
progresivas: `paso 1 → conector → paso 2 → conector → paso 3`,
`root → children`, `nodo → edge → nodo`, etc. La animación ayuda a
comprender ESTRUCTURA — nunca es decoración ni un efecto visual porque
sí.

## 2. Arquitectura: por qué se deriva, nunca la genera el LLM

```
CanonicalTopicContent (backend, Fase 2)
    ↓
GroundingPacket (backend, Fase 2)
    ↓
LessonPlan / VisualPlan (backend, Fase 3 — LLM decide QUÉ contenido,
                          QUÉ visual_type, QUÉ nodes/edges/steps/columns)
    ↓
Renderer (frontend, Fase 4/v1.2.0 Bloque 1)
    ↓
buildAnimationSequence(scene)  — 100% determinístico, frontend, sin LLM
    ↓
AnimationSequence
    ↓
usePedagogicalAnimation()  — React runtime: timers, pause/resume
    ↓
Clases CSS de estado (hidden/active/revealed) sobre el DOM ya renderizado
```

**El LLM decide QUÉ** (contenido, `visual_type`, `nodes`/`edges`/
`process_steps`/`comparison`). **La aplicación decide CÓMO revelarlo en
el tiempo.** Esta separación es la misma que ya rige todo el proyecto
(CLAUDE.md sección 6/9): el backend nunca reformula ni reinterpreta
contenido; el frontend nunca interpreta código generado por el LLM. Acá
se extiende esa regla a timing: **ningún dato de animación (duraciones,
delays, coordenadas, orden de reveal) sale de una llamada a un LLM**.
`LessonPlan`/`VisualPlan` NO ganaron ningún campo nuevo en este bloque —
sigue siendo exactamente el contrato de Bloque 1/2. `LESSON_PROMPT_VERSION`
sigue en `lesson-v3.2.1`, sin cambios; el prompt de generación de clases
no se tocó.

**Ventaja de diseño directa**: como la animación se deriva en el
frontend a partir de un `VisualPlan` ya existente, **toda `LessonPlan`
cacheada (de cualquier `lesson-v3`/`v3.1`/`v3.2`/`v3.2.1`) adquiere
animación pedagógica automáticamente al renderizarse** — sin regenerar
nada, sin tocar cache, sin llamar de nuevo al LLM.

## 3. Tipos animados (el foco explícito de este bloque)

`process`, `hierarchy`, `architecture`, `concept_map`, `comparison`.
Todo lo demás (`bullets`, `hero`, `code`, `quote`, `image`, `none`,
`table`) sigue exactamente igual que antes de este bloque — transición
CSS existente (`classroom-stagger-item`/`classroom-scene-enter`), nunca
la nueva `PedagogicalAnimation`. `table` queda deliberadamente fuera:
depende de un `SourceBlock` resuelto vía `lookupSourceBlock` (no del
`VisualPlan` puro), lo que habría roto la pureza exigida a
`buildAnimationSequence(scene)` — y no está en el foco explícito de la
especificación de este bloque.

## 4. Modelo: `AnimationSequence` / `AnimationStep`

`frontend/src/classroom/pedagogicalAnimation.ts`:

```ts
type AnimationAction = "reveal" | "highlight" | "connect";
interface AnimationElementRef { kind: "step"|"connector"|"node"|"edge"|"group"; id: string }
interface AnimationStep { elements: AnimationElementRef[]; action: AnimationAction }
type AnimationMode = "progressive" | "neutral" | "simultaneous" | "none";
interface AnimationSequence { mode: AnimationMode; steps: AnimationStep[] }
```

Contrato deliberadamente chico: 3 acciones cerradas (nunca CSS
arbitrario, nunca un nombre de clase generado externamente), 5 tipos de
elemento. `mode` es metadata informativa (el controller procesa `steps`
igual sin importar `mode`) — documenta la intención (`progressive`:
orden real; `neutral`/`simultaneous`: agrupamiento sin orden semántico;
`none`: sin animación) para QA/tests/futuros mantenedores.

`buildAnimationSequence(scene: LessonScene): AnimationSequence` es una
función **pura**: sin React, sin timers, sin `fetch`, sin efectos
secundarios, mismo input → mismo output siempre. Testeable sin browser
(ver sección 15).

## 5. Algoritmo — `process`

Steps ordenados: `reveal(step-0)`, `reveal(connector-0)`,
`reveal(step-1)`, `reveal(connector-1)`, ... — nunca todos los pasos de
golpe. Con 0 o 1 paso (`process_steps` o el fallback de `key_points`/
`title`), secuenciar no aporta nada real: `mode: "none"`, fallback
seguro (nunca un paso único "animado" sin sentido).

## 6. Algoritmo — `hierarchy`

Reusa `deriveHierarchyTree` (ya existente desde Bloque 1 de v1.2.0,
`hierarchyTree.ts` — sin duplicar lógica):

- **Raíz real** (`tree.root` no nulo, patrón "estrella" `root → hijos`
  vía edges `contains`/`part_of`): `reveal(root)`, luego
  `reveal(TODOS los children COMO UN SOLO GRUPO)`. Nunca
  `child A → child B → child C`: eso implicaría causalidad entre
  siblings que la fuente no establece (regla dura de la especificación).
- **Sin raíz clara** (0 edges, o edges ambiguas — la misma deuda conocida
  documentada en `VISUAL_SELECTION.md` sección 15.11: `nodes` pares con
  0 edges es indistinguible de una jerarquía plana legítima): reveal
  neutro/simultáneo de TODOS los `nodes` en un único paso. Nunca se
  infiere ni se refuerza una relación padre/hijo que el `VisualPlan` no
  estableció — la deuda semántica del bloque anterior no se "corrige"
  inventando una animación que la disimule.
- Sin `nodes`: `mode: "none"` (el fallback de `key_points` bajo
  `scene.title` mantiene la transición CSS anterior sin cambios — no hay
  estructura real sobre la cual construir una secuencia).

## 7. Algoritmo — `architecture`

Intenta un traversal BFS determinístico, con un criterio de seguridad
computable (sin juzgar contenido, solo estructura):

1. Calcular indegree de cada `node` a partir de `edges`.
2. Si hay **exactamente un** `node` con indegree 0 (raíz inequívoca) Y
   un BFS desde esa raíz (en el orden ORIGINAL de `edges`, nunca
   reordenado) **alcanza a TODOS los `nodes`** → traversal seguro:
   `reveal(root)`, luego un paso `connect(edge, target)` por cada salto
   del BFS (el nodo origen de cada salto ya es visible por una etapa
   anterior).
3. Si no (0 o >1 raíces candidatas, o algún `node` queda inalcanzado
   desde la única raíz — señal de ciclo/componente desconectado que
   haría el traversal no justificable por la propia estructura):
   fallback — `reveal(TODOS los nodes)`, luego
   `reveal(TODAS las edges)`. Nunca convierte el orden del array en
   causalidad.

Sin `edges`: reveal neutro de todos los `nodes` (nada que traversar).
Sin `nodes`: `mode: "none"`.

## 8. Algoritmo — `concept_map`

El centro (`scene.title`) está **siempre visible de inmediato** — nunca
forma parte de la secuencia, igual que `DiagramCanvas` ya lo trata como
un elemento fijo (no un `GraphNode`, nunca puede ser `from_id`/`to_id`
de una edge). Los `nodes` relacionados se revelan como un único grupo
(nunca "paso 1/2/3" — un concept map no representa temporalidad), y las
`edges` después, también como grupo. No se anima ninguna edge como
"flujo direccional" en v1 (fuera de alcance — ver limitaciones).

## 9. Algoritmo — `comparison`

Simultaneidad, nunca "A y mucho después B":

- **Modo tabla** (`comparison.rows` no vacío): `reveal(header)`, luego
  un paso por FILA — cada paso revela esa fila COMPLETA (todas sus
  columnas juntas, como un único elemento `group`). La progresión es
  entre filas, nunca entre columnas de una misma fila.
- **Modo cards** (`comparison.columns` con contenido propio, o legacy
  sin `rows`/`columns`): un único paso simultáneo revela TODAS las
  columnas/cards juntas — no existe un concepto de "fila" en este modo,
  nada que secuenciar sin inventar un orden que la fuente no da.

## 10. Controller: `usePedagogicalAnimation`

`frontend/src/classroom/usePedagogicalAnimation.ts` — un hook por
escena, vive y muere con el ciclo de vida del componente visual que lo
usa (nunca un segundo sistema de navegación global). Un único
`setTimeout` encadenado (nunca un loop de `requestAnimationFrame`, nunca
polling, nunca un timer por node) programa el siguiente paso; se
cancela/reprograma en cada pausa/resume/unmount.

Estado por elemento (`elementStatus(id)`): `hidden` | `active` |
`revealed`. Al completar la secuencia, TODO pasa a `revealed` de una vez
(incluido el último elemento recién aparecido) — una vez completa, ya no
queda un "paso siguiente" contra el cual distinguir visualmente
"active"; es una simplificación deliberada, documentada y cubierta por
tests.

## 11. Integración con Pause/Resume

**Un único control de playback**, tal como ya lo era antes de este
bloque: `ClassroomPage` pasa el mismo `engine.isPaused` (que ya
controlaba pausar/reanudar la narración/voz) hacia `SceneRenderer` →
`VisualComponentProps.isPaused` → cada visual animado se lo pasa a
`usePedagogicalAnimation`. Nunca se agregó un segundo botón de pausa. Al
pausar: se cancela el timer pendiente, nada nuevo aparece. Al reanudar:
se reprograma el intervalo completo desde el paso actual (nunca vuelve a
`hidden` — "continúa desde el mismo punto", confirmado con QA real:
pausar 2s no revela nada nuevo, reanudar continúa exactamente donde
estaba).

## 12. Integración con Repeat / Prev / Next — reset "gratis"

`SceneRenderer` ya montaba cada escena con
`key={scene.scene_id}-${renderKey}` (desde Fase 4), y `renderKey` ya
cambiaba en cada cambio de escena, "Repetir" y Previo/Siguiente (ver
`useClassroomEngine.ts`, sin modificar en este bloque). Eso fuerza un
**remount completo** del árbol visual — así que
`usePedagogicalAnimation`, que arranca su secuencia al montar, obtiene
"reset al cambiar de escena" y "Repetir reinicia la animación" **sin
ningún mecanismo adicional**: no se creó un segundo sistema de reset, no
se tocó `useClassroomEngine`. `reset()`/`play()` igual se exponen en el
controller para completar el contrato pedido (PARTE 13) y para poder
testear el hook de forma aislada sin depender de un remount real. Next
nunca está bloqueado por una animación en curso — el alumno siempre
puede avanzar (nunca se convirtió la animación en un prerequisito).

## 13. Voice ON/OFF — independencia real

`useClassroomVoice` y `usePedagogicalAnimation` son hooks separados,
cada uno instanciado independientemente (mismo patrón arquitectónico que
ya separaba voz del resto del motor desde Fase 4/Fase 7 — nunca se violó
esa separación). Ninguno depende del estado del otro: la animación nunca
espera a que TTS esté disponible ni se gatea por `voiceEnabled`.
Confirmado con QA real: la animación progresa igual con voz activada o
desactivada.

**Velocidad de voz vs. timing de animación**: se evaluó explícitamente
integrar el selector de velocidad existente (`VOICE_SPEED_OPTIONS`,
0.85x-1.3x) con el intervalo de la animación. Se decidió **mantenerlos
independientes** (permitido explícitamente por la especificación de este
bloque si la integración complica demasiado): acoplar un valor con
nombre "voz" a un subsistema explícitamente declarado "visual" (PARTE 18
de la especificación: "Voice: audio. Animation: visual explanation. Son
subsistemas distintos") habría requerido enhebrar una prop adicional a
través de `SceneRenderer` sin un beneficio claro, y el timing de
animación (leer una estructura visual) no tiene la misma relación con
"velocidad de habla" que la narración sí tiene.

## 14. `prefers-reduced-motion`

Hasta este bloque, ningún componente consultaba `matchMedia` en JS: las
transiciones CSS existentes se desactivaban puramente vía
`@media (prefers-reduced-motion: reduce)` (ver `reducedMotion.test.tsx`,
cuyo docstring documentaba explícitamente "nuestros componentes NUNCA
consultan matchMedia en JS"). **Este bloque cambia eso deliberadamente**:
la animación pedagógica no es CSS puro — un `setTimeout` encadenado
decide CUÁNDO cada elemento pasa a visible, y ese temporizador seguiría
disparando cambios de estado aunque el CSS forzara `opacity: 1`. Por
eso `prefersReducedMotion()` (`frontend/src/classroom/
prefersReducedMotion.ts`, `window.matchMedia` con guard defensivo)
se consulta en `usePedagogicalAnimation` al montar: si es `true`, salta
directo al estado final (`complete()`) **sin programar ningún timer**
— nunca stagger, nunca edge drawing progresivo, nunca reveal secuencial.
Sigue existiendo un respaldo CSS puro en `global.css` (defensa en
profundidad) para cualquier caso no previsto.

## 15. Accesibilidad

La animación **nunca** es necesaria para comprender el contenido:

- Ningún elemento usa `display:none` — el estado "hidden" es
  `opacity: 0` + `transform: translateY(6px)`, nunca remoción del árbol
  de accesibilidad. El texto está en el DOM desde el primer render
  (confirmado con tests: `getByText` encuentra el contenido de pasos
  aún no "revelados").
- `DiagramCanvas` ya mantenía (desde Bloque 1 de v1.2.0) un
  `<ul class="sr-only">` con la relación completa en texto plano para
  cada `edge` — **sin cambios**: sigue completo sin importar qué esté
  visualmente revelado. Nunca se anuncia cada frame de la animación vía
  `aria-live` (sería insoportable) — la lista accesible simplemente
  existe completa desde siempre, el lector de pantalla no necesita
  "esperar" nada.
- El estado "active" agrega únicamente un `outline` (aro de foco, color
  de marca PwC `--color-primary`) — nunca color como único indicador,
  nunca parpadeo, nunca una presentación infantil.

## 16. Layout stability

Crítico, y ya resuelto por construcción: `DiagramCanvas` (desde Bloque 1
de v1.2.0) calcula geometría midiendo el DOM ya renderizado — **todos**
los `nodes` se montan y posicionan desde el primer render, sin importar
si están "revelados" o no. La animación de este bloque **nunca toca
posición/tamaño**: `DiagramCanvas` gana predicados opcionales
(`isNodeVisible`/`isNodeActive`/`isEdgeVisible`/`isEdgeActive`, default
"todo visible" — cero cambio de comportamiento para cualquier consumidor
que no los pase) que solo agregan una clase CSS de opacidad/transform/
outline. Ningún elemento "colapsa" el layout al estar oculto (la
posición ya está reservada); confirmado con QA real en 5 resoluciones
(1920×1080 a 390×844): sin overflow horizontal, sin layout jumps — las
cajas de `process`/`hierarchy` mantienen su posición idéntica entre el
estado inicial y el completo, solo cambia opacidad/outline.

## 17. Performance y cleanup

- Un único `setTimeout` activo por hook instanciado (nunca más de uno a
  la vez — confirmado con test `getTimerCount()`).
- `useEffect(() => clearTimer, [])`: el timer pendiente se cancela al
  desmontar — nunca `setState` sobre un componente ya desmontado
  (confirmado con test: avanzar el reloj tras `unmount()` no lanza).
- `DiagramCanvas` reutiliza exactamente su `ResizeObserver` ya existente
  de Bloque 1 (uno por diagrama, no por `node`) — sin cambios en esa
  estrategia.
- Sin polling, sin loop de `requestAnimationFrame` permanente.

## 18. CSS

Clases centralizadas en `global.css`: `pedagogical-hidden`/
`pedagogical-active`/`pedagogical-revealed` (elementos genéricos de
`process`/`hierarchy`/`comparison`) y
`diagram-canvas__node-slot--{hidden,active,revealed}`/
`diagram-canvas__radial-node--{hidden,active,revealed}`/
`diagram-canvas__edge-line--{hidden,active,revealed}` (elementos de
`DiagramCanvas`, prefijo propio por tipo de nodo — grid vs. radial —
para que la clase describa correctamente a qué elemento pertenece).
Timing centralizado en `frontend/src/classroom/animationTiming.ts`
(`ANIMATION_TIMING.initialDelayMs`/`stepIntervalMs`) — nunca números
mágicos dispersos en CSS o componentes. Cero librería de animación nueva
(sin Framer Motion, sin dependencia nueva): CSS transitions + clases
controladas por React alcanzan.

## 19. Tests

- `pedagogicalAnimation.test.ts` (20 tests): builder puro, sin browser —
  determinismo, no mutación de input, los 5 algoritmos con casos válidos
  y ambiguos/degenerados, fallback seguro ante datos inesperados.
- `usePedagogicalAnimation.test.ts` (12 tests): fake timers siempre
  (`vi.useFakeTimers()`, nunca sleeps reales) — play/pause/resume/reset/
  complete, `isPaused` externo, montaje ya pausado, reduced-motion,
  cleanup de timer al unmount, nunca más de un timer activo, reset por
  remount simulado.
- `pedagogicalAnimationRenderers.test.tsx` (9 tests): integración real
  en los 5 componentes — progresión por etapa, `sr-only` completo desde
  el inicio, reduced-motion (todo visible de inmediato).
- El bug real encontrado durante esta misma verificación (`nodeVisibilityClass`
  de `DiagramCanvas` emitía siempre el prefijo de clase de grid, incluso
  para nodos radiales — sin efecto VISUAL porque ambas reglas CSS tenían
  declaraciones idénticas, pero con nombres de clase incorrectos) se
  corrigió antes de cerrar el bloque, con el test que lo detectó
  incluido en la suite.

## 20. Deliberadamente NO implementado en este bloque

- **Sincronización semántica narración↔animación**: se auditó
  `currentNarrationIndex`/la estructura de `narration` y los eventos
  disponibles de Web Speech API / voz neural — no existe un mapping real
  y estable entre "paso N de la animación" y "oración N de la
  narración" (son estructuras independientes, de tamaños distintos, sin
  relación garantizada). **v1 usa una secuencia temporal propia,
  independiente y controlada por `ANIMATION_TIMING`** — nunca
  `step N = narration sentence N` solo porque ambos tengan índices, y
  nunca una distribución proporcional que finja significado. Esto es
  deuda futura explícita, no un descuido.
- **Setting global "Desactivar animaciones"**: `prefers-reduced-motion`
  alcanza para v1 (más Pause/Repeat/Prev/Next, que ya dan control
  suficiente). No se agregó una preferencia nueva.
- **Animación de `edges` como "flujo" con partícula/dashoffset animado**:
  el reveal de una edge es un cambio de opacidad/outline, no una
  animación de trazo (`stroke-dashoffset` quedó mencionado como técnica
  posible en la especificación, pero no se implementó — opacity/outline
  ya comunican claramente "esta relación apareció ahora" sin necesitar
  una animación de dibujo).
- **Analytics/telemetría de uso de la animación**: nunca se guarda
  actividad del alumno relacionada con la animación (coherente con el
  resto del proyecto — sin tracking de comportamiento).

## 21. Limitaciones conocidas

- La deuda de `VISUAL_SELECTION.md` sección 15.11 (`hierarchy` con
  `nodes` pares y 0 `edges`, semánticamente ambiguo) sigue existiendo —
  este bloque explícitamente NO intenta resolverla ni disimularla con
  animación: ese caso usa reveal neutro/simultáneo, nunca una secuencia
  que sugiera una relación padre/hijo que la fuente no estableció.
- El traversal BFS de `architecture` reconoce un único patrón seguro
  (raíz por indegree 0, única, que alcanza a todos los `nodes`) — grafos
  con múltiples componentes válidos pero desconectados entre sí, o con
  más de una raíz legítima, siempre caen al fallback neutro (nodes,
  luego edges), aunque en algunos casos un traversal más sofisticado
  podría ser semánticamente correcto. Se prefirió el criterio simple y
  seguro sobre un graph engine general.
- El QA real de `architecture`/`concept_map` en este bloque se hizo
  contra fixtures ("golden fixture", vía los tests de integración de la
  sección 19) — el curso real usado en este proyecto
  (`claude-foundations-certification`) no tiene, entre los tópicos
  candidatos evaluados, contenido que produzca esos dos `visual_type` de
  forma natural; no se modificó el curso para forzarlo (explícitamente
  prohibido por la especificación de este bloque).
