# Algoritmos y derivaciones — data-flow y optimización

## 1. Worklist genérica

```text
initialize facts
worklist = all blocks
while worklist:
    B = pop()
    new_in  = meet(facts of predecessors/successors)
    new_out = transfer(B,new_in)
    if fact changed:
        store
        enqueue affected neighbors
```

La dirección decide si vecinos son sucesores o predecesores. La convergencia proviene de dominio finito/ascending chain condition y funciones monotónicas.

## 2. Dominadores

Inicialización clásica:

```text
DOM[entry] = {entry}
DOM[n!=entry] = all_nodes
repeat:
  DOM[n] = {n} union intersection(DOM[p] for p in pred[n])
until stable
```

El dominador inmediato puede extraerse del conjunto final. Algoritmos como Lengauer-Tarjan son más eficientes, pero la versión iterativa es excelente para aprendizaje.

## 3. Constant propagation lattice

Por variable:

```text
       NAC
      / | \
    c1 c2 c3 ...
      \ | /
      UNDEF
```

`meet(c,c)=c`; `meet(c1,c2)=NAC` si distintas; `meet(UNDEF,x)=x` bajo la convención habitual del análisis.

## 4. DCE

Una instrucción pura `d = op(args)` puede eliminarse si `d` no está vivo después. Una `store`, `call` o instrucción potencialmente trapping requiere una clasificación explícita de efectos; “resultado no usado” no basta.
