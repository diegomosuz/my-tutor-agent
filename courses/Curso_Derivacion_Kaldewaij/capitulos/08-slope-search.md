# 08 · Slope Search: búsqueda por pendientes en dos dimensiones

**Correspondencia:** capítulo 8 (*Slope Search*), 8.1 principio básico, 8.1.1 suma de dos cuadrados, 8.1.2 distancia mínima, 8.2 segmentos largos y cortos, 8.2.0–8.2.2. **Carga:** 7 h.

## Competencias a lograr

1. Identificar un espacio de búsqueda bidimensional con monotonía que permita descartar filas o columnas completas.
2. Derivar un recorrido por fronteras utilizando invariantes de **región no descartada** y una función acotada.
3. Adaptar la estrategia a ecuaciones, distancia y segmentos, explicitando dónde la monotonía es necesaria.

**Evidencias:** especificación de un problema matricial, derivación de las dos reglas de descarte, complejidad y un contraejemplo sin monotonía.

## 8.0 · Idea geométrica

En lugar de buscar entre todos los pares de índices `(i,j)`, aprovechamos una relación que aumenta al incrementar una coordenada y disminuye al reducir otra. Esto permite un recorrido en forma de **escalera** a lo largo de una frontera de candidatos.

Esta geometría explica el nombre *slope search*. No es simplemente «dos punteros»; lo esencial es la **prueba formal de que la región descartada carece de soluciones**.

## 8.1 · Derivación del principio básico

Sean `a:[0..M)→ℤ` y `b:[0..N)→ℤ` secuencias no decrecientes; se busca un par `i,j` con:

$$a.i+b.j=T.$$

**Precondición:** `M,N≥0`, orden no decreciente, operaciones aritméticas definidas.

**Postcondición:** `found ≡ (∃i,j:0≤i<M∧0≤j<N:a.i+b.j=T)`.

Empezamos en `i=0`, `j=N-1`. Cuando todavía no se encontró el valor, la región no descartada es:

$$C(i,j)\equiv (\exists p,q:i\le p<M\land0\le q\le j:a.p+b.q=T).$$

Usamos el invariante lógico:

$$I\equiv
(found\Rightarrow C(0,N-1))\land
(\neg found\Rightarrow(C(i,j)\equiv C(0,N-1))),$$

interpretado de modo que, mientras `found=false`, todos los candidatos posibles permanecen en el rectángulo actual.

**Primera transformación:** si `a.i+b.j<T`, entonces para todo `q≤j`, `b.q≤b.j` y:

$$a.i+b.q\le a.i+b.j<T.$$

En consecuencia, **toda la fila `i` carece de soluciones** y puede hacerse `i:=i+1`.

**Segunda transformación:** si `a.i+b.j>T`, entonces para todo `p≥i`, `a.p≥a.i`, luego:

$$a.p+b.j\ge a.i+b.j>T.$$

La columna `j` carece de soluciones y puede hacerse `j:=j-1`.

**Caso igual:** hemos hallado testigo `i,j`, por lo que `found:=true` establece la postcondición.

```text
found,i,j := false,0,N-1;
do i<M ∧ j≥0 ∧ ¬found →
   if a.i+b.j<T → i:=i+1
   [] a.i+b.j>T → j:=j-1
   [] a.i+b.j=T → found:=true
   fi
od
```

**Terminación:** cuando no hay igualdad, `t=(M-i)+(j+1)` disminuye en uno; en igualdad termina en el siguiente chequeo. **Costo:** `O(M+N)`, memoria `O(1)`.

## 8.1.1 · Descomposición como suma de dos cuadrados

Para naturales `x,y` y objetivo natural `T`, buscamos:

$$x^2+y^2=T.$$

La propiedad `x²` creciente para `x≥0` y `y²` creciente para `y≥0` permite aplicar el principio del apartado anterior sobre los valores `a.x=x²`, `b.y=y²`. El rango de exploración puede limitarse a `0≤x,y≤⌊√T⌋`.

**Derivación de cota:** si `x²>T`, no es posible `x²+y²=T` con `y²≥0`. Esta condición justifica limitar el espacio; no se debe inventar una cota por conveniencia sin prueba.

Al implementarlo con enteros de máquina se debe evitar overflow de los cuadrados. Matemáticamente la demostración opera sobre naturales sin cota.

## 8.1.2 · Distancia mínima

Para dos secuencias ordenadas, queremos minimizar `|a.i-b.j|`. La misma intuición de fronteras puede reducir candidatos, pero las reglas exactas de descarte deben **derivarse para el objetivo de mínimo**, no copiarse de la igualdad anterior.

Si `a.i≤b.j`, desplazar la coordenada de `b` a valores aún mayores no puede mejorar el valor absoluto para ese `a.i`; y si `a.i≥b.j`, desplazar `a` a mayores valores tampoco mejora. Una implementación lineal clásica desde los extremos inferiores requiere además mantener un mejor valor `best` y probar que lo descartado no puede mejorarlo. El ejercicio exige identificar la región descartada y verificar esta cota.

## 8.2 · Segmentos largos y cortos

Para segmentos `A.p.q` sobre fronteras `0≤p≤q≤N`, algunas propiedades son **monótonas** al mover extremos: una vez que agregar elementos viola una propiedad hereditaria, puede ser imposible recuperar validez sin mover el otro extremo. En ese caso, los pares `(p,q)` forman una región de candidatos cuya frontera se recorre sin evaluar todos los pares.

**Aplicación orientativa:** máximo segmento con a lo sumo `K` ceros (capítulo 07). La frontera entre segmentos válidos e inválidos avanza monótonamente cuando aumenta `q`. El recorrido por los dos extremos es una instancia de esta idea.

**Tres variantes trabajadas:**

- **Segmento más largo:** intentar ampliar mientras el predicado permanezca verdadero; conservar `r=max(r,q-p)`.
- **Segmento más corto:** cuando una condición de umbral es verdadera, reducir `p` sin perderla y actualizar `r=min(r,q-p)`.
- **Al menos dos ceros (revisitado):** para `A.p.q ≡ (#i:p≤i<q:f.i=0)≥2`, la propiedad es monótona con respecto a la ampliación del segmento. Esa monotonía permite derivar el **segmento más corto** con al menos dos ceros moviendo las fronteras `p,q`; el algoritmo necesita registrar la existencia de un segmento válido y una convención para el caso inexistente.

## Actividades de evaluación

1. Deriva la prueba de eliminación de fila y columna de `a.i+b.j=T` sin utilizar ejemplos numéricos.
2. Establece la medida decreciente de un recorrido de frontera y demuestra su no negatividad.
3. Construye un contraejemplo con `b` no ordenada donde eliminar la fila por suma menor pierde una solución.
4. Determina cota de los cuadrados en la descomposición `x²+y²=T`.
5. Explica por qué para un objetivo de **mínimo** no basta con conservar la existencia de una solución: hay que demostrar una cota de dominancia.
6. Formaliza una propiedad de segmento monotónica y deriva una búsqueda de frontera con `O(N)` desplazamientos.

**Criterio de dominio:** se exige un argumento de eliminación universal (`∀` sobre la región descartada). Decir «parece que no puede estar ahí» no alcanza.

## 8.3 Derivación formal de un segmento mínimo con al menos dos ceros

**Predicado:**

$$A.p.q\equiv (\#i:p\le i<q:f.i=0)\ge2.$$

**Postcondición:** el menor `q-p` entre segmentos válidos no vacíos; si no existe ninguno, definimos resultado `∞` como valor lógico de ausencia.

Es útil fijar el extremo derecho `q` y mantener una frontera `p` que deje el segmento **mínimo válido** para ese `q`. Si `[p,q)` contiene dos ceros, incrementar `p` puede preservar la propiedad mientras se expulsen no ceros. Cuando se expulsa un cero y ya solo queda uno, ese `p+1` deja de ser válido para el `q` actual.

El argumento formal depende de monotonicidad: si `A.p.q` es falso para cierto `p`, también lo es para todo `p'≥p`, porque eliminar elementos no puede **crear** ceros. Esto permite evitar explorar todos los comienzos para cada final.

Un esquema de dos fronteras es:

```text
p,q,c,r := 0,0,0,∞;
do q<N →
   if f.q=0 → c:=c+1 [] f.q≠0 → skip fi;
   q:=q+1;
   do c≥2 →
       r:=min(r,q-p);
       if f.p=0 → c:=c-1 [] f.p≠0 → skip fi;
       p:=p+1
   od
od
```

**Invariante principal:** `0≤p≤q≤N ∧ c=(#i:p≤i<q:f.i=0)`. Los comienzos anteriores descartados ya se examinaron en un momento donde eran válidos y no pueden ofrecer una longitud menor para finales posteriores, pues al crecer `q` su distancia a esos comienzos solo aumentaría. **Terminación:** el índice `q` crece a lo sumo `N` veces y `p` crece a lo sumo `N` veces; cada bucle interior disminuye `q-p`, y el exterior disminuye `N-q`. Complejidad total `O(N)`.

El valor `∞` es una convención **de especificación**; al traducir a Python se puede usar `None` para «sin segmento», pero debe probarse que la traducción respeta la semántica de mínimo inexistente.
