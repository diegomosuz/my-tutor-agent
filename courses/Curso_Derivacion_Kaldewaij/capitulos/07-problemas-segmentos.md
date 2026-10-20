# 07 · Problemas de segmentos

**Correspondencia:** capítulo 7 (*Segment Problems*): segmentos más largos (todos ceros, mínimos por izquierda, a lo sumo diez ceros, todos distintos) y segmentos más cortos. **Carga:** 6 h.

## Competencias a lograr

1. Formalizar segmentos mediante pares de fronteras `(p,q)` y rangos semiabiertos `[p,q)`.
2. Derivar algoritmos que actualizan propiedades de segmentos sin reexaminar todos los elementos.
3. Reconocer cuándo el criterio de aceptación de un segmento permite mantener información incremental y cuándo necesita fortalecerse con variables o arreglos auxiliares.

**Evidencias:** dos problemas de longitud máxima y uno de longitud mínima, con especificación cuantificada y análisis de complejidad.

## 7.0 · La representación por fronteras

Sea `f:[0..N)→ℤ`, `N≥0`. Un segmento se representa por índices `0≤p≤q≤N`, y contiene los elementos `f.p,...,f.(q-1)`; su longitud es `q-p`. El vacío (`p=q`) puede o no estar permitido según la especificación. Para una propiedad `A.p.q`:

$$r=(\max p,q:0\le p\le q\le N\land A.p.q:q-p).$$

Un problema de segmento corto usa `min` en vez de `max`; hay que determinar qué ocurre cuando **no existe** segmento válido. Atribuir longitud `0` indiscriminadamente a un mínimo inexistente es un error formal.

## 7.1.0 · Segmentos más largos de ceros

Sea `Z.p.q ≡ (∀i:p≤i<q:f.i=0)`. Deseamos:

$$r=(\max p,q:0\le p\le q\le N\land Z.p.q:q-p).$$

Al llegar a un índice `n`, mantenemos `s` como longitud del **sufijo de ceros** de `f.[0..n)`. El invariante fortalece el máximo prefijo con la información que se necesita para extenderlo:

$$\begin{aligned}
I\equiv&\ 0\le n\le N\\
&\land s=(\max p:0\le p\le n\land Z.p.n:n-p)\\
&\land r=(\max p,q:0\le p\le q\le n\land Z.p.q:q-p).
\end{aligned}$$

Si `f.n=0`, el mejor sufijo pasa de `s` a `s+1`; de otro modo pasa a `0`. El mejor segmento total pasa a `max(r,s_nuevo)`.

```text
n,s,r := 0,0,0;
do n≠N →
   if f.n=0 → s,r,n := s+1,max(r,s+1),n+1
   [] f.n≠0 → s,n := 0,n+1
   fi
od
```

**Por qué fortalecemos:** si conservamos solo `r`, no sabemos la longitud de la racha que termina en `n`; calcularla desde cero podría ser cuadrático. **Costo:** `O(N)` y `O(1)`.

## 7.1.1 · Segmentos mínimos por izquierda

La forma de una propiedad depende de sus extremos. Se llama «mínimo por izquierda» al requisito de que el valor del extremo izquierdo sea menor o igual que todos los del segmento; el segmento vacío satisface el predicado por vacuidad. Especificación posible:

$$A.p.q\equiv (\forall i:p\le i<q:f.p\le f.i).$$

**Técnica derivativa:** para un final `q` fijo, representar el mejor comienzo `p` bajo una propiedad monotónica; cuando extendemos `q`, estudiar en qué condiciones el viejo comienzo continúa siendo candidato. Puede ser necesario conservar una frontera o una estructura auxiliar si el nuevo valor invalida múltiples comienzos.

**Actividad guiada:** deriva la regla para añadir `f.q`: el segmento `A.p.(q+1)` vale exactamente cuando `A.p.q ∧ f.p≤f.q`, para `p≤q<N`; también se debe analizar correctamente el caso de segmento vacío `p=q` y comprobar que ninguna evaluación queda fuera del dominio. Identifica la información faltante y calcula la complejidad antes de elegir el programa.

## 7.1.2 · A lo sumo diez ceros

Define el conteo:

$$C.p.q=(\#i:p\le i<q:f.i=0).$$

Ahora `A.p.q ≡ C.p.q≤K`, para `K=10` en el tema del libro, o un `K≥0` generalizado en esta actividad. La propiedad es **hereditaria por subsegmentos**: eliminar elementos nunca aumenta el conteo de ceros.

Esto sugiere una ventana `[l,h)` y la cuenta `c=C.l.h`. Al extender `h`, el conteo aumenta a lo sumo uno; si `c>K`, movemos `l` hasta restaurar el predicado.

```text
l,h,c,r := 0,0,0,0;
do h<N →
   if f.h=0 → c:=c+1
   [] f.h≠0 → skip
   fi;
   h:=h+1;
   do c>K →
      if f.l=0 → c:=c-1
      [] f.l≠0 → skip
      fi;
      l:=l+1
   od;
   r:=max(r,h-l)
od
```

**Invariantes esenciales:** `0≤l≤h≤N`, `c=C.l.h`, `0≤c≤K` al concluir el ciclo interior; `l` es el **menor** comienzo que permite esa validez para el `h` actual. La última propiedad debe demostrarse: se conservan los extremos anteriormente descartados porque, para un final más lejano, su conteo de ceros no puede disminuir.

**Complejidad amortizada:** cada extremo avanza a lo sumo `N` veces, por lo que el total es `O(N)`, pese a que hay dos ciclos anidados. Esto no se deduce de contar las anidaciones, sino del progreso monótono de las fronteras.

## 7.1.3 · Todos los elementos diferentes

La propiedad es:

$$A.p.q\equiv (\forall i,j:p\le i<j<q:f.i\ne f.j).$$

Para una ventana válida `[l,h)`, agregar `f.h` puede introducir repeticiones. Podemos eliminar elementos por el extremo izquierdo hasta expulsar la aparición anterior. Dos enfoques:

- Sin estructura auxiliar, buscar linealmente la coincidencia: el costo puede elevarse a `O(N²)`.
- Con información auxiliar sobre la **última posición** de cada valor, avanzar `l` directamente cuando hay repetición; el costo depende de la representación del dominio y del mapa de posiciones.

La última alternativa es una anticipación de la lógica del capítulo 12: agregamos estado porque lo exige el mantenimiento eficiente del invariante, no porque «un diccionario es más rápido» por costumbre.

## 7.2 · Segmentos más cortos

Para hallar el menor segmento con propiedad `A.p.q`, cambia el cuantificador a `min`, fija una convención para «no encontrado» y analiza si la propiedad se conserva cuando se amplía o reduce el segmento.

**Ejemplo original:** segmento más corto con suma al menos `T` cuando todos los `f.i≥0`:

$$r=(\min p,q:0\le p<q\le N\land \Sigma_{p\le i<q}f.i\ge T:q-p).$$

Una ventana con suma `s` puede crecer por el extremo derecho hasta satisfacer el umbral; entonces se reduce por la izquierda conservando la condición tanto como sea posible. Este enfoque **requiere no negatividad**; con negativos puede fallar la monotonía necesaria para descartar candidatos.

## Taller y transferencia

1. Generaliza el algoritmo de ceros a valores que satisfacen un predicado arbitrario `P(f.i)`.
2. Justifica la complejidad lineal del algoritmo de ventana con dos contadores monótonos.
3. Prueba por qué «todos distintos» no puede resumirse solo por una longitud `s`.
4. Redacta especificación y convención de «no encontrado» para el segmento corto con suma umbral.
5. Construye un contraejemplo donde la ventana para suma objetivo deja de ser correcta si hay números negativos.

**Evaluación:** entregar el conjunto de candidatos `p,q`, prueba de descarte, función de progreso y un ejemplo de frontera (`N=0`, `K=0`, todo cero, sin segmentos válidos).

## 8. Nota formal: propiedades cerradas por prefijos y sufijos

Una propiedad `A.p.q` es **cerrada por prefijos** si `A.p.q` implica `A.p.k` para `p≤k≤q`. La propiedad «todos los valores iguales a cero» es cerrada por prefijos y también por sufijos. En cambio, «hay al menos dos ceros» no es cerrada por prefijos: al acortar un segmento podría desaparecer uno de los ceros.

Esa diferencia decide la forma del algoritmo. Para propiedades cerradas por prefijos, al fallar una extensión no debe concluirse automáticamente que toda ampliación posterior fallará: se requiere además una propiedad monotónica adecuada. Para intervalos, las dos fronteras se manejan con argumentos separados.

### 8.1 Invariante específico de segmentos mínimos por izquierda

El predicado del apartado 7.1.1 es **cerrado por prefijos**:

$$A.p.q\Rightarrow (\forall k:p\le k\le q:A.p.k).$$

Por el contrario, puede fallar al prolongar el segmento porque un valor nuevo es menor que `f.p`. Una estrategia mantiene un comienzo `s` candidato para el mayor segmento finalizado en `n` e información negativa de comienzos anteriores:

$$0\le s\le n\land A.s.n\land(\forall p:0\le p<s:\neg A.p.n).$$

Este fortalecimiento no es decoración: cuando una condición adicional invalida el comienzo actual, la prueba de que los comienzos previos siguen descartados evita reevaluar todo el arreglo.

### 8.2 Dos costos distintos para un mismo problema

Un algoritmo que para cada `q` inspecciona todos los `p≤q` efectúa a lo sumo `N(N+1)/2` evaluaciones y su costo es `O(N²)` si cada predicado de segmento se actualiza en tiempo constante. Si además recalcula el predicado inspeccionando cada elemento del intervalo, el trabajo puede llegar a `O(N³)`. Es incorrecto describir ambas variantes simplemente como «fuerza bruta cuadrática».

La derivación eficiente consiste en demostrar qué porción de ese trabajo es redundante y conservar exactamente la información que permita evitarla.
