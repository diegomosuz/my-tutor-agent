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
  `TUTOR_PROMPT_VERSION` pasó de `tutor-v2` a `tutor-v3` (el tutor no se
  cachea, así que esto es solo trazabilidad/auditoría, no una cache key).

- **Validación** (`app/services/tutor_validation.py`): sin cambios de
  fondo — sigue validando que cada `source_ref` de `answer_chunks`
  exista en el `CanonicalTopicContent`. `general_knowledge_chunks` no
  necesita validación de grounding porque no tiene ningún campo que
  pudiera citar una fuente inexistente.

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

### Límite conocido (no bloqueante)

Con el proveedor real configurado (`gpt-4o-mini`), el relevance gate
("¿está relacionado con el tema?") funciona de forma confiable — se
verificó con preguntas claramente ajenas ("¿cómo se cocina una pizza
margarita?") devolviendo `unrelated` consistentemente. Sin embargo, el
modelo se mostró consistentemente conservador para activar
`general_knowledge_used=true` en preguntas relacionadas pero no cubiertas
por la fuente (incluidos los ejemplos textuales de la especificación,
p.ej. "¿Cómo implementaría SDD en un monorepo?"): en la práctica siguió
prefiriendo `not_covered` en la mayoría de los intentos, incluso tras
reforzar `REGLA 20` para declarar explícitamente que en este modo
`not_covered` queda reservado para cuando ni el conocimiento general
alcanza. Esto es una preferencia del modelo/proveedor, no un defecto
estructural: la ruta completa (`general_knowledge_chunks`, el badge, la
validación, el prompt) está probada exhaustivamente y de punta a punta
con `FakeLLMProvider` determinístico (backend) y con mocks (frontend).
Quedó documentado acá para una futura iteración de prompt-tuning (mismo
patrón que la deuda de `comprehension_check` cerrada entre Fase 5 y
Fase 6, ver `CLAUDE.md` sección 14) — no bloquea este bloque porque el
comportamiento observado nunca es incorrecto ni inseguro (en el peor
caso, es más conservador de lo pedido, jamás inventa contenido).

### Tests

Backend: `backend/tests/test_tutor_service.py` — 11 tests nuevos
(PARTE 36 A-K): request sin el campo nuevo default a estricto; estricto
cubierto/no cubierto sin cambios de comportamiento; ampliado
relacionado-no-cubierto produce respuesta con `general_knowledge_chunks`;
ampliado con cobertura parcial mezcla `answer_chunks` grounded +
`general_knowledge_chunks`; `unrelated` rechazado en modo estricto y
reintentado; `source_refs` siguen validados incluso en modo ampliado;
logs nunca contienen la pregunta ni la respuesta completa. Frontend:
`frontend/src/classroom/__tests__/TutorPanel.test.tsx` — 8 tests nuevos
(PARTE 37 A-H): switch default OFF, request lleva el flag correcto según
el switch, persiste entre escenas del mismo tópico, badge de
transparencia condicional, mensaje fijo de "unrelated", texto de ayuda
nunca sugiere web/internet/búsqueda.

### QA real

Verificado con Playwright + llamadas directas al endpoint contra
`spec-driven-design-expert` con el proveedor `openai` real configurado:
pregunta claramente no relacionada en modo ampliado → `unrelated` con el
mensaje fijo; misma pregunta en modo estricto → `not_covered`; el switch
nunca aparece marcado por default; cero errores de consola en toda la
sesión de QA.

## 5. Alcance explícitamente NO tocado

Generación visual de `LessonPlan`, `lesson-v3.2.1`, Visual Selection,
`VisualPlan` (schema sin cambios), el builder determinístico de
Pedagogical Animations (`buildAnimationSequence`,
`usePedagogicalAnimation`) y sus algoritmos por `visual_type`, RAG,
búsqueda web. El problema de "exceso de texto / falta de diagramas" en
las clases generadas queda explícitamente para el próximo bloque.
