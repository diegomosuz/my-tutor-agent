# Proyecto integrador — compilador MiniC-RV

## Producto final

Un compilador de línea de comandos:

```bash
minicrv programa.mc --emit-tokens
minicrv programa.mc --emit-ast
minicrv programa.mc --emit-ir
minicrv programa.mc --emit-cfg
minicrv programa.mc -O0 -S -o programa.s
minicrv programa.mc -O1 -S -o programa_opt.s
```

La opción `-S` produce ensamblador RISC-V. El compilador debe emitir diagnósticos con ubicación de línea/columna y retornar un código de salida no cero ante errores.

## Arquitectura de referencia

```text
source
  │
  ▼
Lexer ──tokens──► Parser ──AST──► Resolver/TypeChecker
                                      │
                                      ▼
                              IR / Three-Address Code
                                      │
                                      ▼
                              CFG + Data-flow
                                      │
                              ┌───────┴────────┐
                              ▼                ▼
                           -O0 backend      Optimizer -O1
                              │                │
                              └───────┬────────┘
                                      ▼
                         Instruction Selection
                                      ▼
                         Register Allocation
                                      ▼
                         RISC-V Assembly
                                      ▼
                         assembler / emulator
```

## Invariantes de ingeniería

1. Cada fase consume una representación bien definida y produce otra.
2. Los nodos del AST incluyen `SourceSpan` para diagnósticos.
3. El parser no hace optimizaciones.
4. El type checker no genera assembly.
5. Las optimizaciones preservan semántica y operan sobre IR/CFG.
6. El backend no necesita conocer detalles sintácticos del lenguaje fuente.
7. Cada bug corregido debe dejar una prueba de regresión.

## Entregas incrementales

| Entrega | Módulos | Evidencia |
|---|---:|---|
| E1 | 1–3 | especificación + lexer + tests |
| E2 | 4–5 | parser + AST + acciones semánticas |
| E3 | 6 | tabla de símbolos + tipos + TAC + CFG |
| E4 | 7–8 | runtime + RISC-V ejecutable |
| E5 | 9 | optimizador y equivalencia observable |
| E6 | 10–12 | informe de técnicas avanzadas + extensión elegida |

## Pruebas obligatorias

- unitarias por fase;
- golden tests para tokens, AST, IR y assembly;
- programas válidos e inválidos;
- casos límite de precedencia, alcance y control de flujo;
- ejecución diferencial: comparar salida del intérprete de referencia con el código RISC-V;
- tests de no-regresión de optimizaciones.
