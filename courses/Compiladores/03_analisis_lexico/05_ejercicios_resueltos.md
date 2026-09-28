# Ejercicios resueltos

## 1. Maximal munch
Entrada: `a==b=10`. Si existen reglas `IDENT`, `==`, `=`, `INT`, el scanner produce `IDENT(a) EQEQ IDENT(b) ASSIGN INT(10)`. Tras leer el primer `=`, el estado es aceptante para `ASSIGN`, pero hay una transición adicional con `=` a un estado aceptante más largo; por ello no se emite aún.

## 2. ¿Por qué regex no basta para paréntesis balanceados?
El lenguaje `{ '('^n ')'^n | n>=0 }` exige recordar un contador no acotado. Un autómata finito tiene un número finito de estados y no puede distinguir arbitrariamente muchos niveles. Se requiere al menos una pila, que aparece en los pushdown automata asociados a CFG.
