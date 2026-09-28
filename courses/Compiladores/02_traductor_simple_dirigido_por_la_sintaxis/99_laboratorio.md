# Laboratorio — Traductor mínimo de expresiones

Implemente un programa que lea expresiones enteras, construya AST, evalúe y emita postfix y TAC.

### Casos mínimos
- `1+2*3`
- `(1+2)*3`
- `10-3-2`
- `-5+8`

### Requisitos
- nodos AST explícitos;
- spans de origen;
- pretty-printer del árbol;
- temporales `t0,t1,...`;
- golden tests.

### Extensión
Agregue variables y una tabla de símbolos simple con declaraciones `let`.
