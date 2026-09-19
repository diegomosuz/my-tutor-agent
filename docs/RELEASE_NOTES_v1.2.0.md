# Release Notes — v1.2.0

Release candidate sobre v1.1.1. Tres bloques funcionales (Visual
Fidelity, Visual Selection Reliability, Pedagogical Animations) más un
hardening final. Sin cambios de arquitectura, sin dependencias nuevas,
sin base de datos, sin autenticación, sin analytics externo, sin
cambios de contrato de `LessonPlan` a nivel de campos obligatorios.

## Visual fidelity: diagramas y jerarquías reales

El aula dejó de perder contenido estructurado que el LLM ya generaba:

- **`HierarchyVisual`**: `nodes`/`edges` pasan a ser la fuente primaria
  (antes se ignoraban por completo y siempre se usaba `key_points`
  genérico). Si las `edges` forman un patrón raíz→hijos claro, se
  muestra esa raíz real; si son ambiguas o no existen, degrada a una
  lista plana bajo `scene.title` — nunca inventa una relación
  padre/hijo que la fuente no sostiene.
- **`ArchitectureVisual`/`ConceptMapVisual`**: conectores SVG
  geométricos reales (`DiagramCanvas`, posiciones medidas del DOM ya
  renderizado vía `getBoundingClientRect`), en vez de una lista de
  texto "A → B" desconectada de las cajas. Las relaciones mostradas son
  exactamente las `edges` declaradas — nunca inferidas.
- **`ComparisonVisual`**: `ComparisonPlan` gana `columns` (contenido
  real y distinto por columna en modo "cards" — antes todas las
  columnas mostraban los mismos `key_points` compartidos). 100%
  backward-compatible: una `LessonPlan` sin `columns` sigue
  renderizando exactamente igual que antes.

`LESSON_PROMPT_VERSION`: `lesson-v3` → `lesson-v3.1`. Detalle completo
en `docs/VISUAL_FIDELITY.md`.

## Selección de visual_type más confiable

- Matriz semántica explícita en el prompt (`lesson-v3.1` → `lesson-v3.2`
  → `lesson-v3.2.1`) para elegir `visual_type` por la estructura real
  del contenido, nunca por variar la clase.
- Validación determinística nueva sobre el propio `VisualPlan` ya
  generado (nunca reinterpreta el Markdown fuente): una `hierarchy`/
  `concept_map` cuyas edges son 100% `flows_to` (secuencia temporal
  disfrazada de composición) se rechaza y se reintenta; una `hierarchy`
  con edges declaradas pero ninguna `contains`/`part_of` (composición
  sin ninguna relación de contención real) también.
- Corrección post-QA real (`lesson-v3.2.1`): una lista de entidades
  PARES que comparten una categoría común (p.ej. "los niveles de una
  familia de productos") no es una `hierarchy` solo por eso — es
  `comparison`, incluso con 3 o más entidades, no solo contrastes de 2
  lados.
- QA real confirmó una mejora medible, documentada con honestidad: no
  es una garantía de selección perfecta (la variabilidad del proveedor
  LLM sigue existiendo y está fuera del control de esta aplicación).

Detalle completo, incluida la comparación real contra la generación
baseline, en `docs/VISUAL_SELECTION.md`.

## Animaciones pedagógicas deterministas (nuevo)

Los 5 visuals estructurados (`process`, `hierarchy`, `architecture`,
`concept_map`, `comparison`) pasan de aparecer todos de golpe (con un
fade-in decorativo escalonado) a revelarse en progresión real:

- **`process`**: paso → conector → paso, nunca todos los pasos a la vez.
- **`hierarchy`**: raíz → hijos (como un único grupo simultáneo — nunca
  implica causalidad entre elementos hermanos); sin raíz clara, reveal
  neutro de todos los nodos.
- **`architecture`**: recorrido determinístico (BFS) solo cuando existe
  una raíz inequívoca que alcanza a todos los nodos; si no, revela
  primero todos los nodos y después todas las conexiones — nunca
  convierte el orden del array en causalidad.
- **`concept_map`**: centro fijo, nodos relacionados como grupo,
  conexiones después — sin implicar temporalidad.
- **`comparison`**: simultaneidad real — en modo tabla, cada fila
  revela todas sus columnas a la vez; en modo cards, todas las columnas
  aparecen juntas. Nunca un lado mucho antes que el otro.

**Por qué se deriva y nunca la genera el LLM**: la secuencia de
animación (`buildAnimationSequence`) es una función pura del
`VisualPlan` ya validado — el LLM sigue sin producir duraciones,
delays, coordenadas ni orden de reveal. Esto significa que **toda
`LessonPlan` ya cacheada (de cualquier versión de prompt compatible)
adquiere animación automáticamente al renderizarse**, sin regenerar
nada.

**Integración con los controles existentes**: un único control de
playback (Pausar/Reanudar ya controlaba la voz; ahora también pausa/
reanuda la animación — nunca un segundo botón). "Repetir" y Previo/
Siguiente reinician la animación limpiamente (reutilizando el mismo
mecanismo de remount que ya existía). La animación nunca bloquea el
avance: el alumno siempre puede pulsar "Siguiente".

**Independencia de la voz**: la animación funciona igual con la voz
activada, desactivada, con voz del navegador o voz neural. Son
subsistemas separados que comparten únicamente el control de
pausa/reanudación.

**`prefers-reduced-motion`**: con esta preferencia activa, el estado
final se muestra de inmediato — cero stagger, cero dibujo progresivo de
conexiones, cero reveal secuencial. Es la primera vez que el proyecto
consulta esta preferencia en JavaScript (antes era 100% CSS) — necesario
porque una progresión controlada por temporizador no se puede pausar
solo con CSS.

**Accesibilidad**: la animación nunca es necesaria para comprender el
contenido — ningún elemento se saca del árbol de accesibilidad
(`display:none`), el texto completo de cada paso/nodo está en el DOM
desde el primer render, y la lista de relaciones accesible de cada
diagrama (`.sr-only`) sigue completa sin importar qué esté visualmente
revelado.

**Estabilidad de layout**: la geometría final de cada diagrama se
calcula desde el primer render — la animación solo cambia opacidad y un
aro de énfasis, nunca posición ni tamaño. Confirmado sin overflow
horizontal ni saltos de layout en 5 resoluciones (1920×1080 a 390×844).

Cero dependencia nueva (sin Framer Motion ni ninguna librería de
animación). Detalle completo, incluidos los algoritmos exactos de cada
`visual_type`, en `docs/PEDAGOGICAL_ANIMATIONS.md`.

## Hardening del release candidate

Auditoría del diff acumulado completo (`v1.1.1..HEAD`, los tres bloques,
no solo el último commit). Un bug real encontrado y corregido:

- **StrictMode / desarrollo local**: bajo `React.StrictMode` (activo en
  `main.tsx`, el modo real en que corre la app durante `docker compose
  up`), el guard interno de `usePedagogicalAnimation` (basado en un
  `useRef`) sobrevive el doble-montaje sintético que React usa en
  desarrollo para detectar bugs de este tipo — mientras que el estado sí
  se reinicia, el ref no. Eso hacía que el primer reveal de cada
  animación se programara con el intervalo entre pasos (`stepIntervalMs`,
  ~700ms) en vez del delay inicial pensado para que el layout se asiente
  (`initialDelayMs`, ~300ms). **Nunca visible en producción** (React
  descarta el doble-montaje de StrictMode en el build de producción),
  pero sí en todo desarrollo local. Corregido centralizando el criterio
  correcto en una única función (`delayFor`); test de regresión agregado
  montando el hook explícitamente dentro de `React.StrictMode`.

El resto de la auditoría (seguridad de SVG/diagramas — el LLM nunca
controla markup, coordenadas ni estilos; grounding de
`AnimationSequence` — solo referencia elementos que el `VisualPlan` ya
declaró; privacidad — el estado de animación nunca se persiste ni se
trackea; compatibilidad hacia atrás con `LessonPlan` cacheadas de
`lesson-v3`/`v3.1`/`v3.2`; cache sin cambios; regresión de
Classroom/Learning Progress/Certification) **no encontró hallazgos
nuevos** — ya estaba correctamente cerrada por los propios bloques.

## Qué NO afirma este release

- **No** hay sincronización semántica exacta entre la narración y la
  animación — comparten el mismo control de pausa/reanudación, pero la
  progresión visual v1 usa un timing propio, independiente, nunca
  mapeado a oraciones específicas de la narración.
- **No** hay generación de animaciones por IA — se derivan
  determinísticamente en el frontend.
- **No** hay un motor de grafos general — el traversal de `architecture`
  reconoce un único patrón seguro (raíz inequívoca que alcanza a todos
  los nodos); todo lo demás degrada a un fallback neutro.
- **No** hay garantía de selección visual perfecta por parte del LLM —
  la variabilidad del proveedor sigue existiendo; este release reduce
  errores conocidos, no los elimina matemáticamente.
- Sin RAG, sin LMS, sin soporte multi-usuario, sin progreso en la nube,
  sin predicción de resultado de examen real.

## Notas de actualización (v1.1.1 → v1.2.0)

- **Sin migración de base de datos** (el proyecto no usa una).
- **Sin migración de cursos**: el formato de Markdown/frontmatter no
  cambió.
- `APP_VERSION`: `1.1.1` → `1.2.0` (`backend/app/config.py`,
  `docker-compose.yml`, `.env.example`).
- `LESSON_PROMPT_VERSION`: efectivo `lesson-v3.2.1` (era `lesson-v3` en
  v1.1.1). Las caches de `lesson-v3`/`v3.1`/`v3.2` se conservan intactas
  en el filesystem — cambiar la versión invalida por diseño su
  reutilización, nunca las borra. Una nueva generación usa
  `lesson-v3.2.1` automáticamente.
- **Las animaciones pedagógicas se aplican del lado del frontend y NO
  requieren regenerar ninguna `LessonPlan`** cuando el `VisualPlan`
  existente ya es compatible (cualquier `LessonPlan` con `nodes`/
  `edges`/`process_steps`/`comparison` poblados de versiones anteriores
  de v1.2.0, o incluso de v1.1.0, ya adquiere animación al renderizarse)
  — esta es la ventaja directa de haber elegido derivación determinística
  en vez de generación por LLM.
- Docker/bind mounts sin cambios (`COURSES_HOST_PATH`, `./data`).
- Ningún endpoint HTTP nuevo, ningún endpoint eliminado, ningún cambio
  de forma en los contratos existentes.
