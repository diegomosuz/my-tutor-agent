# Ejercicios resueltos

## 1. Context-insensitive
Si `id(p)` se llama una vez con `&a` y otra con `&b`, un análisis context-insensitive puede concluir que el parámetro de `id` apunta a `{a,b}` en ambas llamadas. Es sound pero menos preciso.

## 2. Summary
Una función que solo calcula `return x+1` puede resumirse como `reads={arg0}, writes={}, may_throw=false` bajo un modelo sin overflow/traps relevantes. Esa información habilita movimiento/inlining con más confianza.
