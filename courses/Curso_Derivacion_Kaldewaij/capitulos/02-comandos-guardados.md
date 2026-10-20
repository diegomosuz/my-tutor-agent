# 02 · Lenguaje de comandos guardados

**Correspondencia:** capítulo 2 (*The Guarded Command Language*), secciones 2.0–2.7. **Carga:** 8 h.

## Competencias a lograr

1. Derivar asignaciones, concatenaciones, selecciones y repeticiones desde triples `{P} S {Q}` y transformadores `wp`.
2. Probar **corrección total** de ciclos estableciendo invariante, cobertura de guardas, función acotada y decrecimiento estricto.
3. Especificar arreglos, bloques locales y constantes, distinguiendo sus efectos sobre el estado.

**Evidencias:** dos programas anotados completos (con y sin ciclo) y pruebas formales de todas sus obligaciones. **Criterio:** no aceptar un ciclo solo por preservación del invariante; demostrar también terminación y conclusión.

## 1. Semántica de especificación

El triple `{P} S {Q}` significa: **toda ejecución** de `S` que comienza en un estado que satisface `P` termina en un estado que satisface `Q`. En una selección, la elección de rama puede ser no determinista; ninguna prueba puede depender de cuál guarda verdadera sea elegida.

El transformador `wp.S.Q` es el predicado más débil sobre el estado inicial que garantiza `Q` al terminar `S`.

$$\{P\}\ S\ \{Q\}\quad\Longleftrightarrow\quad [P\Rightarrow wp.S.Q].$$

## 2. `skip`, asignación y concatenación

- `wp.skip.Q ≡ Q`.
- `wp.(x:=E).Q ≡ def.E ∧ Q(x:=E)`; cuando `E` siempre está definida, basta la sustitución.
- `wp.(S;T).Q ≡ wp.S.(wp.T.Q)`.

**Ejemplo:** derivar `x:=x+3; y:=2*x` que termine con `y≥10`, con enteros sin desbordamiento.

$$\begin{aligned}
wp.(x:=x+3;y:=2x).(y\ge10)
&\equiv wp.(x:=x+3).(2x\ge10)\\
&\equiv 2(x+3)\ge10\\
&\equiv x\ge2.
\end{aligned}$$

La derivación es **hacia atrás**: primero calculamos qué debe garantizar la última instrucción.

## 3. Selección guardada

```text
if B₀ → S₀
[] B₁ → S₁
fi
```

Debe cumplirse `B₀ ∨ B₁` al ejecutar la selección. Cada rama debe preservar la postcondición:

$$P\Rightarrow(B_0\lor B_1),\qquad
\{P\land B_0\}S_0\{Q\},\quad\{P\land B_1\}S_1\{Q\}.$$

**Importante:** cuando ambas guardas son verdaderas, cualquiera puede ejecutarse; no asumir una prioridad implícita como `if/elif` de Python.

**Ejemplo:** obtener el valor absoluto:

```text
if x ≥ 0 → r := x
[] x ≤ 0 → r := -x
fi
```

En `x=0` ambas ramas son válidas y devuelven cero. La condición de cobertura es una tautología del orden total de los enteros.

## 4. Repetición guardada e Invariance Theorem

```text
do B₀ → S₀
[] B₁ → S₁
od
```

Buscamos `I` tal que:

1. Inicialización: `{P} S_init {I}`.
2. Preservación: `{I∧Bᵢ} Sᵢ {I}` para cada rama.
3. Salida: `I∧¬B₀∧¬B₁ ⇒ Q`.
4. Terminación: existe una función entera `t` con `I∧(B₀∨B₁) ⇒ t≥0` y cada rama habilitada hace `t'<t`.
5. Definición: todas las expresiones y guardas se evalúan en los estados permitidos.

La función acotada puede aumentar en alguna acción ajena al ciclo, pero **cada rama del ciclo que puede ejecutarse debe disminuirla** mientras la guarda está habilitada.

## 5. Ejemplo derivado: división por sustracción

**Precondición:** `A≥0 ∧ B>0`, con enteros. **Postcondición:** `A=B*q+r ∧ 0≤r<B`.

Elegimos el invariante:

$$I\equiv A=Bq+r\land r\ge0.$$

**Por qué:** la ecuación final se conserva mientras desplazamos unidades `B` del resto al cociente. Inicialización `q,r:=0,A` establece `A=B·0+A`.

La salida requiere `r<B`; con el invariante `r≥0`, basta continuar mientras `r≥B`:

```text
q, r := 0, A;
do r ≥ B → q, r := q+1, r-B od
```

**Preservación algebraica:**

$$B(q+1)+(r-B)=Bq+r=A.$$

**No negatividad:** bajo `r≥B` y `B>0`, `r-B≥0`.

**Terminación:** función acotada `t=r`: es no negativa y pasa a `r-B<r`. Al salir: `r<B`, con lo que se obtiene la postcondición completa. Costo `O(A/B+1)`; la derivación es correcta aunque todavía no sea la más eficiente para entradas grandes.

## 6. Constantes, bloques locales y arreglos

`con A,B:int;` fija entradas; `var q,r:int;` declara estado mutable. Las constantes no pueden ser objetivos de asignación. Los bloques `|[var t:int; S]|` introducen variables locales cuyo estado no forma parte de la interfaz exterior.

El arreglo `f:array [0..N) of int` es una función de índices válidos a enteros. Su notación formal es `f.i`. Una asignación puntual `f.i:=E` modifica la función en ese índice y deja los demás intactos; en la derivación de su `wp` hay que considerar acceso definido `0≤i<N`.

## 7. Programa anotado y lectura de obligaciones

```text
|[ con A,B:int; {A≥0 ∧ B>0}
   var q,r:int;
   q,r := 0,A;
   {invariant: A=B*q+r ∧ r≥0; bound: r}
   do r≥B → q,r := q+1,r-B od
   {A=B*q+r ∧ 0≤r<B}
]|
```

Cada anotación tiene una función: **no es un comentario narrativo**, sino una afirmación precisa que debe derivarse de las instrucciones.

## 8. Ejercicios de competencia

1. Calcula `wp.(x:=x*2; x:=x-5).(x>0)`.
2. Deriva una selección para `r=A min B` y prueba ambas ramas.
3. Da un invariante y una función acotada para `do n>0→s,n:=s+n,n-1 od`.
4. Comprueba por qué `r:=A-B` antes de probar `A≥B` no preserva la condición `r≥0`.
5. Cambia el ejemplo de división para `B<0` y explica qué definiciones dejan de ser válidas.
6. Formaliza el efecto de intercambiar `f.i` y `f.j` cuando `i=j`.

**Criterio de dominio:** cada solución distingue propiedades del programa y supuestos del dominio (`div`/`mod`, límites de índices, ausencia de desbordamiento).

## 9. Reglas de prueba ampliadas

### 9.1 Consecuencia y monotonía

Si `{P}S{Q}`, `P₀⇒P` y `Q⇒Q₀`, entonces `{P₀}S{Q₀}`. Es decir: se puede **fortalecer la precondición** o **debilitar la postcondición**. El recíproco no es válido automáticamente; si `P₀` incluye estados que `P` no permitía, el programa podría fallar allí.

### 9.2 `wp` de una selección de dos ramas

Para guardas cuyas expresiones están definidas:

$$\begin{aligned}
wp.(\mathbf{if}\ B_0\to S_0\ []\ B_1\to S_1\ \mathbf{fi}).Q
\equiv {}&(B_0\lor B_1)\\
&\land(B_0\Rightarrow wp.S_0.Q)\\
&\land(B_1\Rightarrow wp.S_1.Q).
\end{aligned}$$

El primer factor impide abortar por ausencia de guarda verdadera; los otros dos exigen que **cualquiera** de las ramas habilitadas termine en `Q`. Si las guardas se solapan, las dos obligaciones aplican simultáneamente en ese estado. Así el programa de comandos guardados no hereda la prioridad de ningún lenguaje anfitrión.

### 9.3 Derivar una selección, no simplemente escribirla

Se desea que `r` sea la distancia entre dos naturales `x,y`, es decir:

$$Q\equiv r=|x-y|.$$

Separando casos según el orden:

$$Q\equiv(x\ge y\land r=x-y)\lor(x\le y\land r=y-x).$$

De ello surgen las guardas y asignaciones:

```text
if x≥y → r:=x-y
[] x≤y → r:=y-x
fi
```

Los casos cubren todo par de enteros, y la postcondición queda establecida por sustitución. El resultado se derivó de una **equivalencia** y de dos reglas de asignación; no de probar ejemplos.

### 9.4 Locales y cuantificación universal

En un bloque con variable local `z`, su valor anterior no debe condicionar el resultado visible. El cálculo de `wp` para introducir estado local recoge esta idea mediante una cuantificación universal de posibles valores iniciales de `z`, bajo las restricciones de su tipo. Este requisito impide atribuir al bloque una propiedad que solo vale por casualidad para cierto contenido previo de memoria.

### 9.5 ¿Qué significa probar un programa completo?

Una especificación de un procedimiento puede descomponerse en triples intermedios `{P}S{R}` y `{R}T{Q}`. La concatenación es válida porque `R` explica el estado de unión. Esto prepara la futura derivación de componentes: una API o módulo puede usarse con garantías solo si su `Q` satisface el `P` requerido por el siguiente paso.

**Desafío adicional:** deriva el programa para `r=max(x,y,z)` usando composiciones de selecciones. Señala el predicado intermedio obtenido después del primer máximo y demuestra el segundo sin repetir los tres casos desde cero.
