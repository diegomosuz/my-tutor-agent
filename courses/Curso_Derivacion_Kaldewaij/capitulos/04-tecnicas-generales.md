# 04 · Técnicas generales de programación

**Correspondencia:** capítulo 4 (*General Programming Techniques*), secciones 4.0–4.5. **Carga:** 8 h.

## Competencias a lograr

1. Obtener invariantes a partir de **conjuntos de una postcondición**, sin adivinar un ciclo.
2. Aplicar **reemplazo de constantes por variables** y **fortalecimiento de invariantes** para derivar asignaciones realizables.
3. Construir **invariantes de cola** que representen el trabajo pendiente y fundamentar una mejora de complejidad.

**Evidencias:** tres derivaciones completas, cada una usando una técnica distinta; defensa de la necesidad de cada variable auxiliar; anotaciones de terminación y complejidad.

## 4.0 · Panorama del método

La derivación es constructiva y no mecánica. Una misma especificación puede sugerir múltiples invariantes, y elegir uno conveniente es una decisión de diseño. El capítulo enseña estrategias sistemáticas para encontrarlos. La notación de prueba mantiene la relación entre cada transformación y la siguiente.

## 4.1 · Tomar conjunciones como invariantes

Si la postcondición es `Q ≡ R∧T`, una estrategia es conservar `R` como invariante y construir la guarda para que, al terminar, también valga `T`. No siempre `R` por sí solo es inicializable; en tal caso se le agrega información estable.

**Ejemplo:** dos naturales `A,B`, calcular `gcd(A,B)` por restas.

**Especificación:** `A>0∧B>0`, `r=gcd(A,B)`.

Usamos `x,y` variables y el invariante:

$$I\equiv x>0\land y>0\land gcd(x,y)=gcd(A,B).$$

Inicializamos `x,y:=A,B`. Como `gcd(x,y)=gcd(A,B)` por sustitución, `I` se cumple. Si `x>y`, la identidad `gcd(x-y,y)=gcd(x,y)` permite disminuir `x`; similar para `y>x`. Al salir, `x=y` y de `I` deducimos `x=gcd(A,B)`.

```text
x,y := A,B;
do x>y → x:=x-y
[] y>x → y:=y-x
od;
r:=x
```

**Preservación:** cada identidad del máximo común divisor justifica una rama. **Acotación:** `t=x+y`; cada iteración reduce `t` por un positivo. **Costo:** dependiente de los valores (puede ser costoso). Esta derivación destaca corrección, no eficiencia óptima.

## 4.2 · Sustituir constantes por variables

Una postcondición calculada sobre todo `[0..N)` puede generalizarse a un prefijo `[0..n)`:

$$Q\equiv s=(\Sigma i:0\le i<N:f.i)$$
$$I\equiv 0\le n\le N\land s=(\Sigma i:0\le i<n:f.i).$$

La regla de separación del último término produce:

$$s'=s+f.n.$$

```text
n,s := 0,0;
do n≠N → s,n := s+f.n,n+1 od
```

Por qué es preferible este invariante: puede **inicializarse con un rango vacío**, **extenderse localmente** y **convertirse en la postcondición** sustituyendo `n=N`.

## 4.3 · Fortalecer invariantes

La generalización inicial no siempre basta para calcular el siguiente estado eficientemente. Introducimos un segundo predicado que conserva información auxiliar necesaria.

**Problema original:** calcular el máximo prefijo acumulado, permitiendo prefijo vacío:

$$M=(\max k:0\le k\le N:(\Sigma i:0\le i<k:f.i)).$$

Primer intento: `m=(max k:0≤k≤n:Σi:0≤i<k:f.i)`. Para actualizar `m` necesitamos el prefijo en `n+1`. Entonces **fortalecemos** el invariante con:

$$s=(\Sigma i:0\le i<n:f.i).$$

El invariante completo es:

$$I\equiv 0\le n\le N\land s=\Sigma_{i<n}f.i\land m=\max_{0\le k\le n}\Sigma_{i<k}f.i.$$

Al extender `n`, el nuevo prefijo vale `s+f.n`; el nuevo máximo es `max(m,s+f.n)`. Derivación:

```text
n,s,m := 0,0,0;
do n≠N →
   s,m,n := s+f.n, max(m,s+f.n), n+1
od
```

**Razonamiento crucial:** la simultaneidad evita confundir el `s` anterior y el nuevo. `N-n` demuestra terminación. Complejidad `O(N)` y almacenamiento adicional `O(1)`.

## 4.4 · Invariantes de cola (*tail invariants*)

En lugar de conservar únicamente una respuesta sobre lo procesado, un invariante de cola representa la descomposición **trabajo hecho / trabajo pendiente**. En potencias es natural:

$$I\equiv r\,b^n=A^N\land n\ge0,$$

para constantes `A` y `N≥0`, variables `r,b,n` (sobre enteros matemáticos). Inicialización `r,b,n:=1,A,N` satisface `I`.

Si `n` es par y positivo, podemos reemplazar `b` por `b²` y `n` por `n div 2` sin alterar el producto:

$$r(b^2)^{n/2}=rb^n.$$

Si `n` es impar, extraemos un factor `b`:

$$r b^n=(rb)(b^2)^{(n-1)/2}.$$

Derivamos:

```text
r,b,n := 1,A,N;
do n≠0 →
   if n mod 2 = 0 → b,n := b*b,n div 2
   [] n mod 2 = 1 → r,b,n := r*b,b*b,n div 2
   fi
od
```

Al terminar `n=0`, `r=A^N`. La medida `t=n` disminuye estrictamente cuando `n>0`, incluso cuando `n=1`. **Costo:** `O(log(N+1))` multiplicaciones; esta mejora no consiste en microoptimizar el ciclo lineal, sino en reformular el estado y las transformaciones admisibles.

## 4.5 · Comparación de estrategias

| Estrategia | Pregunta que debemos hacernos | Señal de necesidad |
|---|---|---|
| Conjunción como invariante | ¿Qué parte de `Q` puedo conservar mientras trabajo? | La salida aporta el resto de `Q` |
| Constante → variable | ¿Puedo sustituir `N` por una frontera móvil? | Problema definido sobre un prefijo creciente |
| Fortalecimiento | ¿Qué dato parcial falta para actualizar en tiempo constante? | La operación incremental reevalúa trabajo |
| Invariante de cola | ¿Cómo representar algebraicamente el trabajo restante? | Existe descomposición que reduce exponencialmente los pasos |

## 6. Actividades de dominio

1. Obtén el invariante de la suma de cuadrados de un arreglo y su actualización.
2. Deriva el algoritmo de potencia de forma incremental y compáralo con el invariante de cola.
3. Demuestra cada rama de la potencia binaria mediante `wp`.
4. Para el máximo prefijo acumulado, explica por qué conservar solo `m` no permite obtener `O(N)` sin reevaluar prefijos.
5. Propón una función acotada para el algoritmo de MCD por restas y demuestra su reducción en ambas ramas.
6. Analiza el efecto de usar enteros de ancho fijo sobre las obligaciones de la potencia binaria.

### Problema evaluable

Entregar `especificación → invariante inicial → necesidad de fortalecer → guardas → asignaciones → prueba de término → costo`. Se considera incompleta una respuesta que contiene un programa correcto pero no explica **de dónde salen** las variables auxiliares.

## 7. Invariantes que se derivan hacia atrás y hacia adelante

### 7.1 Ir hacia atrás desde la postcondición

Si la postcondición es una conjunción `Q₁∧Q₂`, una pregunta productiva es: ¿podría conservar `Q₁` en un estado parcial y elegir la negación de `Q₂` como condición de progreso? Esta estrategia funciona si se puede inicializar `Q₁` y demostrar que la condición restante aparece al concluir el ciclo. En el ejemplo del MCD, la identidad de `gcd` se conserva y la igualdad de variables se alcanza cuando ambas guardas se vuelven falsas.

### 7.2 Ir hacia adelante desde una expresión incremental

Para una suma sobre prefijos, empezar con el cuantificador de la postcondición puede producir un invariante inmediatamente. Al separar el último término se deriva una actualización. Si esa actualización necesita un dato no conservado, la derivación indica **qué fortalecer**. Este paso no es un parche: es una consecuencia de exigir una actualización local verificable.

### 7.3 ¿Cómo evaluar invariantes candidatos?

Para cada candidato `I`, responder:

1. ¿Hay asignación inicial `Init` que establezca `I` con el dominio real de entrada?
2. ¿Qué implica `I∧¬B`? ¿Alcanza para `Q`?
3. ¿Puede derivarse `S` con `wp` de preservación de `I`?
4. ¿Hay función acotada que demuestre terminación?
5. ¿Qué costo se desprende de `S` y de la cantidad de iteraciones?

Descartar un invariante porque «es difícil» no basta; identificar exactamente qué obligación falla conduce a la siguiente reformulación.

## 8. Taller extendido: mínimo prefijo y máxima caída

Sean valores `f.0...f.(N-1)` y se desea máximo descenso `f.p-f.q` con `0≤p≤q<N`. Al extender `q`, el mejor candidato terminado en `q` es `max_{0≤p≤q}(f.p-f.q)`; para calcularlo localmente necesitamos el máximo anterior de `f.p`. Fortalecemos el invariante con:

$$M=(\max p:0\le p\le q:f.p).$$

La nueva caída candidata es `M-f.q`; el resultado global se actualiza con `r':=max(r,M-f.q)`. Después, `M':=max(M,f.q)`. **El orden de actualización o simultaneidad importa:** el `M` usado debe incluir los comienzos permitidos; como `p=q` aporta caída `0`, no altera el resultado si `M` se incluye antes, pero la prueba debe explicarlo.

**Práctica:** formaliza el resultado de manera que permita caída cero; deriva estados iniciales para `N≥1`; establece el invariante del resultado global y calcula `t=N-q`. Extiende el problema a máximo ascenso y compara las variables auxiliares.
