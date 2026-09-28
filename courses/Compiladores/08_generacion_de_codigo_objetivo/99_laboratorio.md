# Laboratorio — Backend RISC-V ejecutable

Implemente:
- selección de instrucciones para aritmética, comparaciones, branches, loads/stores y calls;
- liveness;
- grafo de interferencia;
- allocation por coloreo heurístico;
- spilling simple;
- prologue/epilogue;
- emisión `.s`.

Ensamble/ejecute con RARS o toolchain GNU/QEMU. Compare el resultado con un intérprete de AST o IR.

### Extensión avanzada
Codifique manualmente un subconjunto de instrucciones RV64I y compare bytes con `objdump`.
