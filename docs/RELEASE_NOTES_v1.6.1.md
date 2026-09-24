# Release Notes — v1.6.1

Release candidate sobre v1.6.0. Dos correcciones funcionales —
**Certification Question Quality** y **Rich Markdown Rendering +
Course-local Assets** — más un hardening final. Sin cambios de
arquitectura, sin dependencias nuevas, sin RAG/embeddings, sin agentes,
sin Mermaid, sin librería de syntax highlighting. `Tutor`, `Lesson
Generation`, `Course Retrieval`, `Guided Read Aloud` y `Learning
Intelligence`/`Guided Review`/`Verification` (v1.6.0) no se tocaron en
ningún commit de este release — confirmado por diff exacto, no solo por
intención.

## Certification Question Quality

Certification generaba preguntas meta-pedagógicas ("¿Qué aprenderás en
este módulo?", "¿Cuál es el objetivo de este módulo?") en vez de
evaluar el contenido técnico real del tópico.

**Causa raíz**: el Grounding Packet de Certification siempre incluyó el
tópico completo sin filtrar (headings de objetivos incluidos), y el
prompt no tenía ninguna regla que excluyera ese tipo de contenido como
candidato de pregunta — de hecho, la regla de groundedness existente
invitaba implícitamente a usarlo, por ser texto trivialmente extraíble
y verificable contra la fuente.

**Fix, dos capas**:
- **REGLA 21** nueva en el system prompt
  (`CERTIFICATION_PROMPT_VERSION`: `certification-v1` → `certification-v2`,
  invalida la cache vieja por diseño): evaluar el conocimiento, nunca la
  descripción del recorrido de aprendizaje. Con ejemplos explícitos
  prohibidos/permitidos.
- **Validador conservador post-generación**: 14 patrones (7 en español +
  7 equivalentes en inglés, agregados en hardening tras encontrar que la
  cobertura en inglés era nula) que se evalúan contra el STEM GENERADO
  por el LLM — nunca contra el material fuente, para no arriesgar excluir
  contenido técnico legítimo. Dispara el mecanismo de reintento YA
  existente (hasta 2 correcciones), sin ningún loop nuevo.

**Nunca se filtra el material fuente por keywords** — la exclusión de
objetivos ocurre en el prompt (instrucción) y en la validación del
resultado (red de seguridad), nunca eliminando contenido del Grounding
Packet.

QA real (2 cursos reales, LLM real) confirmó **0 preguntas
meta-pedagógicas**, incluyendo el caso adversarial de un tópico
puramente introductorio (`actual_count: 0`, comportamiento correcto —
Certification nunca inventa preguntas para completar una cuota). Un
caso ambiguo deliberado ("¿Qué módulo de Python permite...?" y
variantes con Terraform/sistema/arquitectura) confirmó que "módulo"
como término técnico nunca se rechaza por sí solo.

**Límite conocido, documentado**: "objetivo" + "módulo" combinados en
la MISMA pregunta puede disparar un falso positivo incluso cuando
"módulo" es técnico (ej. un módulo de Python) — mitigado por el retry
existente, aceptado conscientemente en vez de construir una heurística
más compleja para un único caso de ambigüedad.

## Rich Markdown Rendering + Course-local Assets

### Bug real: imágenes locales rotas (rutas que suben un nivel)

Una imagen referenciada con `../carpeta/foo.png` (un patrón real: assets
compartidos entre módulos en un directorio de nivel de curso) no
cargaba. Causa raíz en dos capas:

1. **Frontend**: la codificación de la URL del asset no sobrevivía a la
   normalización de URL de un browser real (WHATWG URL Standard aplica
   remove_dot_segments incluso sobre puntos percent-encoded) — el
   segmento `assets` se perdía junto con el `..`. Fix: el path completo
   se codifica como un único segmento opaco (`encodeURIComponent` sobre
   el string entero, incluyendo los `/` internos).
2. **Backend**: la contención de seguridad se amplió de "módulo" a
   "curso" — `Path.resolve()` + `is_relative_to(course_root)` sobre la
   ruta canónica real en disco (nunca un blocklist de `..` en el
   string), el mismo criterio que ya usa el resto de la app para tratar
   "curso" como unidad de contención.

Verificado real: la imagen antes rota ahora carga
(`naturalWidth: 1904`); la imagen que ya funcionaba sigue funcionando
sin cambios (regresión confirmada).

### Bug real: módulos fantasma (`_recursos`, `_laboratorio`)

Directorios auxiliares de nivel de curso (assets compartidos, scripts
de laboratorio) se interpretaban como módulos reales — el catálogo
reportaba un `module_count` inflado, y uno de los dos aparecía como un
módulo navegable con un único tópico sin contenido pedagógico. Fix:
cualquier nombre con prefijo `_` se ignora igual que uno con prefijo
`.` (misma convención de autor, nunca un blocklist de nombres
específicos como `images`/`recursos`/`lab`). Confirmado real:
`module_count` pasó de 8 a 6 contra el curso real, sin tocar el
contenido del curso.

### Hardening: dos fallos de seguridad reales encontrados y corregidos

Auditando el endpoint de assets contra un path extremadamente largo y
un byte nulo embebido, ambos producían un `500 Internal Server Error`
sin control (en vez del `404` uniforme que ya cubre cualquier otro path
inválido) — `OSError`/`ValueError` reales del sistema operativo/Python
al tocar el filesystem, no capturadas. Corregido envolviendo la
resolución canónica en un `try/except` que trata cualquiera de las dos
excepciones igual que "no encontrado" — nunca revela por qué se
rechazó, mismo principio de "un único tipo de error" ya vigente desde
Fase 7. Ninguna de las dos permitía escapar del curso (la contención
seguía siendo correcta), pero un `500` sin control es peor postura de
seguridad que un `404` uniforme, y un error no capturado es en general
una superficie a evitar.

### Code blocks: CSS profesional, sin dependencia nueva

Se evaluó agregar una librería de syntax highlighting y se decidió no
hacerlo (bundle actual chico, sin infraestructura previa, requerimiento
explícito de evaluar CSS-only primero). Los fenced code blocks ahora
tienen fondo/borde distinguibles, fuente monoespaciada, scroll
horizontal propio (nunca de toda Classroom) y una etiqueta discreta con
el lenguaje declarado (extraída de la clase `language-xxx` que remark
ya agrega).

### Tablas, blockquotes, headings h4-h6

CSS real para elementos que antes no tenían ninguna regla propia
(tablas GFM, blockquotes, headings 4 a 6) — antes se veían como HTML
sin estilo del navegador, ahora con jerarquía visual consistente con el
resto del panel.

### Formatos soportados (sin cambios)

`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` — igual que desde Fase 7.
`.svg`/`.html`/`.js`/ejecutables siguen bloqueados. Imágenes externas
(`http(s)`) siguen sin cargarse automáticamente.

## Compatibilidad con Guided Read Aloud — confirmado, sin cambios de
comportamiento

El wrapper nuevo alrededor de los fenced code blocks es transparente
para el segmentador de lectura (que ya trataba `<pre>` como una unidad
propia desde v1.5.0) — confirmado con QA real: "Leer tema" sobre un
tópico con headings + párrafos + código + imagen + tabla arrancó
correctamente, con highlight activo.

## Demo Curso IA: nuevo corpus de QA visual real

3 módulos nuevos (formato de texto, ejemplos de código, arquitectura y
diagramas, comparación de modelos), 5 tópicos, 3 imágenes PNG reales
(generadas vía Playwright screenshot de un diagrama simple, sin
dependencia runtime nueva) — sirve como fixture real y versionado para
QA visual de este release y de futuros releases.

## Qué NO cambia (compatibilidad)

- Sin migración de base de datos, sin migración de cursos.
- Cursos sin imágenes o con Markdown simple: sin cambios de
  comportamiento.
- Cursos con imágenes relativas: ahora funcionan también cuando suben
  un nivel (antes solo funcionaban dentro del propio módulo).
- `learningState.ts`, Guided Review, Verification (v1.6.0): sin ningún
  cambio, confirmado por diff exacto (0 líneas tocadas).
- Certification scoped desde "Evaluar progreso" (Guided Review): sigue
  funcionando igual, ahora generando con `certification-v2` — confirmado
  con un smoke real de punta a punta (Guided Review → Evaluar progreso →
  Certification real → Verification Result → Mi aprendizaje), incluida
  una reconfirmación de que el fix de la carrera `selectedCourseId`
  (encontrado en v1.6.0) sigue vigente.
- Scoring/evaluación determinística de Certification: sin cambios.
- Answer key: sigue sin llegar al cliente antes de responder.

## Qué NO afirma este release (límites honestos)

- No hay syntax highlighting real (coloreado por token) — solo un code
  block con fondo/borde + etiqueta de lenguaje.
- No hay clasificador semántico de preguntas — el validador
  meta-pedagógico es un conjunto chico de patrones conservadores sobre
  el stem generado, no un modelo de comprensión.
- No garantiza path traversal imposible bajo cualquier proxy/CDN
  externo hipotético — la garantía real es sobre la resolución canónica
  del propio backend (`Path.resolve()` + `is_relative_to(course_root)`),
  el único punto de confianza en esta arquitectura.
- Sin diagramas tipo Mermaid — un fence \`\`\`mermaid sigue mostrándose
  como code block verbatim.
- Checkpoint sigue sin persistir evidencia; Tutor sigue sin consumir
  `LearningState`.

## Notas de actualización (v1.6.0 → v1.6.1)

- **Sin migración de base de datos** (el proyecto no usa una).
- **Sin migración de cursos**: cursos existentes, con o sin imágenes,
  siguen funcionando sin ninguna modificación.
- **Sin servicio de backend nuevo.**
- `APP_VERSION`: `1.6.0` → `1.6.1` (`backend/app/config.py`,
  `docker-compose.yml`, `.env.example`).
- `LESSON_PROMPT_VERSION`: sin cambios, sigue en `lesson-v3.3.1`.
- `TUTOR_PROMPT_VERSION`: sin cambios, sigue en `tutor-v4`.
- `CERTIFICATION_PROMPT_VERSION`: `certification-v1` → `certification-v2`
  (invalida la cache de `QuestionBank` por diseño; las caches viejas no
  se borran, simplemente dejan de reutilizarse).
- Ningún endpoint HTTP nuevo, ningún endpoint eliminado. El contrato
  público de `.../certification/*` y `.../assets/{asset_path}` no
  cambió (el segundo amplió su alcance de resolución interno, nunca su
  firma ni su forma de respuesta).

## Hardening del release candidate

Auditoría del diff acumulado completo (`v1.6.0..HEAD`). Bugs reales
encontrados y corregidos en esta pasada (además de los ya documentados
arriba, encontrados durante el desarrollo del feature):
- Cobertura en inglés del validador meta-pedagógico: inexistente
  (0/3 casos detectados) — corregida agregando 7 patrones equivalentes.
- Dos causas reales de `500` sin control en el endpoint de assets
  (path extremadamente largo, byte nulo embebido) — corregidas.

Resto de la auditoría (arquitectura de Certification, cache versioning,
groundedness, answer-key safety, semántica del renderer, seguridad de
encoded-slash/backslash/doble-encoding, aislamiento cross-module/
cross-course, extension allowlist, MIME, CanonicalContent/binary
isolation, Reader, audio ownership, responsive, Learning Intelligence
freeze, Tutor/Lesson freeze, privacidad, performance) sin hallazgos
nuevos — confirmada real con QA de navegador y contra el runtime Docker,
no solo por lectura de código. 629 tests de backend (+18 sobre el
feature, +44 sobre v1.6.0) / 643 de frontend (sin cambios sobre el
feature, +11 sobre v1.6.0) pasando; build de producción limpio; build
Docker `--no-cache` limpio; `doctor.ps1` → "Todo en orden".
