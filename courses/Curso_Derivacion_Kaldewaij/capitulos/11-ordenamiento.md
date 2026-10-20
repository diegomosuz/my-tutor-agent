# 11 · Ordenamiento

**Correspondencia:** capítulo 11 (*Sorting*): inserción, selección, burbuja; quicksort, mergesort y heapsort. **Carga:** 8 h.

## Competencias a lograr

1. Especificar ordenamiento como conjunción de **orden total/no decreciente** y **preservación de multiconjunto**.
2. Derivar invariantes característicos de algoritmos cuadráticos y demostrar el papel de las operaciones de intercambio.
3. Comparar estrategias avanzadas por partición, mezcla y estructura de heap, distinguiendo costos medios y peores casos.

**Evidencias:** tres demostraciones sobre arreglos pequeños pero paramétricos, derivación anotada de inserción y un informe comparativo sobre quicksort/mergesort/heapsort.

## 11.0 · Especificación que no debe perderse

Sea `f_in` el arreglo inicial, `f` el final. Ordenación ascendente:

$$Ord(f)\equiv(\forall i:0\le i<N-1:f.i\le f.(i+1)).$$

Propiedad de permutación, en términos de multiplicidad de cada valor:

$$Perm(f,f_{in})\equiv(\forall v:\#\{i:f.i=v\}=\#\{i:f_{in}.i=v\}).$$

La postcondición completa es `Ord(f)∧Perm(f,f_in)`. Solo `Ord(f)` permitiría una «solución» que reemplace todos los elementos por cero, inválida para ordenar.

## 11.1.0 · Ordenamiento por inserción

Invariante exterior:

$$I\equiv0\le n\le N\land Ord(f.[0..n))\land Perm(f,f_{in}).$$

Al entrar con `n`, el prefijo `f.[0..n)` está ordenado. Se debe insertar `f.n` manteniendo permutación. Con intercambios adyacentes movemos el nuevo valor hacia la izquierda mientras sea menor que su vecino anterior:

```text
n:=1;
do n<N →
   k:=n;
   do k>0 ∧ f.k<f.(k-1) →
       swap(f.k,f.(k-1));
       k:=k-1
   od;
   n:=n+1
od
```

El ciclo interno disminuye `k` y conserva la propiedad de que las posiciones ajenas a la frontera ya están ordenadas; al terminar, la clave alcanzó su posición correcta dentro del prefijo ampliado. **Costo:** peor `O(N²)`, mejor `O(N)` comparaciones si ya está ordenado, memoria `O(1)`.

## 11.1.1 · Ordenamiento por selección

Separar el arreglo en `[0..n)` ya ordenado y `[n..N)` no resuelto. El predicado útil es:

$$I\equiv Ord(f.[0..n))\land
(\forall i,j:0\le i<n\le j<N:f.i\le f.j)\land Perm(f,f_{in}).$$

Para ampliar el prefijo, encontramos el índice `m` del mínimo de `f.[n..N)` y lo intercambiamos con `f.n`. La nueva frontera `n+1` conserva que todos los elementos anteriores son menores o iguales a los restantes.

**Costo:** `O(N²)` comparaciones, a lo sumo `N` swaps; difiere de inserción en el patrón de movimientos.

## 11.1.2 · Ordenamiento burbuja

El razonamiento se apoya en **comparaciones y permutaciones locales** de vecinos. Un barrido que intercambia vecinos desordenados coloca un extremo en su posición definitiva. El invariante externo delimita un sufijo o prefijo ya ordenado y separado en valor del resto.

Para un barrido de izquierda a derecha, el máximo de la región no resuelta va al extremo derecho. Repitiendo sobre prefijos decrecientes se obtiene el arreglo ordenado.

**Costo:** peor `O(N²)`, y puede reconocerse si un barrido no hizo intercambios. Una mejora de salida anticipada debe justificarse: ningún par adyacente desordenado en un barrido completo implica orden global.

## 11.2.0 · Quicksort

Postcondición `Ord∧Perm`. Se introduce una **partición** alrededor de un pivote `p`, con dos regiones de valores `≤p` y `≥p`. Si `partition` preserva el multiconjunto y produce subproblemas estrictamente menores, ordenar recursivamente cada región garantiza orden global.

Las obligaciones son: (i) partición correcta; (ii) conservación de permutación; (iii) subproblemas más pequeños; (iv) recomposición ordenada. Complejidad promedio `O(N log N)` bajo supuestos sobre la calidad de particiones; peor caso `O(N²)` si son muy desbalanceadas. **No afirmar siempre `O(N log N)` sin hipótesis.**

## 11.2.1 · Mergesort

Divide `[0..N)` en dos subsegmentos, ordénalos y combina mediante mezcla (*merge*). El invariante de mezcla mantiene:

- prefijo de salida ordenado;
- prefijo de salida es multiconjunto de los elementos ya consumidos de ambas entradas;
- siguientes candidatos son los menores disponibles de cada mitad.

Elegimos la menor cabeza de las dos mitades. Termina porque en cada paso crece el tamaño del resultado y decrecen los elementos no consumidos. Costo `O(N log N)` en comparaciones y `O(N)` almacenamiento auxiliar para la implementación estándar con buffer.

## 11.2.2 · Heapsort

Un **heap máximo** conserva la propiedad `f.parent≥f.child` para los índices de un árbol binario implícito. El máximo queda en la raíz; intercambiarlo con la última posición de la región no ordenada amplía el sufijo final ordenado. Luego se restaura el heap en el prefijo restante.

Invariante externo: prefijo `heap`, sufijo ordenado y todos los elementos del sufijo son mayores o iguales a los del prefijo, además de `Perm`.

Construcción de heap `O(N)`; extracción `N` veces con reparación `O(log N)`, total `O(N log N)`, memoria auxiliar `O(1)` para una variante in situ.

## Tabla de contraste

| Algoritmo | Principio de derivación | Peor caso | Memoria típica adicional |
|---|---|---:|---:|
| Inserción | Prefijo ordenado + inserción | `O(N²)` | `O(1)` |
| Selección | Prefijo mínimo definitivo | `O(N²)` | `O(1)` |
| Burbuja | Barridos e intercambios adyacentes | `O(N²)` | `O(1)` |
| Quicksort | Partición por pivote | `O(N²)` | Pila `O(N)` peor caso |
| Mergesort | División y mezcla | `O(N log N)` | `O(N)` |
| Heapsort | Invariante de heap | `O(N log N)` | `O(1)` |

## Ejercicios

1. Demuestra que `Perm` es preservado por cada swap.
2. Deriva el invariante externo de selección; justifica el mínimo del sufijo.
3. Da un contraejemplo que satisfaga `Ord` pero viole `Perm`.
4. Demuestra la poscondición de mezcla para dos secuencias ordenadas.
5. Explica por qué un pivote fijo puede producir costo cuadrático.
6. Formaliza el invariante de heapsort cuando quedan `k` posiciones sin ordenar.
7. Compara por qué los tres ordenamientos avanzados no poseen necesariamente el mismo uso de memoria.

**Criterio de logro:** toda demostración de ordenamiento debe incluir **corrección del orden + conservación de elementos**; un análisis `Big-O` sin restricciones no es suficiente.

## 8. Laboratorio de demostración: mezcla de dos arreglos ordenados

Entradas constantes `A:[0..M)`, `B:[0..N)`, ambos no decrecientes. Salida `C:[0..M+N)`. Especificación:

$$Ord(C)\land Perm(C,A\Vert B),$$

siendo `A∥B` la concatenación de las dos entradas.

Introducimos contadores `i,j,k` tales que `k=i+j`. Invariante:

$$\begin{aligned}
I\equiv&\ 0\le i\le M\land0\le j\le N\land k=i+j\\
&\land Ord(C.[0..k))\\
&\land Perm(C.[0..k),A.[0..i)\Vert B.[0..j))\\
&\land \text{todo valor en C.[0..k) es menor o igual que las cabezas disponibles.}
\end{aligned}$$

Si hay elementos de ambas entradas, comparar `A.i` y `B.j` determina cuál puede ampliarse como menor de los dos. Al copiar `A.i` cuando `A.i≤B.j`, la propiedad de orden de `A` y la comparación garantizan que el nuevo elemento no supera a los candidatos siguientes; es simétrico para `B.j<A.i`. Si una entrada se agota, se copian los restantes de la otra.

La medida `t=M+N-k` disminuye exactamente uno por cada elemento escrito. Al salir `k=M+N`, la propiedad de permutación sobre todos los prefijos se transforma en `Perm(C,A∥B)` y el orden ya fue preservado.

**Cómo se deriva la eficiencia:** cada paso elige una de dos cabezas y avanza un contador; son exactamente `M+N` escrituras y como máximo `M+N-1` comparaciones entre cabezas. Esta es la base del `merge` usado en mergesort.

## 9. Obligaciones de partición en quicksort

Para pivote `v` y frontera `m`, una postcondición de partición válida puede expresar:

$$\begin{aligned}
&0\le m\le N\\
&\land(\forall i:0\le i<m:f.i\le v)\\
&\land(\forall j:m\le j<N:f.j\ge v)\\
&\land Perm(f,f_{in}).
\end{aligned}$$

La clasificación por pivote **no** implica que cada región esté ordenada; precisamente, esas son las obligaciones de los subproblemas recursivos. También debemos evitar recursiones de mismo tamaño en arreglos de muchos valores iguales. Una derivación robusta especifica límites de subproblemas que disminuyen estrictamente y, de ser necesario, distingue las tres categorías `<v`, `=v`, `>v`.

## 10. Heap, arreglo e índices

Para un heap máximo almacenado en `f.[0..n)`, los hijos de `i` pueden estar en `2i+1` y `2i+2` cuando pertenecen al rango. Definimos:

$$Heap(f,n)\equiv(\forall i:1\le i<n:f.((i-1)\operatorname{div}2)\ge f.i).$$

La restauración local de heap debe conservar el multiconjunto y reducir el tamaño del problema de reparación moviendo el elemento que viola el orden hacia abajo. Cuando un nodo no tiene hijo mayor que sí mismo, `Heap` vuelve a cumplirse. Una medida útil en esa reparación es la altura restante del nodo en el árbol finito; cada avance disminuye la altura posible hasta una hoja.

### Práctica ampliada

1. Formula `Heap(f,n)` y deriva un paso de intercambio del padre con el hijo mayor, probando que ninguna rama reduce el valor máximo de la raíz en la extracción siguiente.
2. Demuestra por qué separar valores iguales en la región central de un quicksort de tres vías evita volver a procesarlos recursivamente.
3. Compara variantes de mergesort con y sin buffer y señala sus obligaciones de estabilidad (preservar orden relativo de claves iguales).
