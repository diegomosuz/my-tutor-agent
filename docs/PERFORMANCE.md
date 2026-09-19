# Performance y concurrencia controlada (v1.1.0)

Este documento describe el segundo bloque funcional de v1.1.0: reducir la
latencia de generación con IA (sobre todo en `certification/prepare`) y
evitar trabajo/costo duplicado, **sin** cambiar la arquitectura de fondo
(`browser -> React -> HTTP REST -> FastAPI -> filesystem de cursos +
proveedores LLM`, ver `CLAUDE.md`). No se agregó ninguna infraestructura
nueva: todo lo de acá es Python estándar (`concurrent.futures`,
`threading`) y un componente React chico.

## 1. Cache-first GLOBAL en certificación

Antes de este bloque, `prepare_exam` ya era "cache-first" pero **por
candidato**: recorría los candidatos en orden curricular y, apenas
encontraba un cache MISS, generaba inmediatamente — sin mirar si un
candidato más adelante en el orden ya estaba cacheado.

Ahora `prepare_exam` separa la preparación en dos fases:

1. **Barrido cache-only** (`_scan_cached_banks`): recorre TODOS los
   candidatos del scope, en el mismo orden curricular de siempre
   (round-robin por módulo para curso/módulos, orden pedido para
   tópicos específicos), leyendo **solo** su cache — nunca llama al LLM
   en esta fase. Se detiene apenas el cache acumulado ya alcanza para
   satisfacer el pedido (`target_topic_coverage` tópicos distintos y
   `question_count` preguntas disponibles), pero **sí** sigue mirando
   más allá de un miss puntual buscando un hit más adelante en el orden.
   Si el cache ya alcanza: **cero llamadas al proveedor LLM**.
2. **Generación en waves** (`_run_generation_waves`), solo si la fase
   anterior no alcanzó: genera los candidatos que resultaron cache MISS,
   en el orden curricular en que se encontraron, usando concurrencia
   acotada (sección 2).

Esto nunca sacrifica cobertura curricular: el orden de candidatos sigue
siendo el mismo round-robin por módulo de siempre, y el ensamblaje final
(`_round_robin_select`) sigue interleaving preguntas entre TODOS los
tópicos cubiertos, nunca solo del primero.

## 2. Concurrencia acotada (waves)

Cuando hace falta generar varios `QuestionBank`, nunca se hace 100%
secuencial (lento) ni se lanzan todos los tópicos pendientes a la vez
(ráfaga contra el proveedor). Se generan en **waves** de hasta
`CERTIFICATION_MAX_CONCURRENCY` candidatos en paralelo:

```
pendientes: [T1, T2, T3, T4, T5]   (concurrency = 2)

Wave 1: T1 + T2 en paralelo -> esperar ambos -> ¿alcanza? no
Wave 2: T3 + T4 en paralelo -> esperar ambos -> ¿alcanza? sí
Wave 3: nunca arranca -> T5 nunca se genera
```

Implementado con `concurrent.futures.ThreadPoolExecutor` (nunca
`asyncio.gather` sin límite): todo el backend es síncrono (FastAPI
despacha los endpoints `def` a su threadpool, los providers LLM/TTS usan
httpx/el SDK de OpenAI de forma bloqueante), así que la concurrencia
acotada se hace con threads, no con una reescritura a async.

### Configuración

`CERTIFICATION_MAX_CONCURRENCY` (default `2`, acotado en el backend a
1-4 sin importar el valor configurado). `1` reproduce exactamente el
comportamiento estrictamente secuencial de versiones anteriores — útil
para depurar o para proveedores especialmente sensibles a paralelismo.

## 3. Determinismo

La concurrencia **nunca** hace que el examen ensamblado dependa del orden
en que el proveedor responde. Dentro de cada wave, los resultados se
recogen iterando la lista de futures **en el orden de sumisión**
(curricular), nunca en el orden en que efectivamente terminan los
threads — si el tópico 2 de una wave responde antes que el tópico 1, el
tópico 1 igual se agrega primero a la lista de bancos usada para el
round-robin final. Mismos `QuestionBank` cacheados/generados + mismo
`seed` -> mismo examen ensamblado, siempre.

## 4. Early stop entre waves

Después de cada wave se reevalúa exactamente la misma condición que ya
usaba la fase cache-only: `topics_covered >= target_topic_coverage AND
questions_available >= requested_count`. Si se cumple, la siguiente wave
**nunca arranca**. Se acepta que una wave ya iniciada pueda terminar
generando hasta `concurrency - 1` bancos "de más" (sus requests HTTP ya
estaban en curso) — no se implementó cancelación de requests en curso
para evitar ese pequeño exceso, que es preferible a la complejidad de
cancelar HTTP calls a mitad de camino.

## 5. Tolerancia a fallos con concurrencia

Se mantiene la semántica de versiones anteriores: un candidato que falla
por un motivo específico de ESE tópico (`LLMUpstreamError` tras agotar
reintentos, o contrato/grounding inválido) se registra y no bloquea al
resto de su wave ni a las siguientes. Un error SISTÉMICO
(`LLMConfigurationError`/`LLMAuthError`) deja terminar la wave ya
iniciada (sus requests ya están en curso), pero ninguna wave nueva
arranca después. Un HTTP 200 inválido nunca se reclasifica como error de
upstream (regla dura desde v1.0.1, sin cambios).

## 6. Single-flight (deduplicación de requests en curso)

Problema real observado: dos requests casi simultáneos para la MISMA
narración (`/api/speech`) veían ambos un cache MISS y llamaban a OpenAI
TTS por separado, duplicando costo y trabajo. El mismo patrón
check-then-act (leer cache → MISS → generar → escribir) existía sin
ningún lock en `SpeechService`, `LessonGenerator` y `CertificationService`.

`app/services/singleflight.py` — una clase chica, sin dependencia
externa (`threading.Lock`/`threading.Event`) — deduplica llamadas
concurrentes que comparten la misma cache key **dentro de este proceso
backend**: el primer thread ("líder") ejecuta la generación real; el
resto ("seguidores") espera y reutiliza su resultado (o su excepción, si
el líder falló). Aplicado en los tres puntos que comparten el patrón:

- `speech_service.synthesize_speech`
- `lesson_generator.generate_lesson`
- `certification_service._get_or_generate_question_bank_with_source`

Invariantes garantizados (y cubiertos por tests, ver
`backend/tests/test_singleflight.py`,
`test_speech_service.py::test_concurrent_requests_same_key_call_provider_once`,
`test_lesson_generator.py::test_concurrent_requests_same_topic_call_provider_once`,
`test_certification_concurrency.py::test_singleflight_dedupes_same_bank_across_concurrent_prepare_calls`):

- misma cache key + llamadas concurrentes -> una sola generación real;
- keys distintas -> nunca se deduplican entre sí;
- se re-verifica la cache DESPUÉS de adquirir el lock (por si otra
  generación concurrente ya terminó y escribió cache en el ínterin);
- la entrada in-flight se limpia siempre (éxito o excepción) — sin esa
  limpieza, un segundo intento tras un fallo se quedaría esperando para
  siempre (deadlock); los tests verifican explícitamente que no ocurre;
- la deduplicación es **por proceso**: el producto corre un backend local
  de una sola instancia, así que esto es suficiente — no deduplica entre
  procesos ni instancias distintas (no hay Redis ni almacenamiento
  compartido, y no hace falta: ver `CLAUDE.md` sección 4).

## 7. UX de operaciones lentas

`frontend/src/components/AiOperationStatus.tsx` reemplaza al `LoadingSteps`
anterior (que rotaba nombres de fase fijos — "Analizando contenido",
"Organizando explicación" — sin que el frontend pudiera saber realmente en
qué fase estaba el backend). El nuevo componente **nunca inventa un
porcentaje ni una fase específica**: muestra un mensaje inicial fijo y,
solo si la operación sigue en curso pasado un tiempo (`delayMs`, default
6s), cambia a un segundo mensaje que avisa que puede tardar — nunca
presentado como telemetría real.

Reusado en:

- `ClassroomPage` ("Preparando clase…" → "Estamos generando la clase a
  partir del material de este tópico.")
- `CertificationSetupPage` ("Preparando práctica…"/"Preparando
  simulacro…" → "Esta es la primera preparación de parte del material. La
  generación con IA puede tardar unos segundos.")

## 8. Evitar doble submit en el frontend

`ClassroomPage.handleGenerateLesson`, y `useCertificationExam.prepare` /
`.submitExam` / `.evaluateCurrentQuestion` ahora tienen un guard explícito
al principio de la función (`if (loading) return`), además de que el
botón correspondiente ya quedaba oculto/disabled mientras la operación
está pendiente. El guard en la función es la defensa robusta: nunca
depende únicamente de que React ya haya vuelto a renderizar el botón
antes de que llegue un segundo click. Cubierto por tests reales de doble
click (`ClassroomPage.test.tsx`,
`useCertificationExam.test.ts::"un segundo prepare()/submitExam()..."`) —
incluyendo que un segundo `submitExam()` mientras el primero sigue
pendiente **nunca** duplica ni pierde el registro del intento en "Mi
aprendizaje" (`recordCertificationAttempt`).

## 9. Qué NO cambió (a propósito)

- El backend sigue exigiendo un provider LLM configurado incluso para un
  cache HIT (el provider/model participan de la cache key) — no se
  relajó esa condición, sería un cambio de comportamiento más amplio y
  no lo pidió esta especificación.
- Ningún `QuestionBank`/`LessonPlan` se pre-genera en background ni se
  "precalienta" el cache sin que el alumno lo pida explícitamente.
- Los retries siguen siendo los mismos, chicos y explícitos
  (`MAX_GENERATION_ATTEMPTS = 3`); la concurrencia no los reemplaza ni
  los amplifica — cada tópico conserva su propia semántica de retry.
- El answer key y el Grounding Packet siguen siendo exactamente las
  mismas fuentes de verdad de siempre (ver `CLAUDE.md` secciones 2 y 11)
  — este bloque es puramente de performance/concurrencia/UX, nunca toca
  esos contratos.

## 10. Regresión: `bank_id::question_id`

El bloque anterior de v1.1.0 (`feat/v1.1.0-learning-progress`) encontró y
corrigió un bug real: `question_id` (p.ej. `Q-002`) solo es único DENTRO
de un `QuestionBank` — cada tópico numera su propio banco desde `Q-001`,
así que un examen ensamblado con preguntas de varios tópicos puede
legítimamente repetir el mismo `question_id`. La identidad correcta en el
frontend es la clave compuesta `bank_id::question_id`
(`examAnswerKey` en `frontend/src/certification/certificationStorage.ts`).

Este bloque de performance reutiliza el mismo ensamblado determinístico
(`_round_robin_select`) y no introduce ningún cambio de contrato en
`ExamQuestionView`/`AnswerSubmission`, así que no puede reintroducir el
bug — confirmado con un test de regresión explícito con dos bancos
distintos que comparten `Q-001`
(`backend/tests/test_certification_exam_assembly.py`, ya existente desde
el bloque anterior, sigue verde con la generación concurrente).
