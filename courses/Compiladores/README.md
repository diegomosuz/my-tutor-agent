# Compiladores End-to-End — del lenguaje fuente a RISC-V

## Propósito

Este material forma una **materia universitaria teórico-práctica de nivel intermedio/avanzado** cuyo objetivo es que el estudiante comprenda y construya un compilador completo. La organización conceptual sigue los doce capítulos de la segunda edición de *Compilers: Principles, Techniques, and Tools* (Aho, Lam, Sethi y Ullman) y se complementa con la progresión práctica clásica de Stanford CS143: análisis léxico, parsing, semántica/tipos, runtime, IR, optimización y generación de código.

El contenido es **original y didáctico**: no reproduce el texto del libro. Usa la estructura temática como referencia para desarrollar explicaciones, demostraciones, ejercicios y un proyecto propio.

## Competencia general

Al finalizar, el estudiante será capaz de:

1. especificar formalmente un lenguaje de programación;
2. implementar análisis léxico y sintáctico;
3. construir AST, tabla de símbolos y análisis semántico;
4. definir y emitir una representación intermedia;
5. modelar el entorno en tiempo de ejecución;
6. construir un CFG y ejecutar análisis de flujo de datos;
7. aplicar optimizaciones locales y globales;
8. realizar selección de instrucciones y asignación de registros;
9. generar ensamblador **RISC-V RV64** válido;
10. comprender el vínculo entre ensamblador y encoding de instrucciones;
11. razonar sobre ILP, localidad, paralelismo y análisis interprocedural.

## Lenguaje del proyecto: MiniC-RV

Durante todo el curso se implementa **MiniC-RV**, un lenguaje imperativo pequeño inspirado en C. El subconjunto inicial contiene:

```c
int max(int a, int b) {
    if (a > b) return a;
    return b;
}

int main() {
    int x = 3;
    int y = 5;
    return max(x, y);
}
```

El lenguaje crecerá de manera incremental para incluir `int`, `bool`, variables, expresiones, bloques, `if/else`, `while`, funciones, parámetros, arrays simples y memoria dinámica opcional.

## Target

El backend pedagógico genera **RISC-V RV64I** (con `M` opcional para multiplicación/división) porque su ISA es regular y facilita explicar selección de instrucciones, calling convention, registros y encoding.

## Estructura

Cada módulo contiene:

- `00_competencias.md`: resultados de aprendizaje y mapa conceptual;
- varios archivos temáticos con teoría, formalización, ejemplos y ejercicios;
- `99_laboratorio.md`: práctica incremental del compilador;
- `images/`: diagramas e imágenes referenciados desde los Markdown.

## Estrategia de aprendizaje

La materia usa una secuencia **concepto → formalización → ejemplo → implementación → prueba → reflexión**. No se presenta código como receta antes de explicar el modelo que lo justifica.

## Requisitos sugeridos

- Estructuras de datos y algoritmos.
- Programación en Python, Java, C++ o lenguaje equivalente.
- Conceptos básicos de arquitectura de computadores.
- Familiaridad con terminal, Git y testing automatizado.

## Toolchain sugerido

- Python 3.11+ para implementar el compilador de referencia.
- `pytest` para pruebas.
- Graphviz para visualizar AST/CFG.
- RARS, GNU RISC-V toolchain o QEMU para ensamblar/ejecutar el código generado.

## Referencias primarias

- A. V. Aho, M. S. Lam, R. Sethi, J. D. Ullman. *Compilers: Principles, Techniques, and Tools*, 2nd ed.
- Stanford CS143 — Compilers.
- RISC-V ISA Specification y RISC-V ABI, como referencia del backend.

Consulte también `PROYECTO_INTEGRADOR.md`, `MAPA_DEL_CURSO.md` y `RUBRICA.md`.
