# Rich Markdown Rendering (v1.6.1)

Parte B de v1.6.1 (PwC AI Tutor). Mejora la calidad de renderizado del
Markdown fuente de un tópico en el aula virtual (panel "Contenido del
tema" / pestaña "Explicación") — **nunca** la lección generada por IA
(esas slides son un componente declarativo separado, `SceneRenderer`,
sin relación con `SafeMarkdown`).

## Arquitectura (auditada antes de implementar)

```
content_markdown (string, tal cual el .md, del backend)
    ↓
SafeMarkdown.tsx (react-markdown 9 + remark-gfm)
    ↓
DOM real en el panel .content-panel__body
```

- **Parsing/render**: `react-markdown` + `remark-gfm` (GFM: tablas,
  listas de tareas, autolinks, strikethrough). Sin `rehype-raw` —
  HTML crudo embebido en el Markdown nunca se interpreta, se muestra
  como texto plano.
- El parseo canónico en `backend/app/services/canonical.py`
  (`markdown-it-py`) es un consumidor DISTINTO (segmentación en
  `SourceBlock` para grounding de LLM) — nunca toca el path de display.
- Cero `dangerouslySetInnerHTML`/`eval`/`new Function` en todo el path
  (confirmado antes y después de este bloque).

## Bug real #1: imágenes locales relativas rotas

**Síntoma reportado**: `![Arquitectura](images/foo.png)` no se
mostraba. La auditoría inicial (estática, leyendo el código) sugería
que esto YA funcionaba — el endpoint de assets
(`.../assets/{asset_path:path}`) y la reescritura de `src` en
`SafeMarkdown` existían desde Fase 7 y tenían tests. QA real con
Playwright contra un curso real (`spec-driven-design-expert`, topic con
`![Ciclo de SDD](images/sdd-lifecycle.png)`) confirmó que ESE caso
específico sí cargaba (`naturalWidth: 2022`, 0 errores) — pero un
segundo curso real (`LangGraph_Sistemas_Agenticos_Reales`, que
referencia imágenes compartidas con `../_recursos/foo.png`, una ruta
que SUBE un nivel desde el módulo) mostraba `naturalWidth: 0`. El
"bug" real no era "las imágenes no funcionan", era "las imágenes que
suben un nivel desde el módulo no funcionan".

### Causa raíz (dos capas)

1. **Frontend**: `getTopicAssetUrl` codificaba el path segmento a
   segmento (`assetPath.split("/").map(encodeURIComponent).join("/")`).
   `encodeURIComponent(".")`/`encodeURIComponent("..")` NO escapan los
   puntos (son caracteres "unreserved" en RFC 3986) — un browser real
   aplica remove_dot_segments (WHATWG URL Standard) sobre el PATH de la
   URL **antes** de enviar el request, y ese algoritmo reconoce un
   segmento "."/".." **incluso con los puntos percent-encoded**
   (confirmado en runtime real: `new URL(".../assets/%2E%2E/foo.png")`
   sigue colapsando igual que con `..` literal, perdiendo el segmento
   `assets` que precede al `..`). Ni curl ni Chromium son una excepción
   a esto — es comportamiento estándar de parsing de URL, no un bug de
   un cliente en particular.
2. **Backend**: `resolve_topic_asset` rechazaba explícitamente CUALQUIER
   `..` en el path (`".." in requested.parts`), y la contención
   verificaba `is_relative_to(module_dir)` — el diseño original era
   deliberadamente "nunca salir del módulo", más estricto que lo que
   varios cursos reales necesitan.

### Fix (dos capas, cada una necesaria por separado)

1. **Frontend** (`frontend/src/api/client.ts`): `getTopicAssetUrl` ahora
   codifica el `assetPath` COMPLETO (incluidos los "/" internos) como
   UN ÚNICO segmento de URL vía `encodeURIComponent` sobre el string
   entero. Como el resultado nunca contiene un "/" literal, el algoritmo
   de remove_dot_segments nunca lo reconoce como un segmento "."/".."
   (el chequeo es sobre el segmento COMPLETO, no un prefijo) sin
   importar cuántos `../` tenga `assetPath` al principio. El backend ya
   sabe decodificar esto: Starlette hace `unquote()` del parámetro
   `{asset_path:path}` — mismo mecanismo que ya cubría
   `test_encoded_traversal_returns_404` antes de este bloque.
2. **Backend** (`backend/app/services/courses.py::resolve_topic_asset`):
   la contención se amplió de `module_root` a `course_root` — un asset
   puede resolver a cualquier lugar DENTRO del curso (otro módulo, o un
   directorio de nivel de curso como `_recursos/`), nunca fuera de él.
   Se eliminó el rechazo temprano `".." in requested.parts` (ya
   redundante y más débil que la verificación real:
   `Path.resolve()` + `is_relative_to(course_root)` sobre la ruta
   canónica en disco). Este es el mismo límite de seguridad que ya usa
   el resto de la aplicación para tratar "curso" como la unidad de
   contención (grounding packets, course-wide retrieval del tutor,
   Certification — todos scoped por curso, nunca por módulo), así que
   este cambio los pone a todos bajo el mismo criterio en vez de que
   assets fuera la única excepción más estricta.

Verificado con QA real (no solo tests): el caso roto de
`LangGraph_Sistemas_Agenticos_Reales` carga correctamente después del
fix (`naturalWidth: 1904`), y el caso que ya funcionaba
(`spec-driven-design-expert`) sigue funcionando sin cambios
(regresión, confirmada real).

## Bug real #2: `_recursos`/`_laboratorio` como módulos fantasma

Encontrado auditando el mismo curso real (`LangGraph_Sistemas_Agenticos_Reales`):
tiene `_recursos/` (assets compartidos entre módulos) y `_laboratorio/`
(scripts de apoyo en Python, con su propio `README.md`) como
directorios de NIVEL DE CURSO, sibling de los 6 módulos numerados
reales. Ninguno de los dos empieza con "." (la única convención de
"ignorar" que existía hasta v1.6.0), así que `_list_subdirs` los
trataba como módulos reales — el catálogo reportaba `module_count: 8`
en vez de 6, y ambos aparecían como módulos navegables (uno vacío, el
otro con un único tópico "Readme" sin contenido pedagógico real).

**Fix** (`backend/app/services/courses.py::_is_ignored`): extendida
para tratar cualquier nombre que empiece con `_` igual que uno que
empieza con `.` — misma convención de autor ("esto no es contenido de
curso"), nunca un blocklist de nombres específicos como `images`/
`recursos`/`lab` (PARTE 9 de la especificación: exclusión basada en
convención, nunca en keywords). Confirmado real: `module_count` pasó de
8 a 6 contra el curso real sin tocar absolutamente nada del contenido
del curso.

## Code blocks: CSS profesional, sin dependencia nueva

Se evaluó agregar una librería de syntax highlighting
(`rehype-highlight`, `react-syntax-highlighter`, etc.) y se decidió
**no** hacerlo en este bloque: no existía ninguna infraestructura de
highlighting previa, el bundle actual es chico (~470KB), y el
requerimiento (PASO 30 de la especificación) pedía explícitamente
evaluar primero un code block "profesional" solo con CSS + metadata de
lenguaje antes de sumar una dependencia. Resultado:

- `SafeMarkdown.tsx` agrega un override de `pre` (nunca de `code`
  directamente, para no romper la distinción `pre>code` vs. inline
  `code` que ya maneja react-markdown/remark correctamente): extrae el
  lenguaje del `className="language-xxx"` que remark ya agrega al
  `<code>` hijo, y envuelve el bloque en un `<div class="safe-markdown__code-block">`
  con una etiqueta de lenguaje discreta (`<span class="safe-markdown__code-lang">`)
  en la esquina superior derecha — solo si el fence declaró lenguaje;
  un fence sin lenguaje (\`\`\` sin nada) sigue mostrándose como código
  verbatim, sin etiqueta.
- `global.css`: `.content-panel__body pre` gana su propio fondo/borde/
  padding/`overflow-x: auto` (antes heredaba visualmente el estilo de
  "inline code" del selector `code` compartido, viéndose como un chip
  de una sola línea estirado); `.content-panel__body pre code` resetea
  ese estilo de inline-code para no duplicarlo dentro del bloque.
- Una línea de código muy larga hace scroll horizontal SOLO del propio
  `<pre>` (`overflow-x: auto`), nunca de toda Classroom — confirmado
  real en desktop/tablet/mobile (0px de overflow del documento en los
  tres).

## Tablas, blockquotes, headings h4-h6

- `.content-panel__body table`: `display: block; overflow-x: auto;`
  directamente sobre el elemento `<table>` — alcanza para que una tabla
  ancha nunca desborde el panel, sin necesitar envolverla en un `<div>`
  nuevo desde `SafeMarkdown.tsx`. `th`/`td` con borde/padding reales,
  `thead th` con fondo distinguible.
- `.content-panel__body blockquote`: borde izquierdo + fondo sutil +
  color de texto atenuado — visualmente diferenciado sin exagerar.
- `.content-panel__body h4/h5/h6`: antes no tenían NINGUNA regla propia
  (heredaban el tamaño de fuente base del párrafo, indistinguibles de
  texto en negrita) — ahora tienen una escala descendente simple, nunca
  más grande que h3.
- Listas anidadas: `.content-panel__body li > ul/ol` reduce el margen
  superior (la lista externa ya separa bloques hermanos; repetir ese
  espaciado grande dentro de un `<li>` se veía desproporcionado).

## Imágenes: presentación (sin cambios de este bloque, ya correcto desde v1.3.0)

`max-width: 100%` + `max-height: min(50vh, 420px)` + `object-fit: contain`
ya evitaban que una imagen grande desbordara el panel o se deformara —
confirmado que sigue funcionando igual con las imágenes reales nuevas
del Demo Curso IA.

## Compatibilidad con Guided Read Aloud (v1.5.0) — release blocker, verificado

`readAloudSegments.ts` ya trataba `PRE` como una unidad de lectura
propia (nunca desciende adentro, lee el código verbatim) ANTES de este
bloque. El nuevo wrapper `<div class="safe-markdown__code-block">`
alrededor de `<pre>` es transparente para el walker: `DIV` no está en
`LEAF_CANDIDATE_TAGS`, así que el walker simplemente recorre sus hijos
como cualquier contenedor y encuentra el `<pre>` exactamente igual que
antes. Confirmado con QA real (no solo por lectura de código): "Leer
tema" sobre el tópico fixture completo (headings + párrafos + code
block + imagen + tabla) arrancó correctamente, con highlight activo.

## Course-local assets: seguridad (resumen)

- Allow-list de extensiones sin cambios: `.png/.jpg/.jpeg/.webp/.gif`
  únicamente. `.svg`/`.html`/`.js`/binarios ejecutables siguen
  bloqueados (rechazo con 404 uniforme, nunca revela la razón exacta).
- El límite de contención pasó de "módulo" a "curso" (ver Bug real #1)
  — nunca "todo el filesystem de cursos" ni "content root completo".
  Un asset de un curso NUNCA puede resolver a un archivo de otro curso,
  aunque el archivo exista de verdad (test dedicado,
  `test_asset_never_crosses_into_another_course`).
- La verificación real sigue siendo `Path.resolve()` +
  `is_relative_to(course_root)` sobre la ruta canónica en disco —
  nunca una comparación de string sobre si el `asset_path` pedido
  "contiene" o no `..`. Esto es lo que garantiza que ningún truco de
  codificación (percent-encoding, mayúsculas, etc.) pueda evadir el
  chequeo: no importa CÓMO llegue el string, lo que importa es DÓNDE
  resuelve en el filesystem real.

## Imágenes externas (sin cambios)

`http://`/`https://`/`data:` siguen sin cargarse automáticamente (se
muestra un placeholder con link, salvo `data:` que nunca lo ofrece) —
política de v1.3.0/Fase 8, no tocada en este bloque.

## Diagramas: siguen siendo imágenes raster (deliberado)

v1.6.1 NO introduce Mermaid ni ningún renderer de diagramas nuevo — un
fenced block \`\`\`mermaid sin soporte sigue mostrándose como code
block verbatim (comportamiento correcto y ya cubierto por el tratamiento
general de code blocks de este mismo bloque). "Diagrama" en este
release significa exclusivamente una imagen raster del curso
referenciada desde Markdown — exactamente lo mismo que cualquier otra
imagen, sin tratamiento especial.

## CanonicalTopicContent / Grounding Packet: sin binarios

Confirmado (sin cambios, ya era así desde Fase 2): un `SourceBlock` de
tipo `image` contiene el Markdown literal de la referencia (alt text +
path), nunca los bytes del archivo — las imágenes nunca entran al
Grounding Packet ni a ningún prompt de LLM (Lesson/Tutor/Certification).

## Limitaciones conocidas (honestas)

- Sin syntax highlighting real (coloreado por token) — solo un code
  block con fondo/borde/fuente monoespaciada + etiqueta de lenguaje.
  Documentado como decisión, no como bug: se puede reconsiderar en un
  bloque futuro si se justifica el peso de una dependencia.
- Sin captions con sintaxis Markdown propia — se usa la convención ya
  existente (`*Figura: ...*` en el párrafo inmediato siguiente a la
  imagen), nunca una sintaxis nueva inventada.
- El patrón de exclusión `_prefijo` es una convención de autor, no
  garantiza cubrir cualquier nombre posible de directorio no-pedagógico
  — si aparece un caso real distinto (sin `.`/`_` de prefijo) se
  evaluará entonces, nunca se anticipa con una lista de keywords.
