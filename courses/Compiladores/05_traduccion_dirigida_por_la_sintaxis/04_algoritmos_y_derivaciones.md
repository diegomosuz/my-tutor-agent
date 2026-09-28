# Algoritmos y derivaciones — sistemas de atributos

## 1. Construcción del grafo de dependencias

Para cada instancia de producción:

1. cree un nodo por atributo usado/calculado;
2. por cada ecuación `y = f(x1,...,xn)`, cree aristas `xi -> y`;
3. ejecute topological sort;
4. si no se procesan todos los nodos, existe ciclo.

Un topological order es un schedule de evaluación válido.

## 2. Traducción a funciones

Atributo heredado → argumento; atributo sintetizado → retorno.

```text
visit(node, inherited_env) -> synthesized_result
```

Esta correspondencia permite implementar ideas de SDD sin un runtime especial de atributos.

## 3. L-attributed

Para producción `A -> X1 X2 ... Xn`, un atributo heredado de `Xi` puede depender de:

- atributos heredados de `A`;
- atributos de `X1...Xi-1` disponibles a la izquierda.

Así un recorrido depth-first izquierda→derecha puede calcularlo antes de visitar `Xi`.

## 4. Caso de labels

Para booleanos, pase `true_label` y `false_label` como heredados. La traducción de `B1 && B2` crea una etiqueta `L` y usa:

```text
B1(true=L, false=F)
L:
B2(true=T, false=F)
```

No se necesita materializar un booleano temporal.
