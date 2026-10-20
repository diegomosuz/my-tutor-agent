# Soluciones comentadas de problemas seleccionados

**Propósito:** permitir autoevaluación sin copiar respuestas textuales del libro. Son resoluciones originales de las actividades incluidas en este curso.

## Capítulo 01 — Negación cuantificada

Para `P ≡ (∀i:0≤i<N:f.i≠0)`:

$$\neg P\equiv(\exists i:0\le i<N:\neg(f.i\ne0))\equiv(\exists i:0\le i<N:f.i=0).$$

**Justificación:** dualidad de cuantificadores y simplificación de negación numérica.

## Capítulo 02 — Precondición más débil

`wp.(x:=2*x; x:=x-5).(x>0)`:

$$\begin{aligned}
&wp.(x:=2x).(x-5>0)\\
&\equiv2x-5>0\\
&\equiv x>5/2.
\end{aligned}$$

Sobre enteros, equivalente `x≥3`. Ambas sustituciones son hacia atrás.

## Capítulo 03 — Producto incremental

Invariante `0≤n≤N ∧ p=(Πi:0≤i<n:f.i)`. Inicialización `p,n:=1,0`; regla `p':=p*f.n`, `n':=n+1`; medida `N-n`. Si hay ceros, la prueba sigue válida.

## Capítulo 04 — Potencia binaria impar

Si `n=2k+1`, entonces `r*b^n=(r*b)*(b*b)^k`. La asignación `r,b,n:=r*b,b*b,n div 2` preserva la igualdad. Si `n≥1`, `n div 2<n`, por lo tanto la medida desciende.

## Capítulo 05 — MCD por restas vs algoritmo acelerado

Para `x>y>0`, `gcd(x-y,y)=gcd(x,y)` por divisibilidad común en ambas direcciones. Es válido pero no aporta garantía logarítmica; inputs `(x=10^9,y=1)` producen muchos pasos. Esta comparación muestra que corrección y eficiencia son propiedades distintas.

## Capítulo 06 — Salida de búsqueda binaria

Con invariante `0≤l≤h≤N`, todo índice `<l` tiene valor `<a` y todo índice `≥h` valor `≥a`. Al salir `l=h`, cubrimos todos los índices del arreglo con la partición requerida. Por tanto `r=l` es la primera posición con `f.r≥a`, o `N`.

## Capítulo 07 — Sufijo de ceros

`f.n=0` implica que cualquier sufijo de ceros de longitud máxima de `[0..n+1)` extiende el mejor sufijo anterior en una unidad; `f.n≠0` obliga al sufijo más largo a ser vacío. Con esto se derivan `s'=s+1` o `s'=0`.

## Capítulo 08 — Eliminación por suma demasiado pequeña

Si `a.i+b.j<T` y `b` es no decreciente, todo `q≤j` satisface `b.q≤b.j`. Luego `a.i+b.q<T`; ningún elemento de la fila `i` en la región puede ser solución. Esa prueba formal permite incrementar `i`.

## Capítulo 09 — Dos índices distintos

Con arreglo ordenado y `l<r`, si `f.l+f.r<T`, para cualquier `j≤r` con `j>l` se tiene `f.l+f.j≤f.l+f.r<T`, descartando índice izquierdo `l`. Si `f.l+f.r>T`, para todo `i≥l`, `f.i+f.r≥f.l+f.r>T`, descartando índice derecho `r`.

## Capítulo 10 — Variante del ciclo de colores

Para la Bandera Holandesa `t=h-m`. En rama roja `m':=m+1`, `h'=h` y `t'=t-1`. En rama blanca idéntico. En rama azul `h':=h-1`, `m'=m`; también `t'=t-1`. Todas las ramas conservan `0≤t`, mientras `m<h` implica `t>0`.

## Capítulo 11 — Por qué hay que preservar multiplicidades

Dos arreglos `[1,2]` y `[1,1]` satisfacen `Ord`, pero `Perm([1,1],[1,2])` es falso: la multiplicidad de `2` se redujo de `1` a `0`. Una prueba de sorting sin `Perm` está incompleta.

## Capítulo 12 — LCS de `ABC` y `AC`

Tabla `L.i.j` por prefijos (`0..3` × `0..2`):

| `i/j` | 0 | 1 (`A`) | 2 (`AC`) |
|---|---:|---:|---:|
| 0 (`""`) | 0 | 0 | 0 |
| 1 (`A`) | 0 | 1 | 1 |
| 2 (`AB`) | 0 | 1 | 1 |
| 3 (`ABC`) | 0 | 1 | 2 |

Como `C=C`, `L.3.2=L.2.1+1=2`. La solución de longitud 2 es `AC`.
