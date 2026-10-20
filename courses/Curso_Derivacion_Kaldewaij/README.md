# Curso integral de derivación de programas

**Enfoque:** Anne Kaldewaij, *Programming: The Derivation of Algorithms* (Prentice Hall, 1990).  
**Idioma:** español · **Formato:** Markdown UTF-8 y fórmulas LaTeX · **Modalidad:** formación basada en competencias.  
**Nivel:** intermedio–avanzado · **Carga sugerida:** 112 horas: 4 de introducción, 80 en los 12 capítulos técnicos y 28 de aplicación contemporánea.

> **Alcance y autoría.** Material didáctico original en español, organizado **uno a uno** según los capítulos técnicos 1 a 12 del libro. Conserva las convenciones matemáticas y los tipos de razonamiento, pero las explicaciones, ejemplos y ejercicios son desarrollos didácticos originales; **no es una traducción ni una reproducción literal** del libro. Las herramientas de SDD/IA se presentan explícitamente como extensiones contemporáneas y no se atribuyen a la autora.

## Por qué hay un capítulo 00

El libro contiene **un capítulo 0 introductorio, además de los capítulos 1–12**. Para respetar «doce capítulos uno a uno», el curso incluye la introducción como `00-introduccion.md` y numera los doce capítulos técnicos `01` a `12` con idéntica correspondencia temática.

## Cómo recorrer el curso

1. Leer [`00-introduccion`](capitulos/00-introduccion.md) y la [guía de notación](recursos/NOTACION_Y_CONVENCIONES.md).
2. Trabajar los capítulos 01–04 para dominar el cálculo de predicados, la semántica del lenguaje de comandos guardados, las cuantificaciones y los invariantes.
3. Resolver los capítulos 05–12 derivando —no memorizando— programas eficientes.
4. Aplicar los capítulos complementarios 13–18 al desarrollo con SDD, agentes y auditorías de evidencias.
5. Entregar el [proyecto integrador](actividades/PROYECTO_FINAL.md) y usar la [rúbrica](recursos/RUBRICA_COMPETENCIAS.md).

## Mapa exacto de contenidos

| Curso | Capítulo del libro | Contenido |
|---|---|---|
| [00](capitulos/00-introduccion.md) | 0 | Introducción a la programación por derivación |
| [01](capitulos/01-calculo-predicados.md) | 1 | Predicate Calculus |
| [02](capitulos/02-comandos-guardados.md) | 2 | The Guarded Command Language |
| [03](capitulos/03-cuantificaciones.md) | 3 | Quantifications |
| [04](capitulos/04-tecnicas-generales.md) | 4 | General Programming Techniques |
| [05](capitulos/05-programas-eficientes.md) | 5 | Deriving Efficient Programs |
| [06](capitulos/06-busqueda.md) | 6 | Searching |
| [07](capitulos/07-problemas-segmentos.md) | 7 | Segment Problems |
| [08](capitulos/08-slope-search.md) | 8 | Slope Search |
| [09](capitulos/09-problemas-mixtos.md) | 9 | Mixed Problems |
| [10](capitulos/10-manipulacion-arreglos.md) | 10 | Array Manipulations |
| [11](capitulos/11-ordenamiento.md) | 11 | Sorting |
| [12](capitulos/12-arreglos-auxiliares.md) | 12 | Auxiliary Arrays |

## Complementos: aplicaciones actuales (no pertenecen al libro)

| Capítulo | Enfoque |
|---|---|
| [13](complementarios/13-contratos-software-moderno.md) | API, persistencia, ML, servicios externos y límites formales |
| [14](complementarios/14-sdd-por-feature.md) | SDD con specs breves y derivación proporcional al riesgo |
| [15](complementarios/15-agentes-codigo.md) | Claude Code/Codex/Copilot y disciplina de agentes |
| [16](complementarios/16-skills-reutilizables.md) | Construcción de skills, prompts, artefactos, gates |
| [17](complementarios/17-verificacion-evidencia.md) | Pruebas, evidencias, equivalencia con implementación |
| [18](complementarios/18-laboratorio-integrador-api-ml.md) | Ejercicio integral API→ML, derivación y traducción Python |

## Recursos adicionales

- [Notación y símbolos](recursos/NOTACION_Y_CONVENCIONES.md)
- [Mapa de competencias y resultados](recursos/MAPA_COMPETENCIAS.md)
- [Guía de estudio y evaluación](recursos/GUIA_DOCENTE.md)
- [Rúbrica analítica](recursos/RUBRICA_COMPETENCIAS.md)
- [Glosario](recursos/GLOSARIO.md)
- [Errores frecuentes](recursos/ERRORES_FORMALES.md)
- [Soluciones seleccionadas](recursos/SOLUCIONES_SELECCIONADAS.md)
- [Trazabilidad y alcance de la obra fuente](recursos/REFERENCIAS_Y_ALCANCE.md)
- [Autoevaluación](actividades/AUTOEVALUACION.md)
- [Proyecto final](actividades/PROYECTO_FINAL.md)
- [Cómo extraer el laboratorio Python del Markdown](actividades/EXTRAER_CODIGO_LAB.md)
- [Plantilla de derivación](plantillas/DERIVACION.md)
- [Plantilla SDD + contrato](plantillas/SPEC_CONTRATO.md)
- [Plantilla de evidencia](plantillas/EVIDENCIAS.md)
- [Skills para agentes](skills/README.md)

## Convenciones comunes de las derivaciones

- `{P} S {Q}` es un triple de corrección total en el sentido operativo del libro: todas las ejecuciones desde `P` terminan satisfaciendo `Q`.
- `wp.S.Q` es la precondición más débil que garantiza `Q` después de `S` (corrección total, donde se indica).
- `P ≡ Q` representa equivalencia lógica; `P ⇒ Q`, implicación.
- `if B₀ → S₀ [] B₁ → S₁ fi` y `do B₀ → S₀ [] B₁ → S₁ od` son comandos guardados; cuando varias guardas son verdaderas, la elección puede ser no determinista.
- Cuantificaciones en forma `(⊕ i : R.i : F.i)`, donde `⊕` puede ser `Σ`, `max`, `min`, `∀`, `∃`, `#`.
- `f.i` denota el elemento `i` del arreglo `f`; `f[i]` se admite únicamente en las traducciones a lenguajes modernos.
- Cada demostración distingue igualdad (`=`), equivalencia (`≡`) e implicación (`⇒`, `⇐`).

**Importante:** las derivaciones en texto se muestran en notación original compatible con Markdown; cuando un visor admite MathJax/KaTeX, las fórmulas encerradas en `$...$` o `$$...$$` se renderizan matemáticamente.
