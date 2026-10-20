# 12 · Arreglos auxiliares

**Correspondencia:** capítulo 12 (*Auxiliary Arrays*): 12.0 a lo sumo `K` ceros; 12.1 mayor cuadrado bajo histograma; 12.2 longitud de una subsecuencia común más larga; 12.3 un problema de segmento mínimo. **Carga:** 8 h.

## Competencias a lograr

1. Identificar una cadena de propiedades necesarias para mantener un invariante y justificar la introducción de un arreglo auxiliar.
2. Derivar información tabulada para problemas de segmentos, histogramas y subsecuencias, con índices y relaciones de recurrencia correctos.
3. Distinguir costo de tiempo frente a costo de espacio y evaluar cuándo un arreglo auxiliar permite una mejora genuina.

**Evidencias:** tabla de dependencias entre invariantes, derivación de recurrencia de LCS, solución de histograma y comparación de memoria.

## 12.0 · A lo sumo `K` ceros: cuando una variable no alcanza

Sea `C.p.q=(#i:p≤i<q:f.i=0)`. La especificación de longitud máxima es:

$$r=(\max p,q:0\le p\le q\le N\land C.p.q\le K:q-p).$$

Una forma útil de actualización por extremo derecho es almacenar para cada tolerancia `j` (de `0` a `K`) el **menor comienzo** del mejor segmento que termina en `n` y contiene a lo sumo `j` ceros:

$$s.j=(\min p:0\le p\le n\land C.p.n\le j:p).$$

Al extender el final a `n+1`:

- si `f.n≠0`, los comienzos válidos no cambian y `s'.j=s.j`;
- si `f.n=0` y `j≥1`, un comienzo satisface la nueva cuota `j` exactamente si antes satisfacía `j-1`: `s'.j=s.(j-1)`; para `j=0`, solo vale el segmento vacío, luego `s'.0=n+1`.

Se obtiene una **actualización simultánea** del arreglo auxiliar. Después de cada extensión:

$$r':=\max(r,(n+1)-s'.K).$$

Inicialización `s.j=0` para todos `j=0..K`, `r,n=0`. El algoritmo usa `O(NK)` operaciones y `O(K)` memoria; para `K` fijo tiene costo lineal. No confundir con una ventana de dos punteros de `O(N)` y `O(1)` memoria: son estrategias diferentes y demuestran cómo una dependencia recursiva de predicados puede conducir naturalmente a un **arreglo de estados**.

**Punto de reflexión:** si la actualización de `s.K` depende de `s.(K-1)`, y esta a su vez de `s.(K-2)`, el cierre de dependencias justifica mantener todas las cuotas `0..K`.

## 12.1 · Mayor cuadrado bajo un histograma

Sea `h:[0..N)→ℕ`, donde `h.i` es la altura de una barra de anchura unitaria. Buscamos el lado entero máximo `s` de un cuadrado inscrito en el histograma:

$$s=(\max p,q:0\le p<q\le N:\min(q-p,\min_{p\le i<q}h.i)).$$

Si un intervalo tiene ancho `w` y altura mínima `H`, el mayor lado de cuadrado que cabe en él es `min(w,H)`. Esta reducción a segmentos es la primera **derivación geométrica** relevante.

**Información auxiliar posible:** para cada barra `i`, fronteras `L.i` y `R.i` de la región contigua máxima cuya altura es al menos `h.i`. Entonces un candidato basado en esa altura tiene lado:

$$c.i=\min(h.i,R.i-L.i).$$

Podemos calcular las fronteras con una estructura monótona de índices: al hallar una barra más baja, se cierra la región de barras más altas. Cada índice se apila y desapila a lo sumo una vez; el costo es `O(N)`.

**Obligaciones:** (i) las fronteras abarcan todas las barras de altura al menos `h.i`; (ii) no se extienden más allá de una barra menor; (iii) todo cuadrado óptimo queda representado por algún candidato. Sin (iii), el algoritmo estaría subjustificado.

## 12.2 · Longitud de una subsecuencia común más larga

Sean secuencias `x.[0..M)` y `y.[0..N)`. Una **subsecuencia** preserva el orden, pero puede omitir posiciones y no requiere contigüidad.

Definimos el arreglo auxiliar `L.i.j` como longitud de la subsecuencia común más larga de los prefijos `x.[0..i)` e `y.[0..j)`.

Condiciones de borde:

$$L.0.j=0,\qquad L.i.0=0.$$

Recurrencia derivada por análisis del último elemento:

$$L.i.j=\begin{cases}
L.(i-1).(j-1)+1,& x.(i-1)=y.(j-1),\\
\max(L.(i-1).j,L.i.(j-1)),&x.(i-1)\ne y.(j-1).
\end{cases}$$

**Por qué la recurrencia:** cuando las cabezas finales coinciden, existe una solución óptima que termina con ese símbolo; cuando difieren, una subsecuencia común óptima debe omitir al menos uno de ambos últimos símbolos. La tabla se recorre en orden de dependencias: cada celda lee filas/columnas previas.

Resultado `L.M.N`; tiempo `O(MN)` y memoria `O(MN)` para tabla completa, reducible a `O(min(M,N))` si solo se necesita la longitud y se mantienen filas adecuadas. Esta reducción de memoria debe justificar que ninguna transición necesita filas más antiguas.

## 12.3 · Problema de segmento más corto

La forma general:

$$r=(\min p,q:0\le p<q\le N\land A.p.q:q-p).$$

La dificultad puede consistir en que el criterio `A.p.q` depende de información de muchos comienzos anteriores, no de un único escalar. Para cada final `q`, podemos representar candidatos mediante un arreglo de **resúmenes de prefijos** y deducir cuáles pueden descartarse por dominancia.

**Ejemplo de análisis:** para sumas `Σ_{p≤i<q}f.i` con posibles negativos, definimos prefijos `S.0=0`, `S.(i+1)=S.i+f.i`. La suma de `[p,q)` es `S.q-S.p`; el problema de longitud mínima con suma al menos `T` se transforma en:

$$\min\{q-p:0\le p<q\le N\land S.q-S.p\ge T\}.$$

La transformación justifica usar información auxiliar de prefijos. La obtención de un algoritmo eficiente exige después demostrar las relaciones de dominancia que permiten descartar candidatos de `p` y escoger una representación apropiada.

## 12.4 · ¿Cuándo está justificado el arreglo auxiliar?

1. Al intentar actualizar un invariante aparece una propiedad auxiliar `R₁`.
2. Actualizar `R₁` exige `R₂`, y así sucesivamente.
3. La familia `R_j` se expresa con índices y recurrencias acotadas.
4. La inicialización satisface todos los casos base.
5. El orden de cálculo respeta las dependencias.
6. La memoria adicional tiene una justificación medible de tiempo/corrección.

## Ejercicios

1. Deriva `s'.0` y `s'.j` del problema de los `K` ceros para ambas condiciones de `f.n`.
2. Prueba que el método de fronteras de histograma considera una barra que limita la altura de un cuadrado óptimo.
3. Computa a mano la tabla LCS para `x=ABC` e `y=AC` y verifica las recurrencias.
4. Construye una versión de LCS de dos filas y especifica el invariante de procesamiento de columnas.
5. En sumas con negativos, explica por qué los prefijos son un resumen correcto pero no bastan por sí solos para justificar un descarte.

**Criterio:** los índices base, las dependencias y la elección de estructura auxiliar deben justificarse con igual rigor que las asignaciones de un programa escalar.

## 6. Derivación detallada de la tabla LCS

Para dos prefijos `X.[0..i)` e `Y.[0..j)`, los casos de borde `i=0` o `j=0` obligan a longitud cero: no puede haber subsecuencia común no vacía si uno de los prefijos es vacío.

Supongamos `i,j>0`. Si `X.(i-1)=Y.(j-1)`, se puede tomar una subsecuencia común óptima de los prefijos anteriores y añadir el símbolo coincidente. La longitud resultante es `L.(i-1).(j-1)+1` y no puede superarse por una subsecuencia que use ese último símbolo; para esta igualdad, puede escogerse un óptimo que lo incluya.

Si los últimos símbolos **no** coinciden, una subsecuencia común no puede usarlos simultáneamente como su último elemento. Por tanto, cualquier solución pertenece a una de estas dos clases: omite el último de `X`, o bien omite el último de `Y`. Sus mejores valores respectivos son `L.(i-1).j` y `L.i.(j-1)`. La relación es:

$$L.i.j=\max(L.(i-1).j,L.i.(j-1)).$$

Al llenar la tabla por filas, para calcular `L.i.j` ya conocemos `L.(i-1).j` (fila anterior), `L.i.(j-1)` (columna anterior en la misma fila) y `L.(i-1).(j-1)` (diagonal anterior). Esto justifica formalmente el orden topológico de evaluación.

### 6.1 Optimización de memoria

Si solo necesitamos `L.M.N`, **ninguna** transición lee una fila anterior a `i-1`. Por tanto, podemos conservar un arreglo `prev.[0..N]` y otro `curr.[0..N]`; al completar la fila, los intercambiamos. La postcondición de cada fila es:

$$curr.j=L.i.j\qquad(0\le j\le N).$$

Antes de empezar la fila siguiente, `prev` pasa a representar ese prefijo. La memoria baja de `O(MN)` a `O(N)`; si intercambiamos los roles de `X,Y` para que la dimensión menor sea columnas, baja a `O(min(M,N))`.

Esto no hace más rápido el cálculo asintótico de tiempo: sigue requiriendo `O(MN)` celdas. **El criterio de optimización está en la dependencia del estado, no en cambiar arbitrariamente una estructura.**

## 7. Taller ampliado del histograma

Considera alturas `h=[3,1,4,4,2]`. Para la barra de altura `4` en índice `2`, la región máxima contigua de altura al menos `4` incluye índices `2,3`, ancho `2`, por lo que un cuadrado de lado `min(4,2)=2` cabe allí. Para la barra de altura `1`, la región comprende las cinco barras, dando lado `min(1,5)=1`.

En una derivación mediante pila monótona de índices, la pila representa barras cuyas **fronteras derechas aún no se conocen**. Si llega una barra más baja, cada barra más alta que se desapila encuentra su primera posición a la derecha con altura menor; el elemento previo de pila determina la frontera izquierda correspondiente. El elemento se apila una vez y se desapila una vez: `O(N)`.

**Obligación de representación:** cada barra retirada conserva la frontera izquierda correcta desde el momento en que fue apilada. Sin esta propiedad, los límites `L.i` y `R.i` podrían ser incorrectos aunque los ejemplos pequeños funcionaran.
