# Curso: Derivación formal de programas — Kaldewaij y aplicaciones actuales

**Material de estudio en español, basado en competencias**, con estructura por capítulos y secciones, ejercicios, plantillas y skills para SDD y agentes de programación.

## Alcance y fidelidad a la obra

El **índice y los títulos de las secciones de los capítulos 0–12** siguen la organización de *Programming: The Derivation of Algorithms* (Anne Kaldewaij, Prentice Hall, 1990). Se conservan la notación matemática y el estilo de derivación en las formulaciones empleadas.

**Advertencia importante sobre la literalidad:** el PDF adjunto es una imagen escaneada de 233 páginas, no texto procesable. La presente edición ofrece desarrollos didácticos en español y material original estructurado por secciones; **no debe describirse como traducción literal íntegra ni como reproducción palabra por palabra del contenido de todas las páginas**. El PDF original se incluye en `recursos/` para cotejar pasajes, fórmulas y diagramas. Una traducción literal completa y revisada requiere transcripción fiable y revisión editorial de cada página, incluidas sus fórmulas.

## Índice navegable

### Parte I — Fundamentos y derivación de algoritmos (capítulos 0–12)

- **Capítulo 0 — [Introducción](<00 - Introducción/0 - Introducción.md>)** · 1 archivo(s) de sección
- **Capítulo 1 — [Cálculo de predicados](<01 - Cálculo de predicados/1 - Cálculo de predicados.md>)** · 1 archivo(s) de sección
- **Capítulo 2 — [Lenguaje de comandos guardados](<02 - Lenguaje de comandos guardados/2.0 - Introducción.md>)** · 8 archivo(s) de sección
- **Capítulo 3 — [Cuantificaciones](<03 - Cuantificaciones/3 - Cuantificaciones.md>)** · 1 archivo(s) de sección
- **Capítulo 4 — [Técnicas generales de programación](<04 - Técnicas generales de programación/4.0 - Introducción.md>)** · 6 archivo(s) de sección
- **Capítulo 5 — [Derivación de programas eficientes](<05 - Derivación de programas eficientes/5.0 - Introducción.md>)** · 3 archivo(s) de sección
- **Capítulo 6 — [Búsqueda](<06 - Búsqueda/6.0 - Introducción.md>)** · 5 archivo(s) de sección
- **Capítulo 7 — [Problemas de segmentos](<07 - Problemas de segmentos/7.0 - Introducción.md>)** · 7 archivo(s) de sección
- **Capítulo 8 — [Búsqueda por pendientes](<08 - Búsqueda por pendientes/8.0 - Introducción.md>)** · 9 archivo(s) de sección
- **Capítulo 9 — [Problemas mixtos](<09 - Problemas mixtos/9 - Problemas mixtos.md>)** · 1 archivo(s) de sección
- **Capítulo 10 — [Manipulación de arreglos](<10 - Manipulación de arreglos/10.0 - Introducción.md>)** · 5 archivo(s) de sección
- **Capítulo 11 — [Ordenamiento](<11 - Ordenamiento/11.0 - Introducción.md>)** · 9 archivo(s) de sección
- **Capítulo 12 — [Arreglos auxiliares](<12 - Arreglos auxiliares/12.0 - A lo sumo K ceros.md>)** · 4 archivo(s) de sección

### Parte II — SDD, agentes y competencias profesionales (capítulos 13–20)

- **Capítulo 13 — [Contratos formales para software moderno](<13 - Contratos formales para software moderno/13.0 - Objetivos y contexto.md>)** · 5 archivo(s) de sección
- **Capítulo 14 — [Desarrollo guiado por especificaciones](<14 - Desarrollo guiado por especificaciones/14.0 - SDD y unidades funcionales.md>)** · 5 archivo(s) de sección
- **Capítulo 15 — [Agentes de programación y derivación](<15 - Agentes de programación y derivación/15.0 - Problema y límites de la generación automática.md>)** · 5 archivo(s) de sección
- **Capítulo 16 — [Verificación y evidencias de corrección](<16 - Verificación y evidencias de corrección/16.0 - Pruebas matemáticas y experimentales.md>)** · 5 archivo(s) de sección
- **Capítulo 17 — [Derivación de pipelines y reglas de negocio](<17 - Derivación de pipelines y reglas de negocio/17.0 - Caso de uso del procesamiento determinístico.md>)** · 5 archivo(s) de sección
- **Capítulo 18 — [Laboratorio de API de inferencia de ML](<18 - Laboratorio de API de inferencia de ML/18.0 - Caso de uso y arquitectura.md>)** · 6 archivo(s) de sección
- **Capítulo 19 — [Proyecto integrador con SDD y agentes](<19 - Proyecto integrador con SDD y agentes/19.0 - Objetivos del proyecto por competencias.md>)** · 5 archivo(s) de sección
- **Capítulo 20 — [Creación de skills y utilización del curso](<20 - Creación de skills y utilización del curso/20.0 - Propósito del material auxiliar y de las skills.md>)** · 9 archivo(s) de sección

### Carpetas complementarias

- [`actividades/`](actividades/AUTOEVALUACION.md): evaluaciones, autoevaluación y proyecto final.
- [`plantillas/`](plantillas/SPEC_CONTRATO.md): contratos, derivaciones, revisión y evidencias para copiar a cada feature.
- [`recursos/`](recursos/NOTACION_Y_CONVENCIONES.md): glosario, convenciones, guías docentes y facsímil del libro.
- [`skills/`](skills/README.md): habilidades reutilizables de contrato, derivación, revisión y evidencia.

**El capítulo 20 explica en detalle el propósito, contenido, uso y mantenimiento de las cuatro carpetas auxiliares**, además de cómo crear skills para Claude Code y agentes similares.

## Convención matemática

Se utiliza `{P} S {Q}` para contratos, `wp.S.Q` para precondición más débil, `if B → S [] ... fi` para selección y `do B → S [] ... od` para iteración. Los rangos cuantificados se presentan como `(Σ i: R.i: E.i)`. Los nombres concretos y las hipótesis de los ejercicios se definen antes de cada derivación.

## Sugerencia de uso

Estudiar los capítulos 0–4 antes de los algoritmos especializados; resolver y defender una derivación por sección; después desarrollar una feature SDD completa con el capítulo 18; cerrar con las skills del capítulo 20. Las pruebas experimentales son evidencia adicional y no reemplazan una demostración formal.

## Fuente

Anne Kaldewaij, *Programming: The Derivation of Algorithms*, Prentice Hall, 1990. Documento aportado por el usuario. Consultar [mapa de correspondencia](recursos/MAPA_LIBRO_Y_SECCIONES.md).
