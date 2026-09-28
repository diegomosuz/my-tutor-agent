# Laboratorio — Análisis interprocedural y auditoría final

1. Construya call graph de todo el programa.
2. Detecte SCCs/recursión.
3. Calcule summaries de `reads`, `writes`, `calls`, `pure`.
4. Propague una constante a través de una llamada simple.
5. Implemente un mini points-to analysis sobre un IR reducido o una extensión con punteros.

## Auditoría final del compilador
Para un programa completo, entregue:
- source;
- token stream;
- AST;
- símbolos/tipos;
- TAC;
- CFG;
- data-flow facts;
- IR optimizado;
- liveness;
- interference graph;
- RISC-V assembly;
- evidencia de ejecución.

El informe final debe explicar una invariante entre cada par de representaciones.
