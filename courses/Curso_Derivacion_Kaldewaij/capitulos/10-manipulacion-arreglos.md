# 10 · Manipulación de arreglos

**Correspondencia:** capítulo 10 (*Array Manipulations*): asignaciones, intercambios, Bandera Nacional Holandesa y rotación. **Carga:** 7 h.

## Competencias a lograr

1. Razonar sobre actualizaciones de arreglos como transformaciones de funciones, evitando sustituciones incorrectas cuando los índices dependen del arreglo.
2. Derivar operaciones de intercambio y particionamiento que preservan el multiconjunto de elementos.
3. Mantener invariantes sobre **regiones** al reorganizar un arreglo y demostrar terminación mediante el número de elementos no clasificados.

**Evidencias:** derivación de `swap`, partición tricolor, rotación; prueba de preservación de longitud, multiconjunto y orden de las regiones relevantes.

## 10.1 · Asignaciones a arreglos

Un arreglo `f:[0..N)→ℤ` puede tratarse matemáticamente como una función. La asignación `f.i:=E` modifica el valor de la función **solo** en `i`. Distinguimos el arreglo nuevo `f'`:

$$f'.j=\begin{cases}E & j=i\\f.j&j\ne i.\end{cases}$$

La regla de `wp` debe reemplazar **la función entera**, no únicamente la ocurrencia textual `f.i` en la postcondición. Si la expresión del índice depende de valores mutables, se evalúa en el estado previo.

**Ejemplo de aliasing:** `f.(f.0):=0` no puede analizarse suponiendo que el índice del lado izquierdo es una constante sintáctica; antes de actualizar se debe demostrar `0≤f.0<N`.

## 10.2 · Intercambios (`swap`)

Para índices `i,j` válidos queremos:

$$f'.i=f.j\land f'.j=f.i\land
(\forall k:k\ne i\land k\ne j:f'.k=f.k).$$

La especificación también debe distinguir los valores **anteriores** de `f.i` y `f.j`. Una implementación con variable temporal:

```text
|[ var t:int;
   t:=f.i;
   f.i:=f.j;
   f.j:=t
]|
```

En forma simultánea abstracta `f.i,f.j := f.j,f.i`, los lados derechos usan los valores anteriores. Si `i=j`, el intercambio debe ser identidad; las expresiones coinciden y el estado final no cambia.

**Propiedad conservada:** el multiconjunto de valores del arreglo no se altera. Es fundamental en los capítulos de ordenamiento.

## 10.2.0 · Bandera Nacional Holandesa

Se tiene `f:[0..N)→{R,W,B}` y queremos una permutación con todos los `R` primero, luego `W`, finalmente `B`.

Introducimos fronteras `l,m,h` que particionan el arreglo:

```text
[0,l)      [l,m)       [m,h)         [h,N)
 R ... R    W ... W     sin examinar   B ... B
```

Invariante:

$$\begin{aligned}
I\equiv&\ 0\le l\le m\le h\le N\\
&\land(\forall i:0\le i<l:f.i=R)\\
&\land(\forall i:l\le i<m:f.i=W)\\
&\land(\forall i:h\le i<N:f.i=B)\\
&\land perm(f,f_{in}).
\end{aligned}$$

`perm` significa conservación del multiconjunto inicial; puede especificarse con conteos por valor para `R,W,B`.

Inicializamos `l,m,h:=0,0,N`; los segmentos clasificados están vacíos. La guarda `m<h` indica que queda región sin examinar.

- **Caso `f.m=R`:** el elemento en `m` debe pasar a la región roja; se intercambia con `f.l` y avanzan `l,m`. Si `l<m`, por el invariante `f.l=W`, por lo que el elemento desplazado a `m` pertenece a la región blanca extendida.
- **Caso `f.m=W`:** ya pertenece al segmento blanco; avanza `m`.
- **Caso `f.m=B`:** intercambiamos con `f.(h-1)` y disminuimos `h`. **No avanzar `m`**, porque el valor recibido en `m` todavía no fue examinado.

```text
l,m,h:=0,0,N;
do m<h →
    if f.m=R → swap(f.l,f.m); l,m:=l+1,m+1
    [] f.m=W → m:=m+1
    [] f.m=B → swap(f.m,f.(h-1)); h:=h-1
    fi
od
```

**Terminación:** `t=h-m` decrece exactamente uno en cada rama, manteniendo `t≥0`. **Salida:** `m=h`, así no hay posiciones sin clasificar. **Complejidad:** `O(N)` y `O(1)` memoria auxiliar.

## 10.2.1 · Rotación

Queremos rotar a izquierda `k` posiciones un arreglo de longitud `N>0`, con `0≤k<N`:

$$f'.i=f.((i+k)\bmod N).$$

Una derivación posible se basa en invertir segmentos: `reverse([0,k))`, luego `reverse([k,N))` y finalmente `reverse([0,N))`. La justificación debe hacerse en índices.

Sean `A=f.[0..k)` y `B=f.[k..N)`. Las dos inversiones producen `rev(A)·rev(B)`; la inversión total da `rev(rev(B))·rev(rev(A))=B·A`, que es exactamente la rotación especificada.

**Costo:** `O(N)` intercambios, `O(1)` memoria. Debe probarse que `reverse` conserva multiconjunto y que invierte la indexación de cada segmento.

## Laboratorio y evaluación

1. Deriva la regla de `wp` de `f.i:=E` para una postcondición sobre `f.k`.
2. Refuta la secuencia incorrecta `f.i:=f.j;f.j:=f.i` como implementación de swap.
3. Verifica cada rama de la Bandera Holandesa con el predicado `I`.
4. Explica por qué `m` no aumenta en la rama azul.
5. Deriva `reverse([p,q))` con dos índices y medida `q-p`.
6. Prueba formalmente la rotación para `N=5,k=2`, sin usar ese ejemplo como única demostración.

**Criterio:** una demostración debe preservar tanto la **clasificación** como la **permutación**, no solo mostrar que el arreglo final está ordenado por colores.
