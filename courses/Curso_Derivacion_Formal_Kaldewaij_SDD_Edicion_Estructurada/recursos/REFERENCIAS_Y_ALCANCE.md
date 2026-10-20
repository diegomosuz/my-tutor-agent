# Trazabilidad a la obra base y delimitación de alcance

## Fuente primaria

Anne Kaldewaij, *Programming: The Derivation of Algorithms*, Prentice Hall International, 1990. El PDF de referencia fue suministrado para este curso. El ZIP **no redistribuye el libro**: incluye un curso original y complementos técnicos. Las notaciones y leyes formales son convenciones matemáticas; las exposiciones y ejercicios del curso están redactados de manera propia.

## Referencia por capítulo y página impresa

| Libro | Página impresa de inicio | Secciones explícitas en el índice | Archivo del curso |
|---|---:|---|---|
| 0 Introduction | 1 | Introducción | `00-introduccion.md` |
| 1 Predicate Calculus | 4 | Predicados, sustituciones, cuantificadores | `01-calculo-predicados.md` |
| 2 The Guarded Command Language | 13 | 2.0–2.7: skip, asignación, concatenación, selección, repetición, constantes/bloques/arreglos | `02-comandos-guardados.md` |
| 3 Quantifications | 44 | Cuantificaciones de operaciones generales | `03-cuantificaciones.md` |
| 4 General Programming Techniques | 51 | 4.0–4.5: conjuncts, replacing constants, strengthening, tail invariants | `04-tecnicas-generales.md` |
| 5 Deriving Efficient Programs | 83 | 5.1 división entera; 5.2 Fibonacci | `05-programas-eficientes.md` |
| 6 Searching | 92 | 6.1 lineal; 6.2 bounded linear; 6.3 binaria; 6.4 eliminación | `06-busqueda.md` |
| 7 Segment Problems | 110 | 7.1 más largos: ceros, left-minimal, a lo sumo diez ceros, diferentes; 7.2 más cortos | `07-problemas-segmentos.md` |
| 8 Slope Search | 127 | 8.1 principio; 8.1.1 suma de cuadrados; 8.1.2 distancia mínima; 8.2 segmentos y variantes | `08-slope-search.md` |
| 9 Mixed Problems | 148 | Problemas integradores | `09-problemas-mixtos.md` |
| 10 Array Manipulations | 152 | 10.1 asignaciones; 10.2 swaps; 10.2.0 Dutch National Flag; 10.2.1 rotación | `10-manipulacion-arreglos.md` |
| 11 Sorting | 170 | 11.1 inserción/selección/burbuja; 11.2 quicksort/mergesort/heapsort | `11-ordenamiento.md` |
| 12 Auxiliary Arrays | 195 | 12.0 K ceros; 12.1 histograma; 12.2 LCS; 12.3 shortest segment | `12-arreglos-auxiliares.md` |

**Fidelidad:** se conserva el recorrido conceptual y las familias de técnicas. Cuando el archivo presenta un ejemplo nuevo o generalización, se declara pedagógicamente y no se presenta como un extracto literal. Una pretensión de reproducir palabra por palabra el texto completo o todos sus ejercicios no formaría parte de esta edición.

## Contenido moderno no presente en Kaldewaij

- APIs REST y FastAPI.
- Machine Learning y contratos de inferencia.
- SDD, templates de spec y Pull Requests.
- Agentes generativos y skills `SKILL.md`.
- Testing moderno y evidencia automatizada.

Estas aplicaciones son **adaptaciones prácticas** que utilizan el razonamiento formal de los doce capítulos, no enseñanzas históricas atribuidas al libro.

## Herramientas externas consultables

- Claude Code Skills: https://code.claude.com/docs/en/skills
- GitHub Copilot Skills: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills
- FastAPI: https://fastapi.tiangolo.com/
- Pydantic v2: https://docs.pydantic.dev/latest/
- HTTPX: https://www.python-httpx.org/

Su estado y sintaxis pueden cambiar: verificar documentación de la versión instalada antes de llevar el ejemplo a producción.
