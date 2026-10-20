# 06 · Búsqueda

**Correspondencia:** capítulo 6 (*Searching*), 6.1 lineal, 6.2 lineal acotada, 6.3 binaria, 6.4 eliminación. **Carga:** 6 h.

## Competencias a lograr

1. Especificar formalmente existencia, primera posición y fronteras de inserción en arreglos.
2. Derivar búsquedas lineales, lineales con cotas y binarias utilizando invariantes que describen la porción descartada.
3. Justificar la eliminación de regiones del espacio de búsqueda sin perder soluciones válidas.

**Evidencias:** tres algoritmos anotados; prueba de cobertura para sus guardas; complejidad sustentada por una medida concreta.

## 6.1 · Búsqueda lineal

Sea `f:[0..N)→ℤ`, `N≥0`, constante `a`. Queremos el índice de la **primera** aparición, o `N` si no está:

$$0\le r\le N\land (\forall i:0\le i<r:f.i\ne a)\land (r<N\Rightarrow f.r=a).$$

El invariante naturalmente surge de reemplazar `r` por `n`:

$$I\equiv0\le n\le N\land(\forall i:0\le i<n:f.i\ne a).$$

Mientras `n<N∧f.n≠a`, podemos extender el prefijo examinado. La salida ocurre si `n=N` o `f.n=a`:

```text
n:=0;
do n<N ∧ f.n≠a → n:=n+1 od;
r:=n
```

**Corrección:** la guarda preserva que todos los elementos anteriores a `n+1` son distintos de `a`. **Terminación:** `t=N-n`. **Costo peor caso:** `O(N)`.

**Definición:** la guarda `n<N∧f.n≠a` utiliza cortocircuito en una traducción práctica. Formalmente, si todas las expresiones de las guardas deben estar definidas para todos los estados relevantes, se recomienda separar las guardas o exigir una semántica explícita de evaluación de la conjunción.

## 6.2 · Búsqueda lineal acotada (*bounded linear search*)

La búsqueda anterior tiene una frontera `N` que se controla cada vez. Si sabemos por precondición que **existe** una posición con `a`, el invariante puede eliminar el caso de agotamiento, porque el candidato permanece en el rango no examinado.

Precondición reforzada:

$$N\ge1\land(\exists i:0\le i<N:f.i=a).$$

La misma actualización `n:=n+1` es segura bajo la prueba de que en cada estado con `f.n≠a` aún existe un índice posterior donde aparece `a`. La cota de recorrido se obtiene de la existencia y el prefijo descartado; esta es una **derivación con hipótesis más fuerte**, no una optimización universal.

## 6.3 · Búsqueda binaria

Para una función `f` no decreciente y un valor objetivo `a`, buscamos el primer índice `r` donde `f.r≥a`, o `N` si ninguno existe.

Postcondición:

$$\begin{aligned}
0\le r\le N\ \land
&(\forall i:0\le i<r:f.i<a)\\
\land\ &(\forall i:r\le i<N:f.i\ge a).
\end{aligned}$$

**Invariante de fronteras:**

$$I\equiv0\le l\le h\le N\land
(\forall i:0\le i<l:f.i<a)\land
(\forall i:h\le i<N:f.i\ge a).$$

El segmento `[l,h)` todavía no está clasificado. Inicialización `l,h:=0,N` establece rangos descartados vacíos. Para `l<h`, elegimos `m=(l+h) div 2`:

- Si `f.m<a`, por orden `f.i<a` para todo `i≤m`; hacemos `l:=m+1`.
- Si `f.m≥a`, por orden `f.i≥a` para todo `i≥m`; hacemos `h:=m`.

```text
l,h := 0,N;
do l<h →
   m := l+(h-l) div 2;
   if f.m<a → l:=m+1
   [] f.m≥a → h:=m
   fi
od;
r:=l
```

**Por qué la mitad:** cada paso reduce aproximadamente a la mitad la longitud `h-l`, medida entera no negativa. **Costo:** `O(log(N+1))`; memoria `O(1)`. El índice de inserción está definido también para `N=0`.

## 6.4 · Búsqueda por eliminación

La idea general es hallar propiedades que permitan **descartar un subconjunto de candidatos completo**. Esta técnica no requiere siempre un arreglo ordenado: puede explotar monotonía, límites de suma, relaciones de dominancia u otras propiedades demostradas.

Formalizamos candidatos `C`, subconjunto descartado `D` y predicado de solución `Sol(c)`. La eliminación es correcta si:

$$\forall c\in D:\neg Sol(c)$$

(o si se demuestra que existe una solución equivalente en `C\D`, cuando solo buscamos una solución óptima). Nunca eliminar por intuición de que un candidato «parece improbable».

## 6.5 · Ejercicios

1. Deriva la búsqueda de **última** aparición en un arreglo, con convención `-1` si no existe.
2. Demuestra la postcondición de la búsqueda binaria al terminar `l=h`.
3. Muestra qué falla si la precondición de orden se omite.
4. Deriva una búsqueda binaria para el primer `f.i>a`.
5. Identifica una medida que decrece en cada rama de la búsqueda binaria.
6. Da un ejemplo de búsqueda por eliminación sobre pares de candidatos y justifica la región descartada.

**Criterio de evaluación:** las regiones descartadas deben estar descritas por predicados cuantificados, no por frases vagas como «ya revisamos la mitad».
