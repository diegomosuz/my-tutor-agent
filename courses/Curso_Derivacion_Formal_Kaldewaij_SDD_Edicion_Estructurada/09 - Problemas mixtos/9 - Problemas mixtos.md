# 9 — Problemas mixtos

> **Capítulo 9: Problemas mixtos.** Competencias globales del capítulo:
> - Elegir y combinar técnicas de capítulos previos.
> - Proponer pruebas y medidas de costo.

## Competencias de esta sección

- **Conocimiento:** definir con precisión los términos y expresiones de «problemas mixtos».
- **Desempeño:** aplicar el cálculo de predicados y las transformaciones justificadas en un problema concreto.
- **Evidencia:** entregar una especificación o derivación anotada, con hipótesis explícitas y límites de validez.

> **Referencia:** Kaldewaij, cap. 9, sección 9, página impresa 148. [Ver página original](../recursos/libro-original-escaneado.pdf#page=162).

## Desarrollo



### 1. Procedimiento de análisis previo

Ante un enunciado: (a) identificar el estado de entrada, (b) definir la respuesta como predicado o cuantificación, (c) revisar rango vacío, repetición y empates, (d) reconocer monotonía y posibles fronteras, (e) elegir un invariante que pueda inicializarse, (f) derivar cambios de estado, (g) demostrar terminación, (h) comparar costos.

| Forma de especificación | Primera técnica a explorar | Evidencia que decide |
|---|---|---|
| `(Σi:0≤i<N:F.i)` | Constante → variable | Separación incremental de término |
| `(max p,q:...:q-p)` | Segmentos / slope search | Monotonía del predicado de segmento |
| `(∃i:P.i)` | Búsqueda | Regiones que pueden descartarse |
| Función recursiva con identidad | Invariante de cola | Descomposición asociativa |
| Transformación mutable de arreglo | Particiones y swaps | Preservación de permutación |

### 2. Problema A: longitud máxima de positivos consecutivos

Sea `f:[0..N)→ℤ`; positivo significa `f.i>0`.

$$Q:\quad r=(\max p,q:0\le p\le q\le N\land(\forall i:p\le i<q:f.i>0):q-p).$$

**Hipótesis inicial:** `r` puede actualizarse mirando solo `f.n`. **Falla:** para saber la nueva mejor longitud necesitamos el sufijo vigente. **Fortalecimiento:** sumar `s`, tamaño del sufijo positivo del prefijo procesado:

$$I\equiv 0\le n\le N\land s=\max\{n-p:0\le p\le n\land\forall i\in[p,n):f.i>0\}\land r=Q(n).$$

**Transiciones:** `f.n>0 ⇒ s':=s+1`; de otro modo `s':=0`; `r':=max(r,s')`; `n':=n+1`.

```text
n,s,r := 0,0,0;
do n≠N →
   if f.n>0 → s,r,n := s+1,max(r,s+1),n+1
   [] f.n≤0 → s,n := 0,n+1
   fi
od
```

**Terminación:** `N-n`; **complejidad:** `O(N)`/`O(1)`. El algoritmo se parece a otro del capítulo 07, pero aquí el objetivo evaluativo es **justificar por qué se eligió ese fortalecimiento**.

### 3. Problema B: existe un par con una suma objetivo

Enunciado: dado un arreglo ordenado `f` y `T`, decidir si existen dos índices **distintos** `i<j` tales que `f.i+f.j=T`.

$$found\equiv (\exists i,j:0\le i<j<N:f.i+f.j=T).$$

Como `f` es no decreciente, la búsqueda bidimensional puede restringirse al triángulo `i<j`. Inicializamos `l,r:=0,N-1`; si `f.l+f.r<T`, descartamos la fila `l` hasta `r` por monotonía; si mayor, descartamos columna `r`; si igual, existe testigo. El tamaño `r-l` disminuye estrictamente.

```text
found,l,r := false,0,N-1;
do l<r ∧ ¬found →
   if f.l+f.r<T → l:=l+1
   [] f.l+f.r>T → r:=r-1
   [] f.l+f.r=T → found:=true
   fi
od
```

**Crucial:** que los índices deban ser distintos forma parte del invariante de región, no es un detalle de implementación. Complejidad `O(N)`; no se requirió enumerar `O(N²)` pares.

### 4. Problema C: suma máxima de un segmento

Para segmentos no vacíos de un arreglo `f` de enteros con `N≥1`:

$$r=(\max p,q:0\le p<q\le N:(\Sigma i:p\le i<q:f.i)).$$

Introducimos `s`: suma máxima entre los segmentos no vacíos que **terminan** en el prefijo actual. Para actualizar al añadir `f.n`, un segmento máximo terminado en `n+1` o bien empieza en `n`, o bien prolonga el mejor segmento que terminaba en `n`:

$$s'=\max(f.n,s+f.n).$$

El mejor global pasa a `max(r,s')`. Inicialización con el primer elemento (`s,r,n:=f.0,f.0,1`) evita introducir `−∞` en el dominio de enteros. Esta representación deriva un algoritmo lineal; su justificación es **separación de casos de intervalos**, no apelación al nombre de un algoritmo conocido.

### 5. Actividades abiertas (sin algoritmo prescrito)

1. Encontrar el primer índice que satisface un predicado monótono.
2. Contar valores repetidos consecutivos en un arreglo.
3. Encontrar el segmento más largo de suma `≤T` para entradas no negativas, explicitando el caso `T<0`.
4. Hallar el producto de un arreglo con `O(1)` memoria; analizar si permite desbordamiento.
5. Evaluar dos estrategias para una especificación con `max` sobre parejas de índices: eliminación y enumeración.

### Portafolio requerido

Cada problema se entrega como: **especificación → alternativas → estrategia elegida → derivación anotada → pruebas → complejidad → contraejemplo de una alternativa incorrecta**. Se penaliza empezar desde código conocido sin explicar las transformaciones.

## Comprobación de competencia

1. Formula la propiedad central como un predicado explícito, indicando el dominio y las condiciones de definibilidad.
2. Justifica una transformación algebraica relevante sin usar solo ejemplos concretos como prueba.
3. Construye un caso límite que pueda refutar una hipótesis insuficiente.
4. Declara qué parte está demostrada y cuál constituye solamente evidencia experimental.


---

**Navegación:** [Índice del curso](../README.md)
