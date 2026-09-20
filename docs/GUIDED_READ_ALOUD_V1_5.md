# Guided Markdown Read Aloud — v1.5.0

Este documento cubre el bloque único de v1.5.0: **Guided Markdown Read
Aloud** — el alumno puede escuchar el Markdown del tópico actual con la
misma arquitectura de voz de alta calidad que ya usa la app (narración de
clase, voz del tutor), mientras la frase que se está pronunciando queda
resaltada progresivamente en pantalla.

Sin cambios de arquitectura, sin dependencias nuevas, sin backend nuevo
(el endpoint `POST /api/speech` de Fase 7 ya alcanzaba tal cual), sin
LLM adicional, sin forced-alignment, sin speech-to-text.

## 1. Objetivo y principio de simplicidad

```
[ 🔊 Leer tema ] [■] [1×]
```

junto a "Tema anterior/siguiente" (nunca debajo del Tutor). El Reader:

1. lee el contenido pedagógico visible del Markdown, en orden;
2. reutiliza la MISMA configuración de voz de calidad que ya usa la app
   (neural si está configurada, navegador si no);
3. preserva términos técnicos, acrónimos e identificadores tal cual;
4. resalta la frase que se está pronunciando;
5. permite Play/Pause/Resume/Stop;
6. permite elegir velocidad (0.75×/1×/1.25×/1.5×/2×);
7. se detiene automáticamente cuando la narración de IA (clase o tutor)
   tiene prioridad.

Explícitamente fuera de alcance (principio de simplicidad de la
especificación): un LLM adicional, un modelo de forced-alignment,
speech-to-text/Whisper, timestamps generados por IA, una base de datos
nueva, un backend de sesiones, WebSocket, LangGraph, agentes, o
dependencias grandes nuevas.

## 2. Inspección previa (antes de implementar)

Se leyó completamente la arquitectura de voz real antes de escribir una
sola línea del Reader:

- **`voicePlayback.ts`**: facade unificado sobre los dos backends
  (`speech.ts` navegador, `neuralSpeech.ts` neural). `cancelAllSpeech()`
  cancela AMBOS siempre — es el único lugar donde "nunca dos audios
  simultáneos" se garantiza hoy.
- **`neuralSpeech.ts`**: singleton a nivel de módulo (`currentAudio`,
  `currentObjectUrl`, `currentAbortController`, `playbackToken`).
  `speakTextNeural` hace fetch+play en un solo paso, con un ÚNICO slot de
  estado — perfecto para narración secuencial estricta, pero
  **incompatible con prefetch** (llamarlo para adelantar el segmento
  siguiente cancelaría el audio actual).
- **`speech.ts`**: wrapper sobre `window.speechSynthesis`, stateless (el
  navegador ya mantiene su propia cola).
- **`useClassroomVoice.ts`**: la narración de la clase se re-dispara en
  un `useEffect` atado a `enabled = voiceEnabled && !engine.isCompleted`
  — Pause/Resume llaman a `pauseAllSpeech()`/`resumeAllSpeech()` sin
  desmontar esa "sesión habilitada".
- **`TutorPanel.tsx`**: la voz del tutor es un `speakSequenceUnified` de
  un solo disparo por respuesta, dentro de `handleSubmit`.
- **`ClassroomPage.tsx`**: `handleGenerateLesson` (Generar/Regenerar
  clase con IA), la navegación de tópico (`goToTopic`, reutilizada por
  "Ver tema relacionado" desde v1.4.0), y `handleExit` son los puntos
  reales donde debía intervenir la prioridad de IA.
- **`SafeMarkdown.tsx`**: `react-markdown` con overrides solo de
  `img`/`a` — headings/párrafos/listas/tablas/código/blockquotes usan
  los componentes DEFAULT de `react-markdown` (elementos DOM normales,
  nunca HTML crudo, nunca `dangerouslySetInnerHTML`).

Respuestas a las preguntas de diseño de la especificación:

- **A. Servicio de voz a reutilizar**: `api.synthesizeSpeech` (mismo
  cliente, mismo endpoint `/api/speech`) para neural; `speech.ts` para
  el fallback de navegador. Nunca un segundo backend/cliente TTS.
- **B/C. Cancelación actual**: `AbortController` + `playbackToken`
  (neural) / `window.speechSynthesis.cancel()` (navegador) — mismo
  patrón reutilizado, ver sección 4.
- **D. Dónde arranca Generate AI Lesson**: `handleGenerateLesson` en
  `ClassroomPage.tsx`, ANTES de `setLessonLoading(true)`.
- **E. Dónde arranca la narración de IA**: el efecto de narración en
  `useClassroomVoice.ts` (clase) y `handleSubmit` en `TutorPanel.tsx`
  (tutor).
- **F. DOM real del Markdown**: `react-markdown` renderiza elementos DOM
  normales dentro de `.content-panel__body` — nunca HTML crudo.

## 3. Por qué NO reutilizar `neuralSpeech.ts`/`speakTextNeural` tal cual

`speakTextNeural` es fetch+play en un solo paso con un único slot de
estado — óptimo para narración estrictamente secuencial (nunca necesitó
prefetch), pero el Reader SÍ necesita adelantar la síntesis del segmento
siguiente mientras el actual todavía suena (PARTE 22-24 de la
especificación): llamar a `speakTextNeural` para "prefetchear" cancelaría
inmediatamente el audio en curso.

Se creó `readAloudPlayer.ts`, que reutiliza el MISMO
`api.synthesizeSpeech` (nunca un segundo cliente/endpoint) pero permite
hasta `MAX_PENDING_PREFETCH=2` fetches en vuelo simultáneos (cada uno con
su propio `AbortController`), más UN único `<audio>` activo a la vez —
misma invariante de "nunca dos sonando", solo que hace falta más de un
fetch concurrente para lograrlo sin gaps audibles entre frases. El
fallback de navegador reutiliza `speech.ts` (`speakText`) directamente
sin ningún cambio de arquitectura (el navegador ya encola internamente,
no hay concepto de red/prefetch ahí).

`speech.ts` ganó un único campo opcional nuevo, `onStart` en
`SpeakOptions` (evento nativo `utterance.onstart`) — backward compatible,
ningún consumidor existente lo usaba ni lo necesita.

## 4. Prioridad de audio: `readAloudPriority.ts`

Mecanismo mínimo, no un framework genérico de "audio ownership": un
pub/sub de una sola señal.

```typescript
claimAiAudioPriority()       // llamado desde los puntos reales donde arranca audio de IA
onAiAudioPriority(listener)  // el Reader se suscribe una vez
setAiAudioActive(bool) / isAiAudioActive()
```

`claimAiAudioPriority()` se llama, ANTES de que exista audio real (PARTE
6: la prioridad arranca en el EVENTO, no en el primer byte de sonido),
desde:

- `handleGenerateLesson` (`ClassroomPage.tsx`) — cubre Generate/Regenerate.
- El efecto de narración de `useClassroomVoice.ts` — en cada chunk nuevo.
- `handleSubmit` (`TutorPanel.tsx`) — antes de la voz del tutor.
- El efecto de cambio de tópico y `handleExit` (`ClassroomPage.tsx`) —
  junto a los `cancelAllSpeech()` ya existentes, por explicitud (el
  Reader también se reinicia solo vía su propio efecto keyed en
  `topicKey`, esto es defensa en profundidad, no la única vía).

El Reader (`useReadAloud.ts`) se suscribe una vez al montar y se detiene
inmediatamente (`hardStop`) ante cualquier claim — nunca se reanuda solo.

**El Reader nunca llama a `claimAiAudioPriority()`** — si lo hiciera,
"robaría prioridad" a sí mismo sin sentido, y peor, interrumpiría a la
IA (PARTE 8: el Reader nunca le roba el turno a IA). En cambio, el botón
del Reader queda **deshabilitado** mientras
`aiAudioSessionActive = voiceEnabled && !engine.isCompleted` es `true`
— EXACTAMENTE la misma condición que habilita la narración de la clase,
sin importar si está en pausa (PARTE 45: "AI voice paused pero sigue
siendo owner" → Reader deshabilitado, nunca lo reemplaza).

## 5. `SpeechSegment` y segmentación (`readAloudSegments.ts`)

Se segmenta el **DOM ya renderizado** (nunca el Markdown fuente por
separado) — evita que la lectura diverja de lo que el alumno realmente
ve en pantalla (por ejemplo, `remark-gfm` puede transformar listas/tablas
de formas que no son 1:1 con el Markdown crudo).

```typescript
interface SpeechSegment {
  id: number;
  blockKey: string;       // referencia al bloque de origen (nunca el nodo DOM en sí)
  kind: "text" | "code" | "image-alt";
  text: string;
  startOffset: number;    // offsets dentro del textContent del bloque
  endOffset: number;
}
```

**Bloques "hoja" legibles** (PARTE 15, nunca duplica `li > p`): un
elemento `P`/`LI`/`H1`-`H6`/`TD`/`TH` es una unidad de lectura completa
SOLO SI no contiene ningún descendiente de bloque (`P`, `LI`, `UL`,
`TABLE`, `BLOCKQUOTE`, headings, `PRE`, `DIV`) — si lo contiene, es un
CONTENEDOR y se recorre en vez de leerse directamente. `PRE`/`IMG` son
casos especiales (sección 7/8). El recorrido es en orden de documento
(== orden visual/pedagógico, verificado con fixture H1+párrafo+lista+
tabla+código+quote, PARTE 49).

Cada bloque hoja se marca con `data-read-aloud-block="N"` — mutación de
atributo pura (nunca reemplaza/mueve nodos, compatible con React) que
permite volver a encontrarlo al resaltar sin retener una referencia
directa al nodo DOM entre renders.

**Sentencias**: `Intl.Segmenter(locale, {granularity:"sentence"})`
cuando el runtime lo soporta, con un fallback regex determinístico chico
si no (nunca una librería NLP). Oraciones que superan 220 caracteres se
parten en separadores seguros (`;`, `:`, `—`, `,`) — nunca dentro de un
token sin espacios.

### 5.1 Bug real encontrado en QA (y su fix, puramente estructural)

`Intl.Segmenter` interpreta cualquier `?`/`.` como posible cierre de
oración, **incluido uno dentro de una URL con query string**
(`.../path?query=1`) sin ningún espacio real de por medio — partir ahí
cortaría la URL en dos segmentos de audio con una pausa audible en medio
de un token que nunca la tuvo. Mismo problema con el separador `:` de mi
propio partidor de oraciones largas sobre `https:` (el `:` del esquema de
la URL).

**Corrección**: nunca vocabulario/regex de "esto es una URL" (PARTE 12
lo prohíbe explícitamente) — una corrección puramente ESTRUCTURAL: una
oración real SIEMPRE está separada de la siguiente por al menos un
espacio/salto de línea en el texto original. Si dos piezas consecutivas
que devolvió el segmentador (o mi propio partidor de "oración larga")
quedan pegadas SIN ningún separador real entre ellas, eso nunca es un
límite de oración genuino: se vuelven a fusionar / solo se parte en una
ocurrencia del separador si está seguida de espacio real. Test de
regresión: `readAloudSegments.test.ts::"9. oración muy larga se parte en
separadores seguros, nunca en medio de un token"`.

## 6. Código, tablas, imágenes

- **Código** (`PRE`): se lee como texto literal completo, preservando
  identificadores tal cual (nunca explicación generada, nunca ejecución).
  Un bloque completo es UN segmento; si es muy largo, se parte por línea
  (el único separador que nunca cae en medio de un símbolo de código).
  No se probó necesario ampliar esto en QA real — documentado, no
  resuelto preventivamente (PARTE 16).
- **Tablas**: celda por celda (`TD`/`TH`), fila por fila, en orden visual
  — nunca se lee la tabla completa Y cada celda por separado.
- **Imágenes**: si `alt` existe y no está vacío, se lee ese texto — NUNCA
  el filename/URL del asset. Sin `alt`, no produce ningún segmento
  (PARTE 51/52: un tópico sin ningún bloque legible deshabilita el
  Reader, sin error técnico).

## 7. Resaltado sin romper Markdown: CSS Custom Highlight API

Decisión (PARTE 18 de la especificación, documentada acá tal como pide):
tras inspeccionar `SafeMarkdown`, insertar `<span>`/`<mark>` por frase de
forma declarativa con React hubiera requerido un plugin remark/rehype
custom que reparte texto y formato inline (`strong`/`em`/`code`/`a`)
entre límites de oración — complejidad real y riesgo genuino de romper
el formato inline (PARTE 19) para un beneficio marginal frente a la
alternativa.

**Se eligió la opción B**: `Range` + **CSS Custom Highlight API**
(`CSS.highlights` + `Highlight`, `readAloudHighlight.ts`) — una capa de
pintado puramente visual (`::highlight(read-aloud-segment)` en CSS)
sobre un `Range` ya existente. Nunca inserta/mueve/reemplaza nodos DOM,
nunca toca lo que React administra, preserva intacto cualquier elemento
inline dentro del rango. `resolveSegmentRange` reconstruye el `Range`
recorriendo únicamente los nodos de texto del bloque tageado
(`data-read-aloud-block`) hasta los offsets guardados en el
`SpeechSegment` — nunca necesita guardar un `Range` en sí (quedaría
stale entre renders).

**Feature-detectada** (Chrome/Edge recientes; sin soporte en Firefox al
momento de escribir esto): sin soporte, el Reader simplemente no resalta
nada — sigue funcionando igual (audio, controles, velocidad),
degradación segura, mismo patrón que `isSpeechSupported()`. Confirmado
con QA real (sección 12) que en Chromium headless SÍ resalta
correctamente, incluso a través de líneas envueltas y sin romper
`<strong>`/`<code>`/`<a>` dentro de la frase.

Nunca bloquea `pointer-events` (los links siguen siendo clicables) ni
interfiere con selección/copia de texto — `::highlight()` es una capa de
pintado, no un elemento real.

## 8. Auto-follow (scroll)

`scrollIntoView({ block: "nearest", behavior: ... })` sobre el elemento
que contiene el `Range` activo. `block: "nearest"` scrollea únicamente el
contenedor con overflow real más cercano (`.content-panel__body`) —
nunca `window`, confirmado con QA real midiendo `window.scrollY` antes/
después de varios segmentos (sección 12). Respeta
`prefers-reduced-motion` (sin `behavior: "smooth"` si está activo).

**Bug real encontrado en QA** (jsdom, pero relevante para navegadores sin
soporte): `scrollIntoView` no está garantizado en todos los entornos —
`safeScrollIntoView` feature-detecta (`typeof el.scrollIntoView ===
"function"`) antes de llamarlo y nunca rompe el Reader si falta o lanza.
Sin este guard, `useReadAloud.test.ts` fallaba consistentemente en jsdom
con `TypeError: el.scrollIntoView is not a function` — el mismo bug
existiría en cualquier navegador/WebView real sin esa API.

## 9. Prefetch y cancelación

- `prefetchSegment(id, text)`: solo backend neural (el navegador no tiene
  concepto de red/prefetch). Siempre a `speed=1.0` — el rate elegido por
  el alumno se aplica en reproducción vía `HTMLAudioElement.playbackRate`
  (sección 10), nunca reenviando una síntesis distinta por cambio de
  velocidad. Nunca dos fetches para el mismo id.
- Al arrancar el segmento N, se adelantan hasta N+1 y N+2 (máximo 2,
  `MAX_PENDING_PREFETCH`) — nunca más.
- **Cancelación**: `stopReadAloudPlayer()` aborta TODOS los fetches en
  vuelo (`AbortController.abort()` real) y limpia el audio activo. Se
  llama en Stop, prioridad de IA reclamada, cambio de tópico y unmount.
- **Protección de respuesta obsoleta** (mismo patrón que
  `neuralSpeech.ts`, PARTE 26): un `epoch`/token incremental invalida
  cualquier callback async en vuelo — una respuesta de red tardía de un
  segmento ya descartado NUNCA reproduce ni dispara `onStart`. Test de
  regresión: `readAloudPlayer.test.ts::"una respuesta de red tardía de
  un segmento ya descartado (stop) nunca reproduce"`.
- **Cleanup de recursos**: cada `Audio`/object URL se revoca
  (`URL.revokeObjectURL`) apenas termina o se reemplaza — nunca queda un
  leak de object URLs, ni siquiera en un tópico largo con decenas de
  segmentos (memoria acotada: solo el actual + los prefetcheados en
  vuelo, PARTE 53).

## 10. Velocidad de reproducción

Opciones: `0.75/1.0/1.25/1.5/2.0` (default `1.0`) — set y escala DISTINTOS
de `VOICE_SPEED_OPTIONS` de la narración de clase
(`0.85/1.0/1.15/1.3`), nunca compartidos.

- **Neural**: se fetchea SIEMPRE a `speed=1.0` en el backend; el rate
  elegido se aplica vía `HTMLAudioElement.playbackRate` — instantáneo,
  sin resintetizar, afecta el audio actual Y todos los siguientes
  (`setReadAloudRate` aplica al `activeAudio` de inmediato Y queda
  guardado para cada `Audio` nuevo que se cree).
- **Navegador**: `SpeechSynthesisUtterance.rate` se fija al crear el
  utterance — cambiarlo en pleno vuelo no es confiable (comportamiento
  real del navegador, no un bug de este código). Documentado: el nuevo
  rate se aplica desde el SIGUIENTE segmento, nunca se reinicia el
  segmento actual para forzarlo (UX simple, sin workaround).
- **Persistencia**: solo el número (`pwc-tutor:read-aloud-rate` en
  `classroomStorage.ts`, mismo patrón que `VOICE_SPEED_KEY`) — nunca la
  frase actual, posición de reproducción, ni si el Reader está
  encendido (PARTE 31/66: eso siempre arranca en `idle`).

## 11. Máquina de estados

```
idle → loading → playing ⇄ paused
                     ↓         ↓
                completed    (stop) → idle
                     ↓
               (play() de nuevo) → loading (reinicia desde 0)
```

Prioridad de IA reclamada, cambio de tópico/tab, o unmount → `idle`
inmediato desde cualquier estado, siempre. `error` es alcanzable desde
`loading` (fallo de síntesis) y se recupera reintentando desde el
segmento actual (nunca reinicia desde 0, a diferencia de `completed`).

## 12. QA real (`spec-driven-design-expert`, voz neural configurada, Playwright)

- **Flujo completo**: Play → 3 requests reales a `/api/speech`
  (prefetch current+2 confirmado) → highlight visible en el H1 inicial,
  correctamente envuelto en 3 líneas en mobile → cambio de velocidad en
  pleno vuelo (sin error) → Pause (highlight permanece) → Resume → Stop
  (`CSS.highlights.get("read-aloud-segment")` pasa a `undefined` —
  confirmado programáticamente, no solo visual). **Cero errores de
  consola** en toda la secuencia.
- **Auto-follow nunca mueve `window`**: medido `window.scrollY` antes/
  después de varios segmentos en 1366×768/768×1024/390×844 — idéntico en
  los tres casos.
- **Responsive**: 0 overflow horizontal en los tres viewports, con el
  Reader activo y highlight visible. En mobile, la fila de controles
  envuelve limpiamente (`flex-wrap`) sin desplazar "Tema anterior/
  siguiente" de forma incómoda.
- **Preservación de términos técnicos** (PARTE 13/60): payload real
  capturado hacia `/api/speech` — `"Skills, MCP y fuentes de contexto"`
  enviado tal cual, sin reformular, `speed: 1` siempre (confirma el
  diseño de la sección 10).
- **PARTE 41 (crítico), integración real en `ClassroomPage.test.tsx`**:
  Reader en estado `loading` (fetch de síntesis deliberadamente sin
  resolver) → click en "Preparar clase con IA" (generación tampoco
  resuelve todavía) → el botón vuelve a "🔊 Leer tema" DE INMEDIATO, sin
  esperar a que la generación termine — confirma que la prioridad arranca
  en el evento de click, no en el audio.

## 13. Accesibilidad

- `aria-label` en el botón principal incluye el estado real ("Pausar
  lectura del tema (contenido del tema)", etc.) — nunca solo un ícono.
- CTA de "Detener" con `aria-label="Detener lectura del tema"`.
- Selector de velocidad con `aria-label` propio, navegable por teclado
  (elemento `<select>` nativo).
- Mensaje de error con `role="alert"`.
- **Sin `aria-live` por frase** (PARTE 56): un screen reader anunciando
  cada frase automáticamente duplicaría la propia síntesis de voz —
  nunca se hizo.
- `focus-visible` agregado al set compartido ya existente en
  `global.css` (mismo outline consistente que el resto del aula).

## 14. Frontend (resumen de archivos)

```
frontend/src/classroom/readAloudSegments.ts    (nuevo) — segmentación pura
frontend/src/classroom/readAloudHighlight.ts   (nuevo) — Range + CSS Custom Highlight API
frontend/src/classroom/readAloudPriority.ts    (nuevo) — pub/sub de prioridad de IA
frontend/src/classroom/readAloudPlayer.ts      (nuevo) — playback + prefetch (neural/navegador)
frontend/src/classroom/useReadAloud.ts         (nuevo) — hook: máquina de estados
frontend/src/classroom/ReadAloudControls.tsx   (nuevo) — UI
frontend/src/classroom/speech.ts               (+onStart, backward compatible)
frontend/src/classroom/classroomStorage.ts     (+persistencia de playbackRate)
frontend/src/classroom/useClassroomVoice.ts    (+claimAiAudioPriority)
frontend/src/classroom/TutorPanel.tsx          (+claimAiAudioPriority)
frontend/src/pages/ClassroomPage.tsx           (wiring + claimAiAudioPriority)
frontend/src/styles/global.css                 (+read-aloud-controls, ::highlight())
```

**Cero archivos de backend tocados** (`git status` confirma): el
endpoint `POST /api/speech` ya existente alcanzaba tal cual. Tutor,
Course Retrieval, Lesson prompt y `tutor-v4` permanecen exactamente
intactos — este bloque nunca los referencia.

## 15. Límites conocidos (honestos, no resueltos preventivamente)

- La CSS Custom Highlight API no tiene soporte universal (sin Firefox al
  momento de escribir esto) — degradación segura sin resaltado visual,
  nunca rompe el audio/controles.
- La segmentación por oración de `Intl.Segmenter` sigue siendo un
  heurístico de propósito general, no un parser de Markdown pedagógico
  — el fix de la sección 5.1 cubre el caso real encontrado (URLs/
  identificadores con `:`/`?`), no garantiza cobertura de cualquier
  patrón de puntuación técnica imaginable.
- La lectura de código no intenta pronunciar símbolos de forma especial
  (ni fue necesario en la QA real de este bloque) — si un tópico futuro
  revela que es genuinamente inusable, es una decisión de diseño
  separada, no resuelta preventivamente acá (PARTE 16).
- El cambio de velocidad de la voz del navegador solo se aplica desde el
  segmento siguiente (limitación real del navegador, no de este código).
