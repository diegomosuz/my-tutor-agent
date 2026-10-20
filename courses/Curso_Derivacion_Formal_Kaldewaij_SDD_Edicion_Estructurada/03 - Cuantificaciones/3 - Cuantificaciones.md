# 3 — Cuantificaciones

> **Capítulo 3: Cuantificaciones.** Competencias globales del capítulo:
> - Manipular algebraicamente cuantificaciones de distintos operadores.
> - Derivar actualizaciones por separación de rangos.

## Competencias de esta sección

- **Conocimiento:** definir con precisión los términos y expresiones de «cuantificaciones».
- **Desempeño:** aplicar el cálculo de predicados y las transformaciones justificadas en un problema concreto.
- **Evidencia:** entregar una especificación o derivación anotada, con hipótesis explícitas y límites de validez.

> **Referencia:** Kaldewaij, cap. 3, sección 3, página impresa 44. [Ver página original](../recursos/libro-original-escaneado.pdf#page=58).

## Desarrollo



### 1. Un solo marco para múltiples operadores

La notación `(⊕ i:R.i:F.i)` designa la combinación con el operador `⊕` de los valores `F.i` para todos los `i` del rango `R.i`. El operador ha de admitir el comportamiento algebraico adecuado (asociatividad y, cuando se permuta el orden, conmutatividad).

| Operación | Escritura | Identidad del rango vacío |
|---|---|---|
| Suma | `(Σ i:R.i:f.i)` | `0` |
| Producto | `(Π i:R.i:f.i)` | `1` |
| Máximo | `(max i:R.i:f.i)` | `-∞` cuando la extensión es definida |
| Mínimo | `(min i:R.i:f.i)` | `+∞` cuando la extensión es definida |
| Existencia | `(∃i:R.i:P.i)` | `false` |
| Universalidad | `(∀i:R.i:P.i)` | `true` |
| Conteo | `(#i:R.i:P.i)` | `0` |

**Precaución:** `max` y `min` con identidades extendidas requieren una convención explícita de dominio; en aplicaciones con enteros finitos, es común evitar máximo sobre conjunto vacío o ampliar el dominio con infinitos formales.

### 2. Reglas de cálculo

**Rango vacío:** `(⊕i:false:F.i)=e`.

**Un punto:** `(⊕i:i=k:F.i)=F.k`, para la operación definida.

**Separación de un término final:**

$$(\oplus i:0\le i<n+1:F.i)=(\oplus i:0\le i<n:F.i)\ \oplus\ F.n.$$

**División de rangos disjuntos:** si `R` y `S` no se solapan,

$$(\oplus i:R.i\lor S.i:F.i)=(\oplus i:R.i:F.i)\ \oplus\ (\oplus i:S.i:F.i).$$

Para `∃` y `∀`, por idempotencia, hay casos donde el solapamiento no cambia el resultado; **no extender esa propiedad a sumas**.

**Intercambio de cuantificadores:** para operaciones y rangos adecuados, la doble suma puede permutarse; la demostración requiere controlar las dependencias entre rangos.

### 3. Derivación completa: contar valores positivos

**Especificación:** para `f:[0..N)→ℤ`, `N≥0`, calcular

$$r=(\#i:0\le i<N:f.i>0).$$

**Generalización:** reemplazamos la constante `N` por una frontera variable `n`:

$$I\equiv 0\le n\le N\land r=(\#i:0\le i<n:f.i>0).$$

Inicialización `n,r:=0,0` establece `I` porque el rango es vacío.

**Derivación del paso:**

$$\begin{aligned}
(\#i:0\le i<n+1:f.i>0)
&=(\#i:0\le i<n:f.i>0)+[f.n>0]\\
&=r+[f.n>0],
\end{aligned}$$

con `[P]` como indicador numérico (`1` si `P`, `0` en otro caso; **no** confundir aquí con la notación del libro `[P]` para validez global: usamos la abreviatura `χ(P)` en el programa).

```text
n,r := 0,0;
do n≠N →
    if f.n>0 → r,n:=r+1,n+1
    [] f.n≤0 → n:=n+1
    fi
od
```

**Por qué las guardas:** descomponen exactamente las dos posibilidades del nuevo predicado. **Terminación:** `N-n`. **Costo:** `O(N)`; memoria auxiliar `O(1)`.

### 4. Otras especificaciones útiles

- Arreglo creciente: `(∀i:0≤i<N-1:f.i<f.(i+1))`.
- Todos diferentes: `(∀i,j:0≤i<j<N:f.i≠f.j)`.
- Máximo `m`: `m=(max i:0≤i<N:f.i)` con `N≥1`.
- El máximo aparece exactamente una vez: `(#i:0≤i<N:f.i=m)=1`.
- Longitud de segmento contiguo: `(max p,q:0≤p≤q≤N∧A.p.q:q-p)`.
- Suma de segmentos: `(Σ p,q:0≤p≤q≤N:Σ i:p≤i<q:f.i)`.

La precisión del rango es tan importante como la fórmula evaluada: `p≤q` permite el segmento vacío, `p<q` lo prohíbe.

### 5. Ejercicios y criterios

1. Deriva una actualización incremental de `(Πi:0≤i<n:f.i)`.
2. Prueba que `(∀i:0≤i<N:P.i) ≡ ¬(∃i:0≤i<N:¬P.i)`.
3. Expresa formalmente que todos los elementos son iguales.
4. Expresa formalmente que un valor `a` aparece exactamente `k` veces.
5. Deriva cómo actualizar la suma de un intervalo al mover su límite izquierdo.
6. Justifica por qué una suma de dos rangos que se superponen cuenta dos veces la intersección.

**Criterio de logro:** en cada ejercicio, indicar operador, identidad, rango, hipótesis de la transformación y consecuencia para un estado parcial.

### 6. Álgebra de rangos: de la fórmula al ciclo

### 6.1 Suma y producto como instancias de un mismo esquema

Sea `⊕` asociativo y con identidad `e`, de modo que al sumar un nuevo término se cumple:

$$(\oplus i:0\le i<n+1:F.i)=(\oplus i:0\le i<n:F.i)\oplus F.n.$$

La derivación general queda:

```text
n,r := 0,e;
do n≠N → r,n := r ⊕ F.n,n+1 od
```

El invariante `r=(⊕i:0≤i<n:F.i)` se preserva por la ley anterior. **Esquema** no significa que todas las operaciones sean intercambiables: algunas carecen de identidad representable (p. ej. `max` sobre enteros sin `−∞`) o requieren un primer elemento válido (`N≥1`).

### 6.2 Derivar máximo sin infinitos extendidos

Para `N≥1` y enteros matemáticos:

$$Q\equiv m=(\max i:0\le i<N:f.i).$$

Elegimos:

$$I\equiv1\le n\le N\land m=(\max i:0\le i<n:f.i).$$

Inicialización `n,m:=1,f.0` establece el invariante por la regla de un punto. La extensión del rango determina `m'=max(m,f.n)`:

```text
n,m := 1,f.0;
do n≠N → m,n := max(m,f.n),n+1 od
```

**Por qué cambia la inicialización:** el máximo del rango vacío no está definido sobre enteros sin extensión; el primer elemento evita recurrir a un valor especial. **Costo:** `N-1` comparaciones.

### 6.3 Conteos como sumas de indicadores

El conteo `( #i:R.i:P.i )` equivale conceptualmente a `Σi:R.i:χ(P.i)`, con `χ(P)=1` cuando `P` es verdadero y `0` en otro caso. Esta correspondencia permite derivar recuentos mediante acumulaciones, pero no debe mezclarse `χ` con el operador `[P]` de **validez global** del capítulo 1.

### 6.4 Cuantificaciones de dos variables

La definición de «todos los elementos distintos» necesita restringir `i<j`:

$$(\forall i,j:0\le i<j<N:f.i\ne f.j).$$

Si usamos simplemente `i≠j`, la propiedad sigue siendo equivalente para desigualdad simétrica, pero duplica parejas y dificulta una derivación eficiente. Si accidentalmente permitimos `i=j`, la expresión `f.i≠f.i` es siempre falsa cuando `N>0`: habríamos cambiado radicalmente la especificación.

### 6.5 Actividad de alto nivel

Formaliza la varianza poblacional como suma de cuadrados de diferencias a una media, declarando el dominio `N≥1`. Después deriva un algoritmo de dos pasadas y discute qué propiedades adicionales harían falta para una derivación numéricamente estable de una sola pasada usando aritmética de punto flotante. **No atribuir estabilidad al mero hecho de tener una identidad algebraica en reales.**

## Comprobación de competencia

1. Formula la propiedad central como un predicado explícito, indicando el dominio y las condiciones de definibilidad.
2. Justifica una transformación algebraica relevante sin usar solo ejemplos concretos como prueba.
3. Construye un caso límite que pueda refutar una hipótesis insuficiente.
4. Declara qué parte está demostrada y cuál constituye solamente evidencia experimental.


---

**Navegación:** [Índice del curso](../README.md)
