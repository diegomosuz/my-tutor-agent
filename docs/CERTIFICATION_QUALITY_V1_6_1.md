# Certification Question Quality (v1.6.1)

Parte A de v1.6.1 (PwC AI Tutor). Corrige un defecto real: Certification
generaba preguntas meta-pedagógicas ("¿Qué aprenderás en este módulo?",
"¿Cuál es el objetivo de este módulo?") en vez de evaluar el contenido
técnico real del tópico.

## Causa raíz (auditada antes de implementar)

Trazado completo: `certification_service.py` → `canonical.py`
(`parse_source_blocks`/`build_grounding_packet`) → `certification.py`
(prompt) → LLM → `certification_validation.py` (validación
post-generación) → cache.

- El Grounding Packet de Certification siempre incluyó el topico
  **completo y sin filtrar**: TODOS los `SourceBlock` (headings,
  párrafos, listas — sin excepción), incluidos headings como
  "# Objetivos"/"## Qué aprenderás" y su prosa. No existe, ni existía,
  ningún mecanismo en el pipeline que distinga contenido "instructivo/
  sustantivo" de contenido "meta-pedagógico" (descripción del
  recorrido de aprendizaje) — la clasificación de `SourceBlock` es
  puramente sintáctica (heading/párrafo/lista/tabla/...), nunca
  semántica.
- El system prompt (`CERTIFICATION_SYSTEM_PROMPT`, 20 reglas) no tenía
  ninguna regla que excluyera ese tipo de contenido como candidato de
  pregunta. REGLA 8 ("cada pregunta debe poder responderse de forma
  inequívoca usando exclusivamente AUTHORIZED SOURCE") de hecho
  **invitaba** implícitamente a usarlo: una frase como "al finalizar
  este módulo podrás configurar un pipeline" es trivialmente extraíble
  y perfectamente "grounded", así que el modelo la trataba igual que
  cualquier otro hecho del material.
- La validación post-generación (`validate_question_bank`) solo
  verificaba trazabilidad estructural (`source_refs`/`derivation_refs`
  existen), contenido ejecutable prohibido, y duplicados — nada
  relacionado con el TIPO de conocimiento que la pregunta evalúa.

## Fix: tres capas (prompt + validación; sin cambios de source selection)

Se evaluaron las tres capas propuestas en la especificación
(source selection, prompt, validación) y se implementaron dos: prompt
(capa principal) + validación (red de seguridad conservadora). La capa
de source selection (filtrar bloques fuente ANTES de construir el
Grounding Packet) se evaluó y se descartó para este bloque: no existía
ninguna infraestructura de clasificación de bloques, construirla
arriesgaba excluir contenido técnico legítimo que mencione "objetivo"/
"aprender" en un sentido normal (ej. "el objetivo de la función de
pérdida"), y las otras dos capas ya demostraron ser suficientes en QA
real (ver más abajo) — más simple, más robusto, sin el riesgo de una
heurística de filtrado de contenido nueva.

### Capa 1 (principal): REGLA 21 en el prompt

`backend/app/prompts/certification.py`, `CERTIFICATION_SYSTEM_PROMPT`:
nueva REGLA 21 — "evaluar el conocimiento, nunca la descripción del
recorrido de aprendizaje". Incluye ejemplos explícitos prohibidos
("¿Qué aprenderás en este módulo?", "¿Cuál es el objetivo del curso?",
etc.) y permitidos (preguntas de aplicación/comparación/mecanismo sobre
contenido técnico real), y aclara explícitamente que el texto de
objetivos sigue siendo material de curso legítimo para LEER — solo deja
de ser fuente principal para CONSTRUIR una pregunta. Reafirma REGLA 15
(cantidad es un objetivo, nunca una obligación): si un tópico es
puramente meta-pedagógico, la respuesta correcta es devolver menos
preguntas (incluso 0), nunca inventar una pregunta forzada.

`CERTIFICATION_PROMPT_VERSION`: `certification-v1` → `certification-v2`
(forma parte de la cache key de `QuestionBank` — el cambio invalida
limpiamente la cache vieja, ningún `QuestionBank` generado con el
prompt anterior se reutiliza silenciosamente).

**Bug real encontrado al bumpear la versión**: `docker-compose.yml`,
`.env.example` y `.env` (local) tenían `CERTIFICATION_PROMPT_VERSION`
hardcodeado a `certification-v1` como fallback/default de la variable
de entorno — exactamente el mismo bug ya documentado dos veces en este
proyecto para `LESSON_PROMPT_VERSION` (v1.1.0, Bloque 3 de v1.3.0): la
variable de entorno pisa el default de Python, y el runtime real habría
seguido sirviendo `certification-v1` pese al cambio de código. Corregido
en los tres archivos, y extendido el test de regresión permanente
`backend/tests/test_config_version_consistency.py` (antes solo cubría
`LESSON_PROMPT_VERSION`) para cubrir ambas variables de forma
parametrizada — así este bug no puede volver a pasar en silencio para
ninguna de las dos.

### Capa 2 (red de seguridad conservadora): validación post-generación

`backend/app/services/certification_validation.py`,
`_is_meta_pedagogical_stem`: un conjunto chico (7 patrones, nunca una
lista de 100 keywords) de expresiones regulares que se evalúan contra
el **STEM GENERADO** por el LLM (la pregunta real), nunca contra el
material fuente — filtrar bloques fuente por keyword arriesgaría
excluir contenido técnico legítimo; un stem que literalmente pregunta
"¿qué aprenderás en este módulo?" es una señal inequívoca sin importar
el tema del curso. Si un stem coincide, se agrega a `problems` y
dispara `ValidationFailure` — reutiliza el mecanismo de reintento YA
existente (`llm_retry.py`, hasta 2 correcciones) sin ningún loop nuevo.

Cobertura de falsos positivos verificada explícitamente (PARTE 9 de la
especificación: "no heurística agresiva"): "¿Cuál es el objetivo de la
función de pérdida (loss) en este algoritmo?" y "El algoritmo puede
aprender de los datos de entrenamiento. ¿Qué técnica usa para eso?" NO
se marcan como meta-pedagógicos (test dedicado,
`test_substantive_stems_are_never_flagged`).

**Limitación conocida y aceptada**: la palabra "módulo" es ambigua
(módulo de curso vs. módulo de software/Python) — un stem real como
"¿Cuál es el objetivo del módulo `os` en Python?" podría dispararse
como falso positivo. Dado que esto activa el mecanismo de retry
existente (el LLM recibe el problema y normalmente puede reformular
evitando el patrón mientras preserva el contenido técnico), el riesgo
práctico es bajo y se acepta conscientemente en vez de construir una
heurística más compleja — documentado acá en vez de intentar resolverlo
con NLP.

## QA real (no solo unit tests)

Contra dos cursos reales distintos, con LLM real (OpenAI configurado):

1. **`spec-driven-design-expert`**, tópico con heading real
   "## Competencias de aprendizaje" (bullets tipo "Distinguir SDD de
   documentación tradicional..."): 6/6 preguntas generadas, todas
   sustantivas (comparaciones, definiciones, relaciones) — **0
   meta-pedagógicas**, y el bullet de competencias se convirtió
   correctamente en una pregunta comparativa real ("¿Qué diferencia a
   Spec-Driven Design de la documentación tradicional?"), nunca en "¿qué
   vas a aprender?".
2. **`claude-foundations-certification`**, tópico
   `modulo-1-introduccion` — el caso más adversarial posible: el
   `.md` completo es "## Al finalizar este módulo, serás capaz de:" +
   "## Lo que cubre este módulo", **sin ningún contenido técnico
   autocontenido** (describe lo que módulos FUTUROS van a explicar,
   nunca lo explica acá mismo). Resultado real:
   `actual_count: 0` — "No fue posible generar suficientes preguntas
   con el material seleccionado." Este es el comportamiento CORRECTO
   (REGLA 15 + REGLA 21 funcionando juntas exactamente como se
   especificó, PARTE 21 de la especificación: "TEST: ONLY META
   CONTENT") — confirmado que no es una falla sistémica probando el
   MISMO curso con un tópico distinto y genuinamente técnico
   (`modulo-1-modelos`, diferenciación Haiku/Sonnet/Opus): 5/5
   preguntas generadas, todas sustantivas.

## Qué NO cambió

- Evaluación/scoring determinístico (`certification_evaluator.py`): sin
  tocar.
- Answer key: sigue sin llegar al cliente antes de responder (regla
  histórica, sin cambios, `ExamQuestionView` nunca incluye
  `correct_option_ids`).
- `question_results`: sin cambios de privacidad.
- Scoped Certification (por módulo/tópico) y su integración con Guided
  Review Verification (v1.6.0): sin cambios de contrato — confirmado
  sin regresión.
- `learningState.ts`/Guided Review/Verification: no tocados en este
  bloque.
