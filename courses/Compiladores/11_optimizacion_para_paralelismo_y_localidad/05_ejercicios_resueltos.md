# Ejercicios resueltos

## 1. Dependencia
`A[i] = A[i-1] + 1` tiene flow dependence de distancia 1. Un DOALL que ejecute todas las iteraciones simultáneamente viola el orden productor→consumidor.

## 2. Localidad
En arrays row-major, el último índice es contiguo. Un loop interno sobre ese índice suele tener mejor localidad espacial. Interchange puede mejorarlo solo si las dependencias permiten permutar el orden.
