# Plan semestral sugerido — 16 semanas

| Semana | Contenido | Hito práctico |
|---:|---|---|
| 1 | M1: procesadores, fases, especificación | especificación MiniC-RV |
| 2 | M2: traductor simple, AST/TAC mínimo | traductor de expresiones |
| 3 | M3: regex, AFN/AFD, scanner | lexer |
| 4 | M4: CFG, FIRST/FOLLOW, LL | parser descendente |
| 5 | M4: LR/SLR/LALR | práctica parser generator |
| 6 | M5: SDD, atributos | visitors/acciones semánticas |
| 7 | M6: scope, símbolos y tipos | front-end semántico |
| 8 | M6: TAC, CFG, backpatching | IR completo |
| 9 | M7: stack, frames, ABI, GC | runtime model |
| 10 | M8: instruction selection | backend inicial |
| 11 | M8: liveness y registros | assembly ejecutable |
| 12 | M9: data-flow | worklist engine |
| 13 | M9: optimizaciones | `-O1` |
| 14 | M10: ILP/scheduling | scheduler experimental |
| 15 | M11: loops, locality, parallelism | benchmark/transformaciones |
| 16 | M12: interprocedural + defensa | auditoría final del compilador |

## Distribución sugerida de evaluación

- ejercicios formales individuales: 20%;
- entregas incrementales del compilador: 45%;
- parciales conceptuales: 20%;
- defensa final y demostración end-to-end: 15%.

La defensa debe obligar a navegar un mismo programa a través de las representaciones internas. El estudiante debería poder explicar, sin ejecutar el código, por qué cada transición es correcta.
