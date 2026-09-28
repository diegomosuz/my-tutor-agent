# Ejercicios resueltos

## 1. May vs must
Reaching definitions usa unión porque interesa qué definiciones **pueden** llegar. Available expressions usa intersección porque una expresión solo es reutilizable sin recomputar si está disponible por **todos** los caminos.

## 2. LICM inseguro
Mover `10/x` fuera de un loop puede introducir división por cero en ejecuciones donde el loop originalmente tenía cero iteraciones. Incluso siendo invariante, la operación no es necesariamente segura para ejecución especulativa.
