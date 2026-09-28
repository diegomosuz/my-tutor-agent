# Mapa del curso

| Módulo | Núcleo teórico | Incremento del compilador |
|---|---|---|
| 01 | Introducción y fundamentos de compiladores (Capítulo 1) | Arquitectura y especificación de MiniC-RV |
| 02 | Traductor simple dirigido por la sintaxis (Capítulo 2) | Traductor de expresiones y AST mínimo |
| 03 | Análisis léxico (Capítulo 3) | Lexer completo |
| 04 | Análisis sintáctico (Capítulo 4) | Parser y AST estructural |
| 05 | Traducción dirigida por la sintaxis (Capítulo 5) | Atributos y acciones semánticas |
| 06 | Generación de código intermedio y análisis semántico (Capítulo 6) | Semántica, tipos, TAC y CFG |
| 07 | Entornos en tiempo de ejecución (Capítulo 7) | Runtime y calling convention |
| 08 | Generación de código objetivo (Capítulo 8) | Backend RISC-V y registros |
| 09 | Optimización independiente de la máquina (Capítulo 9) | Optimizador de IR |
| 10 | Paralelismo a nivel de instrucción (Capítulo 10) | Scheduler experimental |
| 11 | Optimización para paralelismo y localidad (Capítulo 11) | Optimizaciones de bucles/localidad |
| 12 | Análisis interprocedural (Capítulo 12) | Análisis whole-program y cierre |

## Hitos sugeridos

- **Hito A — Front-end funcional:** módulos 1–4.
- **Hito B — Front-end semántico + IR:** módulos 5–6.
- **Hito C — Programa ejecutable:** módulos 7–8.
- **Hito D — Optimizador:** módulo 9.
- **Hito E — Técnicas avanzadas:** módulos 10–12.

Un curso semestral puede dedicar más semanas a los módulos 3, 4, 6, 8 y 9, que concentran mayor carga de implementación.
