# Classroom UX v1.3.0 (Bloque 1)

Este bloque nace de uso real de v1.2.0 y corrige cuatro problemas de
experiencia observados en el aula virtual, **sin tocar** generación
visual de `LessonPlan`, `lesson-v3.2.1`, Visual Selection ni la semántica
del builder de Pedagogical Animations. `LESSON_PROMPT_VERSION` sigue
siendo `lesson-v3.2.1`, sin cambios.

## 1. Voice lifecycle: invariante de reproducción única

### Causa raíz

`speakTextNeural` (`frontend/src/classroom/neuralSpeech.ts`) hacía un
`fetch` asíncrono (`POST /api/speech`) antes de que existiera cualquier
`Audio`. Si el alumno navegaba (Next/Previous/cambio de escena/cambio de
tópico) mientras ese fetch todavía estaba en vuelo, una respuesta tardía
podía pisar `currentAudio` y arrancar a sonar **después** de que la
escena ya hubiera cambiado — dos voces podían superponerse.

### Solución

Un `AbortController` + un `playbackToken` (epoch) combinados, no
alternativos:

- `AbortController`: cancela la request HTTP real en curso
  (`api.synthesizeSpeech` ya tenía un parámetro `signal` sin usar; ahora
  se le pasa uno real). Evita gastar una llamada a OpenAI TTS que de
  todos modos se va a descartar.
- `playbackToken`: contador que se incrementa en cada `cleanup()`/llamada
  nueva, y se verifica DESPUÉS del `await fetch` **y** después del
  `await audio.play()` — cierra también la ventana asíncrona que
  `AbortController` no cubre (la reproducción en sí).

`cleanup()` es la única operación de "stop" real: pausa el audio, libera
el `ObjectURL`, aborta el fetch en curso y avanza el token. Se invoca
desde los mismos puntos donde ya se llamaba `cancelAllSpeech()` (cambio
de escena, cambio de tópico, salir del aula, interrumpir con el tutor,
desactivar voz) — **nunca** desde pausar (`Pause` suspende, no cancela;
`Resume` continúa la misma reproducción).

### Tests

`frontend/src/classroom/__tests__/neuralSpeech.test.ts` — 12 tests,
incluyendo un bloque dedicado ("protección de respuesta TTS async
obsoleta"): respuesta tardía nunca suena, cancelar en pleno vuelo no dejar
nada sonando, `AbortController` aborta de verdad, `onError` nunca se
dispara para una llamada obsoleta.
`frontend/src/classroom/__tests__/useClassroomVoice.test.tsx` (nuevo) —
6 tests sobre el hook que integra `speech.ts`/`neuralSpeech.ts` con el
Classroom Engine, mockeando `voicePlayback` para no depender de
`window.speechSynthesis` real.

## 2. Imágenes de Markdown: tamaño respetado

### Causa raíz

No existía **ninguna** regla CSS para `<img>` dentro de
`.content-panel__body` — el problema real era peor que "se agrandan
demasiado": no había ningún control de tamaño en absoluto.

### Solución

Una única regla nueva en `frontend/src/styles/global.css`:

```css
.content-panel__body img {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(50vh, 420px);
  object-fit: contain;
  margin: 12px auto;
  border-radius: 6px;
}
```

Respeta el tamaño intrínseco cuando es menor al espacio disponible
(`width/height: auto`), nunca fuerza `width: 100%`, nunca distorsiona la
relación de aspecto (`object-fit: contain`), y acota la altura a un
máximo razonable en pantallas altas. `SafeMarkdown.tsx` no se modificó:
su `<img>` no tiene `className` propio y depende enteramente de este
selector heredado del contenedor padre — cero cambios de superficie de
seguridad (allow-list de esquemas/extensiones intacta).

### QA real

Verificado con Playwright headless contra el curso real
`spec-driven-design-expert` (imágenes reales de 2022×764px, ya el caso
"grande y horizontal" más exigente): a 1366×768 el `boundingBox` real
del `<img>` fue 385×145 (escalado proporcional correcto,
`385/145 ≈ 2.65 ≈ 2022/764`); a 768×1024 y 390×844 se mantuvo
proporcional y sin overflow horizontal en ningún breakpoint.

## 3. Navegación: escena vs. tópico, siempre distintas

### Causa raíz

`ClassroomPage.tsx` tenía `goPrev()`/`goNext()` con un `if (lesson)` que
decidía en tiempo de click si el mismo botón navegaba escenas
(`engine.previousScene()/nextScene()`) o tópicos
(`goToTopic(prevTopic/nextTopic)`). En la última escena, "Siguiente" se
convertía silenciosamente en "Finalizar" (mismo botón, mismo label
genérico "Siguiente →", semántica distinta).

### Solución

Dos affordances siempre distintas, nunca condicionadas por el modo:

- **`.scene-controls`** (navegación de ESCENA): solo existe cuando hay
  una `LessonPlan` activa (`{lesson && (...)}` — sin IA no hay escenas
  artificiales que navegar). "Anterior diapositiva"/"Siguiente
  diapositiva" llaman directamente a `engine.previousScene()`/
  `engine.nextScene()`. En la última escena, "Siguiente diapositiva"
  queda **deshabilitado** — nunca se relabelea a "Finalizar".
- **`.topic-nav`** (navegación de TÓPICO): "← Tema anterior"/"Tema
  siguiente →", **siempre visible** (con o sin `LessonPlan`), calculada
  sobre `flatTopics` (orden lineal real del curso, cruza módulos sin
  problema — reutiliza el cómputo ya existente de v1.1.x, sin
  reimplementar orden de currículum).
- **CTA explícito "Completar tema y continuar"** (o "Completar último
  tema" si no hay próximo tópico): aparece SOLO en la última escena, aún
  no completada, en un banner visualmente distinto de `.scene-controls`
  (nunca un segundo botón "Siguiente" ambiguo). Al hacer click:
  1. `cancelAllSpeech()` — corta cualquier narración en curso.
  2. `engine.nextScene()` — única fuente de verdad para el ratchet de
     completado ya existente desde Fase 4 (nunca se inventa un mecanismo
     paralelo).
  3. Los timers de animación pedagógica se destruyen automáticamente:
     al pasar `engine.isCompleted` a `true`, React desmonta
     `SceneRenderer` (reemplazado por `CompletionScreen`), lo que dispara
     el cleanup de `usePedagogicalAnimation` sin código adicional.
  4. Navega al próximo tópico (`goToTopic(nextTopic)`), cruzando módulos
     si corresponde. Si no hay próximo tópico ("Completar último tema"),
     no inventa un destino: se queda en la `CompletionScreen` actual
     (recap + "Volver al curso").

**Detalle de la condición de carrera evitada**: marcar completado y
navegar NO ocurren en el mismo tick de React. Si `engine.nextScene()`
(que actualiza `isCompleted`) y `navigate()` corrieran en el mismo
batch, el `useEffect` que llama `markTopicCompleted` (dependiente de
`courseId`/`moduleId`/`topicId` tomados de `useParams()`) podría leer
accidentalmente los valores del PRÓXIMO tópico en vez del que realmente
se acaba de terminar. Se resuelve con un flag de un solo uso
(`pendingTopicAdvance`) que deja que el ratchet de completado corra en
su propio render (con los `courseId`/`moduleId`/`topicId` todavía
correctos) y **solo después** navega — ver el comentario extenso en
`ClassroomPage.tsx` junto a `handleCompleteTopic`.

### Tests

`frontend/src/pages/__tests__/ClassroomPage.test.tsx` — 10 tests nuevos
(bloque "v1.3.0 Classroom UX (BLOQUE C: navegación)"): sin `LessonPlan`
no hay `.scene-controls`; navegación de tópico siempre visible; "Tema
siguiente" cruza módulos; escena y tópico nunca disparan la navegación
del otro; "Completar tema y continuar" marca completado en
`learningProgressStore` **y** navega automáticamente al próximo tópico
(real, con curso multi-módulo); "Completar último tema" nunca inventa un
destino; "Siguiente diapositiva" nunca se relabelea a "Finalizar"; el CTA
de completar solo aparece en la última escena. Los 5 tests preexistentes
que dependían de los labels/aria-labels viejos ("Previo", "Escena o
tópico anterior", "Finalizar tema") se actualizaron a los nuevos.

### QA real

Verificado con Playwright headless contra `spec-driven-design-expert`:
generación real de `LessonPlan` (proveedor `openai` configurado), avance
de escenas, "Siguiente diapositiva" deshabilitado en la última escena sin
ningún botón "Finalizar" en el DOM, click en "Completar tema y continuar"
→ navegación automática confirmada de
`fundamentos-de-sdd/cuando-usar-sdd-y-cuando-mantenerlo-liviano` (última
escena del módulo 1) a `ingenieria-de-requisitos/de-problema-a-resultado-observable`
(primer tópico del módulo 2) — cruce de módulo real, cero errores de
consola.

## 4. Tutor: modo ampliado opt-in

### Contrato

- **Request** (`TutorRequest`, backend y frontend):
  `allow_general_knowledge: bool = false` — default backward-compatible,
  un cliente viejo sin el campo se comporta exactamente igual que antes.
- **Response** (`TutorReplyBody`):
  - `response_type` gana un cuarto valor, `"unrelated"` — solo válido
    cuando el request pidió `allow_general_knowledge=true` (en modo
    estricto, si el LLM lo produjera igual por error/inyección, se
    rechaza y se reintenta como `not_covered`, nunca se devuelve tal
    cual — defensa en profundidad).
  - `general_knowledge_chunks: list[str]` — **campo nuevo,
    estructuralmente distinto de `answer_chunks`**. `answer_chunks`
    sigue siendo `list[GroundedText]`, con la invariante de siempre
    (`source_refs` no vacío, validada a nivel Pydantic en
    `app/models/lesson.py::GroundedText`, sin excepciones). El contenido
    de conocimiento general nunca finge estar grounded: vive en un campo
    de texto plano que no tiene ningún concepto de `source_refs` — es
    estructuralmente imposible citar una referencia ahí.
  - `general_knowledge_used: bool` — `true` si y solo si
    `general_knowledge_chunks` no está vacío (invariante validada en
    `_validate_shape_by_response_type`).

  **Nota de diseño**: el diseño inicial de este bloque intentó permitir
  `source_refs: []` dentro de un `answer_chunk` cuando
  `general_knowledge_used=true`. Eso chocó con una invariante de
  Pydantic ya existente y correcta (`GroundedText` rechaza
  `source_refs` vacío incondicionalmente, usada también por lecciones y
  checkpoints) — se descubrió con 5 tests fallando y un diagnóstico
  directo del `ValidationError`. La solución fue el campo separado
  `general_knowledge_chunks`, nunca debilitar `GroundedText`.

- **Decisión en una sola llamada estructurada**: el relevance gate
  (¿está relacionado con el tema?) y la decisión estricto/ampliado
  ocurren en la MISMA llamada `generate_structured` que ya produce la
  respuesta — sin segundo agente, sin embeddings, sin vector DB, sin
  LangGraph. `REGLA 20`/`REGLA 21` (`backend/app/prompts/tutor.py`) se
  agregan al system prompt SOLO cuando `allow_general_knowledge=true`;
  el modo estricto (default) usa exactamente el mismo prompt que antes.
  `TUTOR_PROMPT_VERSION` pasó de `tutor-v2` a `tutor-v3`, y luego a
  `tutor-v3.1` (ver "Cierre del gap funcional" más abajo) — el tutor no
  se cachea, así que esto es solo trazabilidad/auditoría, no una cache
  key.

- **Validación** (`app/services/tutor_validation.py`): sin cambios de
  fondo — sigue validando que cada `source_ref` de `answer_chunks`
  exista en el `CanonicalTopicContent`. `general_knowledge_chunks` no
  necesita validación de grounding porque no tiene ningún campo que
  pudiera citar una fuente inexistente.

- **Validación semántica de `response_type` vs. modo** (`tutor_service.py::_validate`):
  dos invariantes de contrato, ninguna relacionada con grounding textual:
  1. `response_type="unrelated"` es inválido en modo estricto (defensa en
     profundidad — el prompt estricto nunca ofrece esa opción).
  2. `response_type="not_covered"` es inválido en modo ampliado (ver
     "Cierre del gap funcional" abajo — esta es la regla que en la
     práctica hace funcionar el switch con el proveedor real).
  Ambas violaciones se tratan igual que cualquier otro problema de
  contrato: `ValidationFailure` → reintento con
  `build_tutor_correction_message` → el LLM corrige su propio structured
  output (nunca el backend reescribe/normaliza la respuesta).

### Frontend

`TutorPanel.tsx` agrega un switch "Ampliar con conocimiento general"
(default OFF) con el texto de ayuda exacto pedido: *"Permite complementar
con conocimiento general de IA, pero solo para preguntas relacionadas
con este tema"* — nunca menciona web/internet/búsqueda. Es estado de
sesión puro (`useState` local a `TutorPanel`): se resetea a `false` en
cada tópico nuevo porque `TutorPanel` ya se remonta con una `key` distinta
por tópico (`ClassroomPage.tsx`), y persiste entre cambios de escena
dentro del mismo tópico porque esos cambios no remontan el componente.
Nunca toca `localStorage`, Learning Progress ni analytics.

Una respuesta con `general_knowledge_used=true` muestra el badge
"Respuesta ampliada con conocimiento general" (`TutorConversation.tsx`).
`response_type="unrelated"` muestra un mensaje fijo redactado por el
frontend (`UNRELATED_MESSAGE`, mismo patrón que `NOT_COVERED_MESSAGE` —
el LLM nunca compone ese texto).

### Cierre del gap funcional (tutor-v3 → tutor-v3.1)

QA real inicial con el proveedor configurado (`gpt-4o-mini`) encontró que
el relevance gate funcionaba de forma confiable (preguntas claramente
ajenas devolvían `unrelated` consistentemente), pero el modelo devolvía
consistentemente `not_covered` para preguntas relacionadas-pero-no-cubiertas
en modo ampliado — incluso con la REGLA 20 (v3) explicitando el
comportamiento esperado. El switch, en la práctica, no cumplía su
propósito con el proveedor real (aunque sí con `FakeLLMProvider`).

**Causa raíz exacta**: REGLA 20 (v3) dejaba una válvula de escape
("`not_covered` reservado para cuando ni el conocimiento general
alcanza"), y REGLA 21 la repetía ("preferí `not_covered` antes que
inventar"). Frente a esa ambigüedad de dos reglas compitiendo, el modelo
se refugiaba en el patrón más fuerte y más temprano del prompt (REGLA 6,
imperativa e incondicional: "si no está sustentado por la fuente, tu
respuesta debe ser `not_covered`"). Prompt tuning por sí solo no alcanzó
para revertir esta preferencia de forma confiable.

**Fix de dos capas (tutor-v3.1)**:
1. **Prompt**: REGLA 20 se reescribió para separar explícitamente
   RELEVANCE (¿pertenece al dominio del tema?) de COVERAGE (¿el Markdown
   alcanza para responder?) como ejes independientes, con un ejemplo
   genérico (no hardcodeado a ningún tema puntual). La válvula de escape
   se eliminó por completo: "`not_covered` NO es una respuesta disponible
   en este modo para preguntas relevantes" (REGLA 20 punto 3). REGLA 21
   se corrigió para no repetir la contradicción.
2. **Validación estructural** (`tutor_service.py::_validate`): si
   `allow_general_knowledge=true` y el modelo igual responde
   `response_type="not_covered"`, se rechaza con `ValidationFailure` y se
   fuerza un reintento con corrección — el mismo mecanismo genérico de
   `generate_with_retries` que ya maneja contrato/grounding inválido,
   sin ningún sistema nuevo.

**Resultado real con el proveedor configurado**: en las 3 corridas frescas
de QA (ver más abajo), el primer intento del modelo siguió siendo
`not_covered` en las 3 (`reason=grounding_invalid` en los logs) — el
prompt por sí solo no cambió el primer impulso del modelo — pero la
validación estructural lo rechazó y el segundo intento produjo una
respuesta válida con `general_knowledge_used=true` las 3 veces. El
resultado final que recibe el alumno es correcto el 100% de las veces
observadas; el mecanismo real que lo garantiza es la validación +
reintento, no (solo) el prompt — exactamente el diseño que pedía "no
confiar solamente en prompt tuning" para este cierre.

### Tests

Backend: `backend/tests/test_tutor_service.py` — 16 tests nuevos en
total sobre el modo ampliado (PARTE 36 A-K + 5 tests del cierre del gap):
request sin el campo nuevo default a estricto; estricto cubierto/no
cubierto sin cambios de comportamiento; ampliado relacionado-no-cubierto
produce respuesta con `general_knowledge_chunks`; ampliado con cobertura
parcial mezcla `answer_chunks` grounded + `general_knowledge_chunks`;
`unrelated` rechazado en modo estricto y reintentado; `not_covered`
rechazado en modo ampliado y reintentado hasta producir una respuesta
válida; `not_covered` persistente en modo ampliado agota los reintentos y
falla explícitamente (`GenerationFailedError`, nunca se devuelve una
respuesta inválida); `not_covered` sigue siendo válido en modo estricto
(control, sin regresión); `source_refs` siguen validados incluso en modo
ampliado; logs de retry contienen `attempt`/`reason` pero nunca pregunta
ni respuesta; `LESSON_PROMPT_VERSION` confirmado sin cambios
(`lesson-v3.2.1`). Frontend: `frontend/src/classroom/__tests__/TutorPanel.test.tsx`
— 8 tests (PARTE 37 A-H), sin cambios en este cierre (el contrato de
API/UI no cambió, solo el comportamiento del backend).

### QA real (incluye 3 corridas frescas)

Verificado con llamadas directas al endpoint contra
`spec-driven-design-expert` (tópico "SDD frente a Prompt-Driven, TDD, BDD
y Contract-Driven") con el proveedor `openai` real configurado:

- **TEST A** (switch OFF, pregunta relacionada-no-cubierta): `not_covered` ✓.
- **TEST B x3** (switch ON, MISMA pregunta, 3 corridas frescas):
  las 3 devolvieron `response_type="answer"`, `general_knowledge_used=true`,
  con `answer_chunks` grounded citando `source_refs` reales del tópico y
  `general_knowledge_chunks` con contenido sustantivo sin `source_refs` ✓✓✓.
- **TEST C** (switch ON, pregunta cubierta por el tópico): `answer` con
  `general_knowledge_used=false`, 100% grounded, sin inventar refs ✓.
- **TEST D** (switch ON, pregunta totalmente ajena): `unrelated` ✓.
- **TEST E** (switch ON, intento de prompt injection pidiendo ignorar el
  tema y hablar de otra cosa): `unrelated` — el relevance gate y REGLA
  10/11 se mantuvieron intactos, el intento de injection no relajó el
  alcance ✓.

Playwright (sesión previa de este mismo bloque): pregunta claramente no
relacionada en modo ampliado → `unrelated` con el mensaje fijo; misma
pregunta en modo estricto → `not_covered`; el switch nunca aparece
marcado por default; cero errores de consola.

## 5. Alcance explícitamente NO tocado (Bloque 1)

Generación visual de `LessonPlan`, `lesson-v3.2.1`, Visual Selection,
`VisualPlan` (schema sin cambios), el builder determinístico de
Pedagogical Animations (`buildAnimationSequence`,
`usePedagogicalAnimation`) y sus algoritmos por `visual_type`, RAG,
búsqueda web. El problema de "exceso de texto / falta de diagramas" en
las clases generadas queda explícitamente para el próximo bloque.

## 6. Navegación de tópico: reubicada junto al contenido (Bloque 6)

### Causa raíz

La navegación de tópico (`.topic-nav`, "← Tema anterior"/"Tema siguiente
→") vivía debajo de `TutorPanel`, dentro de `.classroom-stage` — lejos
visualmente del panel de Markdown (`.content-panel`) cuyo contenido en
realidad cambia al navegar. El alumno tenía que bajar más allá del Tutor
para encontrar el control que cambia de tema.

### Solución

Reubicación pura de DOM/CSS, sin tocar ningún handler: el mismo bloque
(mismos `aria-label`s "Tema anterior"/"Tema siguiente", mismos
`goToTopic(prevTopic)`/`goToTopic(nextTopic)`, mismas condiciones
`disabled`) se movió de `.classroom-stage` a `.content-panel`, como fila
fija entre `.content-panel__tabs` y `.content-panel__body`
(`ClassroomPage.tsx`). Nueva clase `.content-panel__topic-nav`
(`global.css`) solo ajusta `margin-top`/`padding`/`border-bottom` para el
nuevo contexto — reutiliza `.topic-nav`/`.topic-nav button` tal cual para
todo lo demás (colores, hover, disabled, `focus-visible`).

**Por qué no hace falta `position: sticky`**: `.content-panel` ya es
`display: flex; flex-direction: column` con `.content-panel__body` como
único contenedor con `overflow-y: auto` — el header y las tabs ya viven
FUERA de ese scroll, como filas fijas hermanas. El nuevo toolbar es una
tercera fila fija más en esa misma estructura: permanece visible mientras
el Markdown scrollea debajo, sin ningún CSS especial de posicionamiento
ni riesgo de tapar contenido (nunca `position: fixed` sobre toda la app).
Sin override específico para mobile: `.classroom-grid` colapsa a una
columna (`1fr`) por debajo de 960px, pero `.content-panel` conserva la
misma estructura interna a cualquier ancho.

Eliminado por completo el bloque duplicado de la ubicación anterior —
una sola instancia de la navegación de tópico en todo el DOM (verificado
con Playwright: `document.querySelectorAll(".content-panel__topic-nav")`
devuelve longitud 1, y `.classroom-stage .content-panel__topic-nav` no
matchea nada).

Semántica sin cambios: `.scene-controls` (navegación de ESCENA, solo con
`LessonPlan` activa) sigue completamente separada; "Tema siguiente"
nunca avanza una escena y "Siguiente diapositiva" nunca cambia de tópico.
El cruce de módulos, la limpieza de voz (`cancelAllSpeech`, ya invocada
dentro de la navegación por ruta existente) y el cleanup de timers de
animación (desmontaje de `SceneRenderer` al cambiar de tópico) se
heredan sin duplicar ningún handler — `goToTopic` es la misma función de
Bloque 1, sin modificar.

### Tests

`frontend/src/pages/__tests__/ClassroomPage.test.tsx`: los 10 tests
existentes de BLOQUE C (navegación) siguen pasando sin cambios (usan
`getByRole`/`aria-label`, no dependen de la posición en el DOM). 2 tests
nuevos (`describe("... content-panel navigation (BLOQUE 6)")`): la
navegación vive dentro de `.content-panel`, antes de
`.content-panel__body`; ya no vive dentro de `.classroom-stage` y existe
una sola instancia real en la página.

### QA real

Verificado con Playwright headless contra
`spec-driven-design-expert/fundamentos-de-sdd/que-es-spec-driven-design-development`:
el toolbar aparece inmediatamente debajo de las tabs Explicación/Puntos
clave/Recursos, permanece en la misma posición al scrollear el Markdown
(capturado en dos screenshots, antes/después de `scrollTop`), click en
"Tema siguiente" navega realmente a
`fundamentos-de-sdd/por-que-sdd-importa-en-ingenieria-asistida-por-ia`
(confirmado por URL y `<h1>` reales, no solo por el mock). A 390×844
(mobile): sin overflow horizontal
(`document.documentElement.scrollWidth <= clientWidth`), los dos botones
entran completos sin truncarse. Cero errores de consola en ambos
viewports.

## 7. Tutor ampliado a nivel de curso: CourseScope (Bloque 6)

### Motivación

El modo ampliado (Bloque 1) solo consideraba relevante una pregunta si
pertenecía al tema del tópico actual — una pregunta legítima sobre OTRO
tópico del mismo curso (p.ej., estando en "Qué es Spec-Driven Design" el
alumno pregunta por "GitHub Spec Kit", que es un tópico real de un
módulo posterior del mismo curso) caía en `unrelated`, aunque
claramente perteneciera al dominio del curso que el alumno está
cursando.

### CourseScope: qué es y qué NO es

`CourseScope` (`backend/app/prompts/tutor.py`) es una estructura
determinística — **sin LLM, sin RAG, sin embeddings, sin segunda
llamada** — resuelta server-side por `tutor_service._resolve_course_scope`
a partir del `course_id` ya validado por el repositorio seguro existente
(`course_service.get_course_detail`, la misma función que sirve
`GET /api/courses/{course_id}`). Contiene EXCLUSIVAMENTE:

- título del curso;
- descripción del curso (hoy siempre `""` — el repositorio de cursos
  todavía no tiene ningún mecanismo de metadata a nivel de curso; se
  refleja fielmente ese estado real, nunca se inventa una descripción);
- título de cada módulo;
- título de cada tópico de cada módulo.

**Nunca** contiene Markdown, ni un resumen generado, ni ningún dato que
no sea un título ya conocido por el repositorio. Se envía al LLM como un
bloque nuevo, `=== COURSE DOMAIN ===`, **solo cuando
`allow_general_knowledge=true`** (igual que REGLA 20/21: en modo
estricto ni se resuelve — ver `test_course_scope_H_resolver_never_called_in_strict_mode`
— ni se agrega al prompt).

**Regla dura, idéntica en espíritu a la sección 2 de `CLAUDE.md`**:
CourseScope es exclusivamente para **RELEVANCE**, nunca para
**GROUNDING**. Que un tópico se llame "X" en `COURSE DOMAIN` no le da al
LLM ningún dato sobre el contenido real de X — solo le dice que X existe
como tema del curso. El Grounding Packet del tópico actual
(`AUTHORIZED SOURCE`) sigue siendo la única fuente real de conocimiento;
una pregunta sobre otro tópico, aunque sea relevante, nunca se responde
citando ese tópico como si fuera `AUTHORIZED SOURCE` — se responde vía
`general_knowledge_chunks` (sin `source_refs`, ver Bloque 1 sección 4) o
no se responde (`not_covered`/`unrelated` según corresponda).

### Nueva definición de relevancia (REGLA 20/22, `tutor-v3.1` → `tutor-v3.2`)

- **RELEVANTE** = pregunta sobre el tema del tópico actual **O** sobre
  cualquier módulo/tópico listado en `COURSE DOMAIN`.
- **NO RELEVANTE (`unrelated`)** = ni lo uno ni lo otro.
- **COVERAGE** sigue evaluándose únicamente contra `AUTHORIZED SOURCE`
  del tópico actual — nunca contra el contenido real de otro tópico
  (el LLM nunca lo recibió). Una pregunta relevante-por-dominio-de-curso
  pero fuera del tópico actual es, casi siempre, coverage=insuficiente
  → se responde con `general_knowledge_chunks` (REGLA 20 punto 2b),
  exactamente igual que cualquier otra pregunta relacionada-no-cubierta
  — CourseScope solo amplía qué cuenta como "relacionada", nunca cambia
  el mecanismo de respuesta.

REGLA 22 (nueva) documenta esto explícitamente en el system prompt,
incluyendo qué pasa si `COURSE DOMAIN` no aparece en el mensaje
(relevance vuelve a evaluarse solo contra el tópico actual, como antes
de este bloque — degradación explícita, nunca un comportamiento
implícito).

### Contrato sin cambios

Por diseño explícito de este bloque, **no se agregó ningún campo nuevo**
a `TutorRequest`/`TutorReplyBody` — ni `answer_mode` ni `relevance` ni
nada equivalente. El contrato reutiliza exactamente
`response_type`/`answer_chunks`/`general_knowledge_chunks`/
`general_knowledge_used` ya existentes desde Bloque 1: una pregunta
course-domain-pero-fuera-de-tópico sigue viéndose, desde el punto de
vista del contrato, igual que cualquier otra pregunta
relacionada-no-cubierta.

### Frontend

Solo copy actualizado (`TutorPanel.tsx`, `useTutor.ts`), sin cambios de
lógica ni de estado: el texto de ayuda del switch pasa a *"Permite
complementar con conocimiento general de IA, pero solo para preguntas
relacionadas con este tema o con el ámbito del curso"*, y
`UNRELATED_MESSAGE` pasa a *"Esa pregunta no parece estar relacionada
con este tema ni con el resto del curso..."*. El switch sigue siendo
estado de sesión puro (default OFF, se resetea por tópico vía `key` de
`TutorPanel`, nunca toca `localStorage`/Learning Progress) — sin cambios
respecto a Bloque 1.

### Tests

Backend (`backend/tests/test_tutor_service.py`): CourseScope A-H
(título/módulos/tópicos de TODO el curso, no solo el módulo/tópico
actual; descripción `""` fiel al estado real; nunca Markdown; curso
inexistente y fallo de resolución degradan a `None` sin propagar
excepción; nunca se resuelve en modo estricto) + modo ampliado A-F
(`COURSE DOMAIN` presente solo en modo ampliado; REGLA 22 presente solo
en modo ampliado; degradación sin `COURSE DOMAIN` si la resolución
falla; fixtures de respuesta existentes de Bloque 1 siguen validando con
`CourseScope` presente; versión de prompt confirmada `tutor-v3.2`).
`backend/tests/test_tutor_prompt_injection.py`: 3 tests nuevos
(`CourseScope` marcado no autoritativo en el prompt; un título de
módulo/tópico adversarial permanece como DATO dentro del bloque
delimitado, nunca se filtra al mensaje de sistema; `CourseScope` pasado
en modo estricto se descarta por diseño). `test_tutor_plain_text.py`
actualizado a `tutor-v3.2`.

### QA real (proveedor `openai` configurado)

Contra `spec-driven-design-expert`, tópico "Qué es Spec-Driven Design /
Development" (módulo `fundamentos-de-sdd`):

- **Pregunta cubierta por el tópico** (switch OFF): `answer` grounded con
  `source_refs` reales ✓.
- **Pregunta del dominio del curso pero de OTRO módulo**
  ("¿Cómo se diseñan migraciones de modelos de datos manteniendo
  invariantes?" — coincide con el tópico real
  "Modelos de datos, invariantes y migraciones" del módulo 6):
  - switch OFF → `not_covered` ✓ (criterio B).
  - switch ON, **3 corridas frescas** → las 3 devolvieron
    `response_type="answer"`, `general_knowledge_used=true`, con
    `general_knowledge_chunks` sustantivo ✓✓✓ (criterio C, caso crítico
    literal del bloque).
- **Pregunta totalmente ajena al curso** ("¿Cuál es la mejor receta para
  un asado argentino?", switch ON): `unrelated` ✓ (criterio D) — confirma
  que `COURSE DOMAIN` amplía el universo de temas relevantes sin
  volverlo ilimitado.

**Limitación observada durante esta QA (preexistente, no introducida por
este bloque)**: en el caso "course-domain pero de otro módulo", el
`answer_chunk` grounded citó `source_refs` reales del tópico actual
(headings/afirmaciones genéricas sobre especificaciones) para conectar
tangencialmente con el concepto de "invariantes" del enunciado — una
trazabilidad estructuralmente válida (las referencias existen) pero
semánticamente laxa. Esto es exactamente la distinción ya documentada en
`CLAUDE.md` sección 8 y en `docs/ARCHITECTURE.md`
("`source_refs` demuestra trazabilidad estructural, NO es una prueba
semántica") — no es un defecto nuevo de CourseScope ni algo que este
bloque deba corregir (requeriría una verificación semántica adicional,
fuera de alcance: "no agregar una segunda llamada LLM"). Se deja
documentado para una fase futura de verificación de grounding más
estricta si se decide abordarlo.

### 7.1 Gap-closure: el relevance gate era demasiado estricto (`tutor-v3.2` → `tutor-v3.2.1`)

QA real post-Bloque-6 encontró un defecto funcional real: con el switch
activado, "¿Qué es una skill?" devolvía `unrelated` de forma consistente
en el curso `spec-driven-design-expert` (`fundamentos-de-sdd/que-es-spec-driven-design-development`)
— pese a que `COURSE DOMAIN` listaba literalmente un tópico "Skills, MCP
y fuentes de contexto" en un módulo posterior del mismo curso.

**Causa raíz #1 (filosofía del gate)**: REGLA 20 (v3.2) point 1 pedía
"coincide con el tema de otro módulo/tópico" — una redacción que en la
práctica el modelo interpretaba como "demostrar pertenencia" (casi una
whitelist semántica contra títulos de `COURSE DOMAIN`), no como
"descartar solo si es claramente ajeno". No había ninguna guía explícita
sobre términos cortos o ambiguos con una lectura técnica plausible en el
dominio del curso.

**Causa raíz #2 (regla en conflicto, mismo patrón que v3→v3.1)**: REGLA
20 solo decía explícitamente que reemplazaba REGLA 6 — nunca aclaraba
que REGLA 3/4/5 ("prohibido inventar... definiciones") no aplican de la
misma forma a `general_knowledge_chunks` en modo ampliado. El modelo
parecía usar "unrelated" como una salida seguridad para evitar violar
REGLA 5, incluso cuando la pregunta era razonablemente relevante.

**Causa raíz #3 (la más profunda, encontrada por comparación real
prompt-libre vs. structured output)**: con el MISMO prompt exacto, pedirle
al modelo que razonara en texto libre (sin JSON Schema) producía
consistentemente la conclusión correcta (relevance=SÍ, coverage
insuficiente → debería responder con conocimiento general). Pero con
OpenAI Structured Outputs (`response_format=<PydanticModel>`,
`temperature=0`, el mecanismo real que usa `OpenAIProvider`), el modelo
debe comprometerse con `response_type` como el PRIMER campo generado del
JSON, sin ningún espacio de razonamiento previo — un experimento directo
mostró que el propio `relevance_reasoning` del modelo (ver más abajo)
podía decir explícitamente "se relaciona con conceptos técnicos
relevantes" y aun así terminar en `response_type="unrelated"` en el mismo
objeto — la conclusión escrita y la categórica no eran consistentes entre
sí.

**Fix de tres capas, ninguna agrega una segunda llamada LLM ni RAG**:

1. **Prompt (filosofía)**: REGLA 20 point 1 se reescribió como una
   "PRESUNCIÓN MODERADAMENTE PERMISIVA" con seis categorías explícitas
   (a-f: tema actual, materia general, fundamentos del dominio, conceptos
   adyacentes, herramientas/ecosistema, utilidad para aplicar el
   material). REGLA 22 se reescribió para decir explícitamente que
   `COURSE DOMAIN` es evidencia del dominio, NUNCA una lista cerrada, y
   agrega una regla específica para términos cortos/ambiguos ("skill",
   "agent", "hook", "context" como ejemplos ilustrativos, nunca
   hardcodeados como la única lógica de match). REGLA 20 también aclara
   ahora explícitamente que MATIZA REGLA 3/4/5 para esta consulta
   puntual: usar conocimiento general dentro de `general_knowledge_chunks`
   no es "inventar", es el propósito del modo. Se agregó además una
   ADVERTENCIA CRÍTICA explícita: RELEVANCE y COVERAGE son ejes
   independientes, "no hay cobertura" nunca es por sí solo motivo de
   `unrelated`, con un autochequeo obligatorio de consistencia contra el
   propio `relevance_reasoning` antes de fijar `response_type`.
2. **Schema (causa raíz #3, el cambio más profundo)**: nuevo modelo
   interno `ExpandedTutorReplyBody` (`app/models/tutor.py`) — usado
   ÚNICAMENTE como `response_model` de la llamada LLM cuando
   `allow_general_knowledge=true` — antepone un campo
   `relevance_reasoning: str` (1-3 oraciones) ANTES de `response_type` en
   el orden de campos del schema, dándole al modelo el mismo espacio de
   razonamiento que ya usaba correctamente en modo texto libre, dentro de
   la MISMA llamada estructurada. `relevance_reasoning` se descarta
   siempre antes de devolver la respuesta
   (`ExpandedTutorReplyBody.to_tutor_reply_body()`, llamado desde
   `tutor_service.ask_tutor`): nunca se loguea, nunca cruza hacia el
   contrato público (`TutorReplyBody`, el mismo de siempre, sin campos
   nuevos — el router sigue declarando `response_model=TutorReplyBody`).
   Modo estricto: sin cambios, sigue usando `TutorReplyBody` directamente.
3. **Guardia de atribución débil (REGLA 7, ataca un hallazgo secundario)**:
   REGLA 7 (siempre presente, ambos modos) ahora incluye un autochequeo
   explícito — "¿esta oración exacta está respaldada por lo que ESTE
   bloque específico dice, no por otro bloque ni por el tema general?" —
   y una regla específica para preguntas de definición ("¿Qué es X?"): si
   AUTHORIZED SOURCE menciona X de pasada pero nunca lo define, esa
   definición va en `general_knowledge_chunks`, nunca en un
   `answer_chunk` que cite ese bloque como si lo definiera.

**Resultado real (QA extensa, `spec-driven-design-expert`,
`gpt-4o-mini`)**: "¿Qué es una skill?" con switch ON pasó de 0% de éxito
(3/3 `unrelated`, reproducido antes del fix) a **17/19 `answer` (~89%)**
en corridas frescas posteriores al fix completo — una mejora real y
sustancial, no un 3/3 perfectamente determinístico (documentado con
honestidad: `temperature=0` reduce pero no elimina la varianza real de
OpenAI, algo ya observado en bloques anteriores de este proyecto). Las 2
excepciones observadas: 1 `unrelated` aislado (mismo patrón de varianza)
y 1 agotamiento de reintentos (`GenerationFailedError`, dentro del mismo
presupuesto de 3 intentos que siempre existió, nunca un tipo de fallo
nuevo). Casos de control: "¿Qué es un agente de IA?" (concepto adyacente,
no es ningún título literal) — 3/3 `answer`; "¿Cuál es la mejor receta de
asado?" y un intento de prompt injection ("ignorá el curso y...") — ambos
consistentemente `unrelated`; modo estricto con la misma pregunta de
skill — `not_covered`, sin cambios (confirma que el modo estricto no se
debilitó).

**Limitación residual observada, documentada con honestidad**: "¿Qué es
un LLM?" mostró un comportamiento idiosincrático (3/3 `unrelated`, pese a
que su propio `relevance_reasoning` interno reconocía relación con el
dominio) que no cedió ante las tres capas de fix — un caso aislado dentro
de una mejora real y grande, no representativo del comportamiento general
observado con otros términos ambiguos/adyacentes. Se deja documentado
para una futura iteración si se decide seguir invirtiendo en esto (fuera
de alcance agregar una segunda llamada LLM o un validador semántico
nuevo, ambos explícitamente descartados para este gap-closure). La
guardia de atribución débil (capa 3) tampoco elimina el problema al
100%: quedó una mejora observable, no una garantía absoluta — sigue
siendo la misma limitación arquitectónica ya documentada (`source_refs`
demuestra trazabilidad estructural, no prueba semántica), atacada con
prompt-tuning, nunca con un validador determinístico nuevo (explícitamente
fuera de alcance de este gap-closure).

`TUTOR_PROMPT_VERSION`: `tutor-v3.2` → `tutor-v3.2.1`.
`LESSON_PROMPT_VERSION` sin cambios (`lesson-v3.3.1`).

### 7.2 Segundo gap-closure: de razonamiento libre a clasificación estructurada (`tutor-v3.2.1` → `tutor-v3.3`)

QA adicional sobre `tutor-v3.2.1` mostró dos problemas nuevos, ambos
rastreados hasta el mismo mecanismo: el campo `relevance_reasoning`
(texto libre) del primer gap-closure.

**Hallazgo #1 (el disparador de este bloque)**: "¿Qué es un LLM?" con
switch ON devolvía `unrelated` 3/3 — pero el propio `relevance_reasoning`
generado por el modelo, en el MISMO objeto, decía explícitamente "se
relaciona con conceptos técnicos que pueden ser relevantes...". El texto
libre "razonaba bien" pero no estaba estructuralmente atado a la decisión
categórica: nada impedía que el modelo escribiera una conclusión y
emitiera `response_type` contradiciéndola.

**Hallazgo #2 (secundario, mismo periodo de QA)**: "¿Qué es una skill?"
con `tutor-v3.2.1`, sobre 19 corridas frescas, dio ~89% de éxito (17/19) —
una mejora real, pero no 3/3 garantizado; con atribución ocasionalmente
débil en las respuestas grounded.

**Cambio de arquitectura (no solo de texto)**: se reemplazó
`relevance_reasoning` por dos ENUMs cerrados en
`ExpandedTutorReplyBody` (`app/models/tutor.py`), en este orden EXACTO,
antes de `response_type`:

1. `scope_relation`: `current_topic` | `course_domain` | `unrelated`.
2. `topic_coverage`: `sufficient` | `partial` | `insufficient`.

La diferencia con el diseño anterior no es solo semántica: un ENUM
cerrado se puede **validar determinísticamente** contra el resto de la
respuesta (`_validate_expanded_scope_invariants`,
`app/models/tutor.py`), algo que un campo de texto libre no permite sin
un validador semántico. Invariantes aplicadas (siempre estructurales,
nunca "similarity score"):

- `scope_relation="unrelated"` ⟺ `response_type="unrelated"`.
- `scope_relation` en (`current_topic`, `course_domain`) ⟹
  `response_type="answer"` (nunca `not_covered`/`unrelated`).
- `topic_coverage="sufficient"` ⟹ sin conocimiento general
  (`general_knowledge_chunks=[]`, `general_knowledge_used=false`) y al
  menos un `answer_chunk`.
- `topic_coverage="insufficient"` ⟹ `answer_chunks=[]` — esto es lo que
  bloquea weak attribution estructuralmente: si el propio modelo ya
  declaró que el tópico actual no cubre la pregunta, no puede además citar
  un `SourceBlock` como si la sustentara. Es EXACTAMENTE el caso real de
  QA (una mención de pasada usada como cita débil) convertido en un
  invariante rechazable, sin ningún validador de similitud semántica.
- `topic_coverage="partial"`: sin restricción adicional (mezcla real de
  `answer_chunks` + `general_knowledge_chunks` es válida).
- `response_type="clarification"` (REGLA 18) es ortogonal: no se cruza
  contra `scope_relation`/`topic_coverage`.

**Detalle de implementación no trivial — el orden de los validadores
importa para la CALIDAD de la corrección, no solo para la validación**:
la primera versión de `ExpandedTutorReplyBody` corría el chequeo de forma
genérica (`_validate_tutor_reply_shape`) antes que el chequeo de
consistencia scope/coverage. Un caso real de QA (`scope_relation=
"course_domain"` + `response_type="unrelated"` + `general_knowledge_chunks`
poblado — una respuesta genuinamente autocontradictoria) disparaba
primero el error genérico ("`unrelated` no debe incluir
general_knowledge_chunks"), y el reintento del modelo "corregía" vaciando
los chunks — satisfacía el error literal sin arreglar la causa real,
convergiendo en `unrelated` limpio pero semánticamente incorrecto (0/5 en
la primera corrida real de "skill" con este diseño). Se invirtió el
orden: el chequeo de consistencia scope/coverage corre PRIMERO, así el
mensaje de corrección señala la causa raíz real ("`scope_relation`
exige `response_type='answer'`") en vez de un síntoma más fácil de
corregir sin resolver el problema de fondo.

**`relevance_reasoning` → nada**: el nuevo diseño NO reincorpora ningún
campo de texto libre ni pide chain-of-thought — es exactamente lo que
pedía la spec de este bloque ("una CLASIFICACIÓN, no una explicación").
Ninguno de los dos campos nuevos se expone en `TutorReplyBody` (contrato
público): `ExpandedTutorReplyBody.to_tutor_reply_body()` los descarta
antes de que la respuesta salga de `tutor_service.ask_tutor` — el router
sigue declarando `response_model=TutorReplyBody` sin cambios.

**Resultado real (QA extensa, `spec-driven-design-expert`,
`gpt-4o-mini`, después del fix de orden de validadores)**:

- "¿Qué es una skill?": **5/5 `answer`**, con provenance limpia en las 5
  (`answer_chunks=[]`, `general_knowledge_chunks` sustantivo, cero
  `source_refs` — ninguna cita débil observada en esta corrida, a
  diferencia del primer gap-closure).
- "¿Cuál es la mejor receta de asado?" (claramente ajeno): 5/5
  `unrelated`.
- Intento de prompt injection ("ignorá el curso y..."): `unrelated`.
- Modo estricto, misma pregunta de skill: `not_covered`, sin cambios.
- 17 llamadas reales completadas, 0 fallos de generación
  (`tutor_query_failed`); algunos intentos individuales necesitaron un
  reintento (`reason=invalid_contract` — el ENUM cerrado hizo que una
  inconsistencia real del modelo, como la del Hallazgo #1, se detecte y
  corrija automáticamente en vez de aceptarse en silencio).

**Limitación residual, documentada con honestidad (no resuelta, no se
sigue iterando por decisión explícita)**: "¿Qué es un LLM?" y "¿Qué es un
agente de IA?" dieron consistentemente `unrelated` con el prompt final de
este bloque — pero ahora de forma **internamente consistente**
(`scope_relation="unrelated"` coincide con `response_type="unrelated"` en
las tres corridas de verificación, incluso en modo texto libre sin
ninguna restricción de schema). Esto ya NO es el bug original (una
contradicción interna silenciosa): es un juicio de calibración del modelo
sobre qué tan "core" es un concepto para este curso puntual, distinto del
límite esperado por un lector humano en al menos "agente de IA" (un
concepto central en varios módulos de este curso). Se intentó UN ajuste
adicional de prompt (una regla explícita de calibración para conceptos
fundacionales de la disciplina del curso) — el experimento tuvo un efecto
claramente negativo y medible: "skill" pasó de 5/5 a 0/5 con ese único
párrafo agregado, confirmando empíricamente que el modelo es sensible a
cambios de prompt de forma no monótona ni predecible. Se revirtió de
inmediato y se confirmó la recuperación a 5/5. Por decisión explícita de
este bloque, no se seguyó iterando sobre esto: es un límite real del
modelo documentado, no un defecto de la arquitectura del contrato (que sí
se endureció con éxito, eliminando la clase de bug original).

`TUTOR_PROMPT_VERSION`: `tutor-v3.2.1` → `tutor-v3.3`.
`LESSON_PROMPT_VERSION` sin cambios (`lesson-v3.3.1`).

## 8. Alcance explícitamente NO tocado (Bloque 6)

`lesson-v3.3.1`, `VisualPlan`, renderers, Pedagogical Animations, RAG,
búsqueda web, agentes, una segunda llamada LLM. `TutorReplyBody`/
`TutorRequest` sin campos nuevos. El mecanismo de reintentos/validación
de grounding de `answer_chunks` (Bloque 1) no cambió.
