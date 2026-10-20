# 05 · Derivación de programas eficientes

**Correspondencia:** capítulo 5 (*Deriving Efficient Programs*), 5.1 división entera, 5.2 Fibonacci. **Carga:** 6 h.

## Competencias a lograr

1. Transformar una derivación correcta de alta complejidad en otra de menor costo sin cambiar su postcondición.
2. Derivar algoritmos logarítmicos a partir de descomposiciones algebraicas de magnitudes o estados.
3. Demostrar que cada transformación que introduce eficiencia preserva el invariante y finaliza.

**Evidencias:** comparación de al menos dos derivaciones por problema; tabla de costo y obligaciones matemáticas explícitas.

## 5.1 · División entera: del paso unitario al paso por bloques

Para `A≥0`, `B>0`, debemos encontrar naturales `q,r` tales que:

$$A=Bq+r\land0\le r<B.$$

El algoritmo por restas del capítulo 02 disminuye `r` de `B` en `B`. Es correcto, pero su número de pasos depende de `A/B`. Para acelerar, podemos restar **múltiplos de `B` de tamaño potencia de dos**.

La identidad fundamental es:

$$A=Bq+r\equiv A=B(q+2^k)+(r-B2^k),$$

siempre que la actualización se haga cuando `r≥B·2^k`.

Esto habilita el invariante ya conocido:

$$I\equiv A=Bq+r\land r\ge0.$$

Una derivación práctica por duplicación prepara `d=B·2^k` y `w=2^k` sin superar el resto inicial. Luego recorre las potencias en orden decreciente y, cuando `r≥d`, actualiza `q,r:=q+w,r-d`.

```text
q,r,d,w := 0,A,B,1;
do d ≤ r div 2 → d,w := 2*d,2*w od;
do w>0 →
   if r≥d → q,r := q+w,r-d
   [] r<d → skip
   fi;
   d,w := d div 2,w div 2
od
```

**Hipótesis y detalles:** `B>0` garantiza que `d,w>0` en la preparación y `r div 2` está definido. En la segunda fase, `d=B·w` se preserva hasta `w=0`; la actualización simultánea es esencial. Al procesar cada potencia restante, al salir obtenemos `r<B` (argumento inductivo sobre `d`: si al paso `d` se tenía `r<2d`, tras opcionalmente restar `d` queda `r<d`; el siguiente `d` es la mitad). Las operaciones son matemáticas sin desbordamiento; en una implementación de enteros acotados deben añadirse guardas para duplicación.

**Costo:** `O(log(1+A/B))` pasos de escala, frente a `O(1+A/B)` restas de la primera derivación.

## 5.2 · Fibonacci: elegir una representación algebraica

Definimos `fib.0=0`, `fib.1=1`, `fib.(n+2)=fib.n+fib.(n+1)`. El cálculo lineal puede mantener pares consecutivos:

$$I\equiv (a,b)=(fib.n,fib.(n+1))\land0\le n\le N.$$

La regla recursiva determina la transición `a,b:=b,a+b`, `n:=n+1`. Inicializamos `a,b,n:=0,1,0`. Al terminar `a=fib.N`, en `O(N)` sumas. ¿Cómo reducir iteraciones?

La transformación lineal puede representarse mediante la matriz:

$$F=\begin{pmatrix}0&1\\1&1\end{pmatrix},\qquad
\begin{pmatrix}fib.n\\fib.(n+1)\end{pmatrix}
=F^n\begin{pmatrix}0\\1\end{pmatrix}.$$

Usamos la técnica del capítulo 04 sobre exponentes, pero con multiplicación matricial asociativa. Invariante:

$$I\equiv R\,B^n=F^N\land n\ge0.$$

La potencia binaria de matrices requiere `O(log(N+1))` multiplicaciones de matrices `2×2`; la respuesta es la primera coordenada de `R·(0,1)^T`.

**Observación de complejidad:** el conteo de operaciones aritméticas no refleja por sí solo el costo de multiplicar enteros que crecen con `N`; declaramos explícitamente qué modelo de costo analizamos.

## 5.3 · Criterios para juzgar una mejora

1. **Misma especificación:** la poscondición no cambia.
2. **Invariante explícito:** cada transición conserva el significado del estado.
3. **Disminución demostrada:** existe una medida bien fundada.
4. **Costo medido correctamente:** si se afirma `O(log N)`, identificar la operación elemental y posibles costos de operandos.
5. **Sin aritmética indefinida:** desbordamiento, divisiones por cero o índices inválidos se incorporan al contrato de implementación.

## 5.4 · Ejercicios

1. Demuestra las identidades de potencia que sustentan la rama par y la rama impar.
2. Deriva una función acotada para ambas fases de la división por potencias de dos.
3. Comprueba que la segunda fase nunca aplica dos veces el mismo múltiplo de `B`.
4. Explica por qué `O(log N)` operaciones matriciales no significa necesariamente `O(log N)` bits de trabajo.
5. Deriva `fib.6` usando la representación matricial sin enumerar todos los anteriores.

### Criterio de competencia

La evaluación prioriza una **mejora derivada con prueba**, no simplemente un fragmento de código conocido como «rápido».
