# Rúbrica global sugerida

| Dimensión | Peso | Evidencia de dominio |
|---|---:|---|
| Especificación formal | 10% | gramática, léxico, tipos y semántica documentados |
| Front-end | 20% | lexer/parser robustos, AST limpio, buenos diagnósticos |
| Semántica e IR | 20% | scope, tipos, TAC/CFG correctos |
| Runtime + backend | 25% | calling convention, registros y RISC-V ejecutable |
| Optimización | 15% | análisis de flujo de datos y preservación semántica |
| Calidad de ingeniería | 10% | tests, diseño modular, Git, documentación |

## Criterio de aprobación técnica

No alcanza con “generar assembly”. El estudiante debe ser capaz de explicar qué invariantes garantizan que cada transformación conserva el significado del programa y justificar el diseño de cada representación interna.
