# Ejercicios resueltos

## 1. Asociatividad
Con `E -> E - T | T`, la derivación produce estructura izquierda para `a-b-c`: `(a-b)-c`. Si se transforma a una gramática LL eliminando recursión izquierda, el parser debe construir el AST acumulativamente para conservar esa asociatividad.

## 2. FIRST/FOLLOW y nullable
Si `A -> B C`, `B -> b | ε`, `C -> c`, entonces `FIRST(A)={b,c}`. `c` aparece porque `B` puede desaparecer. Ignorar nullable produce una tabla predictiva incompleta.
