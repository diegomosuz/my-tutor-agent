# Release Notes — v1.5.0

Release candidate sobre v1.4.0. Un solo tema funcional —
**Guided Markdown Read Aloud** — más un hardening final. Reutiliza
íntegramente la arquitectura de voz ya existente (proveedor neural
OpenAI TTS de Fase 7, `speech.ts`/Web Speech API de Fase 4); no agrega
un segundo backend de voz, ningún modelo nuevo, ningún forced alignment,
ningún speech-to-text, ninguna dependencia grande nueva. Sin cambios de
arquitectura, sin base de datos, sin RAG/embeddings, sin agentes, sin
una segunda llamada LLM en ningún punto. `Tutor`, `Course Retrieval` y
`Lesson Generation` no se tocaron en ningún commit de este release.

## Guided Markdown Read Aloud

El alumno puede escuchar el Markdown del tópico — no la clase generada
por IA — leído en voz alta, con resaltado progresivo de la frase activa
y control de velocidad, desde el panel "Contenido del tema" del aula.

### Segmentación del DOM ya renderizado

`readAloudSegments.ts` segmenta el HTML que `SafeMarkdown` ya renderizó
(nunca el Markdown fuente por separado, para que la lectura nunca
diverja de lo que el alumno ve en pantalla). `Intl.Segmenter` con
granularidad de oración cuando el runtime lo soporta, con un fallback
determinístico basado en puntuación de cierre; frases largas se
subdividen solo en separadores seguros. Ambas heurísticas son
puramente estructurales (adyacencia de espacios en blanco), nunca listas
de vocabulario técnico ni patrones de "esto es una URL" — así una
URL con query string, una versión (`API v2.1`), un identifier
(`snake_case`/`camelCase`) o una llamada (`foo.bar()`) nunca se cortan
a mitad de token. Se leen headings, párrafos, ítems de lista, celdas de
tabla, blockquotes, bloques de código (verbatim, nunca reescritos ni
ejecutados) y el `alt` de imágenes — nunca botones/nav/Tutor ni
duplicados de accesibilidad ocultos.

### Resaltado sin tocar el DOM que React administra

`readAloudHighlight.ts` usa la CSS Custom Highlight API
(`CSS.highlights` + `Highlight` sobre un `Range`) — nunca
`dangerouslySetInnerHTML`, nunca inserta `<mark>`/`<span>` nuevos, nunca
reemplaza nodos. Feature-detectada: sin soporte (Firefox al momento de
escribir esto), el Reader funciona igual (audio, controles, velocidad),
simplemente sin resaltado visual. Links y selección de texto permanecen
intactos e interactivos en todo momento.

### Player dedicado, con prefetch acotado

`readAloudPlayer.ts` reutiliza el mismo endpoint/cliente de voz neural
(`api.synthesizeSpeech`) y el mismo wrapper de voz del navegador
(`speech.ts`) que ya usa el resto de la app. Es un módulo nuevo (no una
llamada directa a `speakTextNeural`) porque ese helper histórico hace
fetch+play en un solo paso con un único slot de estado — incompatible
con adelantar hasta 2 segmentos de síntesis mientras el actual todavía
suena. Invariante de "nunca dos audios sonando" preservada igual que en
el resto de la app.

### Prioridad absoluta de la IA

`readAloudPriority.ts` combina dos señales complementarias: el evento
puntual `claimAiAudioPriority()`/`onAiAudioPriority` (llamado desde los
puntos reales donde arranca audio de IA — Generar clase, narración de
escena, voz del tutor — ANTES de sintetizar/reproducir nada, deteniendo
el Reader de inmediato sin esperar a que el audio realmente empiece a
sonar) y el estado persistente `setAiAudioActive`/`isAiAudioActive`
(marcado por `voicePlayback.ts`, el único choque compartido por todos
los consumidores de voz de IA, mientras esa voz sigue sonando — ver
"Hardening" más abajo para el bug real que motivó esta segunda señal).
El Reader nunca llama a ninguna de las dos sobre sí mismo.

## Dos bugs reales de ciclo de vida, encontrados y corregidos durante el
desarrollo de este release (documentados con detalle en
`docs/GUIDED_READ_ALOUD_V1_5.md` secciones 4.1 y 11.1)

### Bug A — falsa propiedad de audio de IA

`aiAudioSessionActive` (la condición que deshabilita el Reader mientras
la IA "es dueña" del audio) solo comprobaba `voiceEnabled &&
!engine.isCompleted` — la mitad de la condición real que
`useClassroomVoice.ts` usa para efectivamente hablar (`enabled &&
scene`). Sin ninguna lección generada en la sesión actual,
`engine.currentScene` es `null` y ningún audio de IA puede sonar — pero
si `voiceEnabled` había quedado en `true` en `localStorage` de una
sesión anterior, "Leer tema" quedaba deshabilitado sin ninguna sesión
de audio real detrás. Corregido agregando `!!engine.currentScene` (el
mismo criterio real de `useClassroomVoice.ts`) y `lessonLoading` como
bloqueador explícito durante la generación completa (antes el Reader
podía re-habilitarse a mitad de una generación real).

### Bug B — Stop destruía la capacidad de reiniciar

`clearAll()` (usada por `hardStop()`, el helper interno detrás de
`stop()` y de la prioridad de IA) vaciaba `segmentsRef.current` y
borraba el marcado `data-read-aloud-block` del DOM — correcto solo para
un cambio de tópico/desmontaje, nunca para Stop sobre el mismo tópico.
Con los segmentos vacíos, la siguiente reproducción saltaba directo a
`completed` sin sintetizar ni reproducir nada: clickear "Leer
tema"/"Leer nuevamente" después de Stop no hacía nada perceptible.
Corregido separando `clearAll()` en `stopPlaybackSession()` (para
audio/prefetch/highlight/índice — lo único que Stop y la prioridad de
IA deben hacer) y dejando `clearAll()` exclusivamente para el cambio de
tópico y el unmount, los únicos casos donde invalidar segmentos/DOM
tags es correcto.

Ambos bugs quedan cubiertos por tests de regresión dedicados
(`ClassroomPage.test.tsx` tests C/D, `useReadAloud.test.ts` tests 12-17)
que fallan contra el commit anterior al fix respectivo, y por QA real de
navegador con TTS neural configurado.

## Ciclo de vida: Pause vs. Stop vs. Read Again

- **Pause/Resume**: conserva sesión, audio, posición y highlight —
  continúa el mismo `<audio>`/utterance.
- **Stop**: destruye la sesión de reproducción (audio activo, fetches en
  vuelo vía `AbortController`, highlight, índice vuelve a 0) pero
  preserva los `SpeechSegment`s y el marcado del DOM — el Reader queda
  reutilizable, nunca inutilizado.
- **Leer nuevamente** (tras Stop o al completar naturalmente): sesión
  NUEVA desde el segmento 0 (nuevo epoch/token internos del player,
  nuevo prefetch) — nunca un `resume()`.

## Control de velocidad

0.75×/1×/1.25×/1.5×/2× (default 1×), persistido en `localStorage` (solo
la tasa numérica, nunca posición/texto/audio). Voz neural: la síntesis
siempre pide `speed=1.0` y la velocidad elegida se aplica en vivo vía
`HTMLAudioElement.playbackRate` (nunca resintetiza). Voz del navegador:
`SpeechSynthesisUtterance.rate` (limitación documentada: algunos
navegadores no aplican un cambio de velocidad a mitad de un segmento ya
en curso — se aplica desde el próximo). La velocidad se conserva a
través de Stop → Leer nuevamente (no se resetea a 1×).

## Hardening del release candidate

Auditoría del diff acumulado completo (`v1.4.0..HEAD`). Dos hallazgos:

### Bug real encontrado y corregido: overlap de audio con la voz del tutor

`aiAudioSessionActive` (la prop que deshabilita el Reader mientras la IA
"es dueña" del audio) solo cubre la narración de escena
(`voiceEnabled && !!currentScene && !isCompleted`). La voz del
tutor/checkpoint/certificación, en cambio, solo dispara
`claimAiAudioPriority()` — un evento puntual de "detenete YA" — al
arrancar su secuencia, sin ningún equivalente persistente. Sin una
señal que reflejara "hay audio de IA sonando ahora mismo" durante TODA
la secuencia (una respuesta del tutor puede tener varios chunks/
párrafos), el Reader volvía a mostrarse habilitado apenas pasaba ese
instante inicial: un alumno podía reiniciarlo a mitad de una respuesta
hablada del tutor. Confirmado con instrumentación real de
`HTMLAudioElement` en QA de navegador (Chromium real, TTS neural real).

Corregido agregando una señal complementaria en `readAloudPriority.ts`
(`setAiAudioActive`/`isAiAudioActive`/`onAiAudioActiveChange`) marcada
por `voicePlayback.ts` — el único choque compartido por TODOS los
consumidores de voz de IA (narración, tutor, checkpoint, certificación)
— desde que arranca una secuencia hasta que termina (natural, cancelada,
o por error de un chunk, para nunca quedar "pegada" en `true`).
`useReadAloud.ts` se suscribe a esta señal y la combina con
`aiAudioSessionActive` tanto en `disabled` como en el guard de `play()`.
Verificado con tests unitarios dedicados (`voicePlayback.test.ts`,
`useReadAloud.test.ts`) y con QA real de navegador: muestreo de
`currentTime`/`paused` de cada `HTMLAudioElement` cada 100ms durante una
respuesta completa del tutor confirma cero muestras con más de un audio
audible simultáneo.

### Hallazgo no funcional: código muerto

`setAiAudioActive`/`isAiAudioActive` ya existían en `readAloudPriority.ts`
desde el commit original de la feature, pero sin ningún productor ni
consumidor real en ninguna dirección — un diseño incompleto de la
señal de arriba que nunca se terminó de cablear. Se identificaron y
eliminaron junto con su test (que solo ejercitaba código muerto) en una
primera pasada de la auditoría; el hallazgo de overlap de audio,
encontrado después en la misma sesión de hardening, terminó
reintroduciendo exactamente esas dos funciones — esta vez con
productor (`voicePlayback.ts`) y consumidor (`useReadAloud.ts`) reales.

Se agregó además un test de `React.StrictMode` para `useReadAloud`
(no existía ninguno) que confirma que el doble-invoke sintético de
efectos en desarrollo — el mismo patrón que produjo un bug real en
v1.2.0 (`usePedagogicalAnimation`) — nunca deja dos sesiones/audios
compitiendo acá: el efecto de segmentación se re-ejecuta después del
"fake unmount" de StrictMode y reconstruye los segmentos correctamente.

Resto de la auditoría (matriz completa de ownership de IA, aislamiento
de prefetch entre sesiones, restart bajo Pause/loading/rapid/triple-
stress, navegación de tópico/tema relacionado/browser Back, integridad
del DOM de `SafeMarkdown`, seguridad — sin `dangerouslySetInnerHTML`/
`eval`/`new Function`/`document.write`/`javascript:`/scripts dinámicos
en ningún archivo de Guided Read Aloud —, privacidad — sin telemetría/
analytics/historial de lectura/posición persistida, solo `playbackRate`
en `localStorage` —, responsive en 3 resoluciones, accesibilidad, y
regresión completa de Course Retrieval/Course-Grounded Tutor/provenance/
Learning Progress/Certification/Lesson Generation) **no encontró
hallazgos nuevos** — ya estaba correctamente cerrada por los tres
commits de desarrollo (`0ce36c7`, `6ea1bb1`, `7e9af55`). 585 tests de
backend (sin cambios) y 528 de frontend pasando (sin regresiones); build
de producción limpio; build Docker `--no-cache` limpio; `doctor.ps1` →
"Todo en orden".

## Qué NO afirma este release (límites honestos)

- **Sincronía a nivel de frase, no de palabra**: el highlight resalta la
  frase completa que está sonando, no cada palabra individual a medida
  que se pronuncia — no hay forced alignment ni timestamps por palabra
  de ningún proveedor.
- **La pronunciación depende del motor de TTS configurado** (neural u
  del navegador), no de la aplicación — igual que la narración de clase
  desde Fase 4/7. No hay diccionario de pronunciación ni reglas
  fonéticas nuevas.
- **La pronunciación de símbolos/código puede variar** entre proveedores
  — el texto se envía verbatim, nunca reescrito para "sonar mejor".
- **CSS Custom Highlight API tiene un boundary de soporte real**: Chrome
  y Edge recientes la soportan; sin soporte (Firefox al momento de
  escribir esto), el Reader sigue funcionando (audio, controles,
  velocidad) simplemente sin resaltado visual — degradación segura, no
  un error.
- **No hay posición de lectura persistida**: solo la preferencia de
  velocidad se guarda en `localStorage`; cerrar y volver a un tópico
  siempre reinicia el Reader (nunca continúa desde donde quedó).
- **Sin reconocimiento de voz ni interacción por voz con el Reader**:
  solo controles de botón/teclado, igual que el resto del aula.

## Notas de actualización (v1.4.0 → v1.5.0)

- **Sin migración de base de datos** (el proyecto no usa una).
- **Sin migración de cursos**: el formato de Markdown/frontmatter no
  cambió; los cursos existentes funcionan sin ninguna modificación.
- **Sin servicio de backend nuevo**: Guided Read Aloud reutiliza el
  mismo endpoint `POST /api/speech` (voz neural, Fase 7) y la misma
  Web Speech API del navegador (Fase 4) que ya existían. Ningún modelo
  nuevo, ninguna infraestructura nueva.
- **Cambio principalmente de frontend**: los únicos archivos de
  backend tocados en toda la cadena `v1.4.0..v1.5.0` son los cuatro
  ubicaciones canónicas de `APP_VERSION` — `Tutor`, `Course Retrieval`
  y `Lesson Generation` no se modificaron.
- `APP_VERSION`: `1.4.0` → `1.5.0` (`backend/app/config.py`,
  `docker-compose.yml`, `.env.example`).
- `LESSON_PROMPT_VERSION`: sin cambios, sigue en `lesson-v3.3.1`. Las
  caches de `LessonPlan` existentes se conservan intactas.
- `TUTOR_PROMPT_VERSION`: sin cambios, sigue en `tutor-v4`.
- Ningún endpoint HTTP nuevo, ningún endpoint eliminado, ningún cambio
  en el contrato público de ningún endpoint existente.
