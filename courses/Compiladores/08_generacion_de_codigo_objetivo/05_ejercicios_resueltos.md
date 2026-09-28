# Ejercicios resueltos

## 1. Liveness
Para `t1=a+b; t2=t1*c; return t2`, justo antes de la segunda instrucción están vivos `t1` y `c`; `a` y `b` ya no son necesarios si no tienen usos posteriores. El grafo de interferencia se deriva de simultaneidad de vida, no de estar en la misma función.

## 2. Spill
Si un temporal vivo a través de una llamada ocupa un registro caller-saved, el allocator puede moverlo a callee-saved, salvarlo alrededor de la llamada o spillarlo. La mejor opción depende del costo y disponibilidad.
