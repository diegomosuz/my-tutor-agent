# Guía de notación formal y convenciones de derivación

## Propósito

Usar una notación consistente con *Programming: The Derivation of Algorithms* y evitar sustituir el razonamiento formal por pseudocódigo ambiguo. El documento adapta tipografía a Markdown/LaTeX sin alterar la semántica matemática. Para la convención exacta de cualquier símbolo en casos dudosos, consultar las páginas correspondientes del libro (sobre todo capítulos 1–3).

## 1. Predicados

| Notación | Significado | Advertencia |
|---|---|---|
| `P ∧ Q` | Conjunción | Ambas propiedades verdaderas |
| `P ∨ Q` | Disyunción | Al menos una verdadera |
| `¬P` | Negación | No es desigualdad numérica |
| `P ⇒ Q` | Implicación | No invertible en general |
| `P ≡ Q` | Equivalencia | Dos implicaciones |
| `[P]` | Predicado válido en todos los estados | No usarlo aquí como indicador numérico |
| `false, true` | Falso y verdadero | Identidades según operador |
| `P(x:=E)` | Sustitución de expresiones | Evaluar sobre estado anterior |
| `def.E` | Evaluable/definido `E` | Especialmente índices, divisiones |

## 2. Especificación y semántica

```text
|[ con A,B : int; {P}
   var x,y : int;
   S
   {Q}
]|
```

- `con`: constante/entrada de especificación, no modificable.
- `var`: variable de programa; participa en el espacio de estados.
- `{P} S {Q}`: toda ejecución desde `P` termina y satisface `Q` (disciplina de corrección total del libro).
- `wp.S.Q`: precondición más débil para que ejecutar `S` establezca `Q` con terminación.

### Reglas elementales

$$wp.skip.Q\equiv Q$$
$$wp.(x:=E).Q\equiv def.E\land Q(x:=E)$$
$$wp.(S;T).Q\equiv wp.S.(wp.T.Q).$$

En el caso de asignación múltiple `x,y:=E,F`, la sustitución es **simultánea**, nunca una secuencia accidental de asignaciones.

## 3. Comandos guardados

**Selección**:

```text
if B₀ → S₀
[] B₁ → S₁
fi
```

**Repetición**:

```text
do B₀ → S₀
[] B₁ → S₁
od
```

Las guardas pueden solaparse. Si ambas son verdaderas, cualquier rama podría elegirse. La prueba debe cubrir **todas** las ramas habilitadas. Para selección, la disyunción de guardas debe ser verdadera en todo estado de ejecución. Para repetición, el ciclo termina cuando **todas** las guardas son falsas.

## 4. Invariante y función acotada

Forma típica de anotación:

```text
{invariant: I; bound: t}
do B → S od
```

Obligaciones: `{P}Init{I}`; `{I∧B}S{I}`; `I∧¬B⇒Q`; `I∧B⇒t≥0`; `{I∧B∧t=C}S{t<C}` para `C` valor previo arbitrario. Verificar también definiciones de expresiones en estados alcanzables.

## 5. Cuantificaciones

Forma general: `(⊕ i : R.i : F.i)` donde `⊕` es un operador asociativo de combinación (con hipótesis adicionales cuando se reorganizan términos). Notación recomendada en texto:

```text
(Σ i : 0≤i<N : f.i)
(Π i : 0≤i<N : f.i)
(max i : 0≤i<N : f.i)
(min i : 0≤i<N : f.i)
(∀ i : 0≤i<N : P.i)
(∃ i : 0≤i<N : P.i)
(# i : 0≤i<N : P.i)
```

En LaTeX de Markdown, puede renderizarse por ejemplo:

$$\left(\sum_{i:0\le i<N}f.i\right),\qquad
\left(\forall i:0\le i<N:P.i\right).$$

Para `∀/∃` la variable `i` queda **ligada**. En una doble cuantificación, definir si ambas variables pertenecen al mismo rango o dependen una de otra.

### Rango vacío y separación

- Suma vacía = `0`; producto vacío = `1`.
- Existencial vacío = `false`; universal vacío = `true`.
- Conteo vacío = `0`.
- Máximo/mínimo vacío exige un dominio extendido o precondición de no vaciedad.
- Para suma: `(Σ i:0≤i<n+1:f.i)=(Σ i:0≤i<n:f.i)+f.n`.
- Para existencia: `(∃i:i=k:P.i)≡P.k`.

## 6. Arreglos y segmentos

- `f : array [0..N) of int` y `f.i` denotan un arreglo de dominio `0≤i<N`.
- `f.[p..q)` denota la restricción al segmento `[p,q)`; contiene `q-p` elementos.
- `swap.i.j` es el intercambio de valores en `i,j`, sin alterar el multiconjunto.
- `perm(f,g)` expresa que el arreglo `f` es una permutación de `g` (contiene las mismas multiplicidades).

## 7. Formato de demostración

En el libro es central anotar **por qué** cada transformación es válida. Se sugiere:

```text
Objetivo
≡ {ley aplicable}
Expresión transformada
⇒ {fortalecimiento justificado}
Obligación más simple
```

`≡` implica relación bidireccional; `⇒` implica una sola dirección y puede introducir una condición **más fuerte**. No sustituirlos como si fueran símbolos estéticos equivalentes.

## 8. Traducción práctica a Python

| Formal | Python | Diferencia a vigilar |
|---|---|---|
| `x,y:=E,F` | `x,y = E,F` | Tuple assignment evalúa RHS antes de asignar |
| `div`/`mod` | `//`, `%` | Precisar dominio de negativos |
| `f.i` | `f[i]` | Índices fuera de rango |
| `max` | `max(...)` | `max([])` no está definido por defecto |
| `if B0 [] B1 fi` | `if/elif` o ramas | Superposición: `elif` impone prioridad |
| `do B→S od` | `while B: S` | Preservación de semántica, terminación |

**Regla de oro:** la traducción no es automáticamente una prueba; genera obligaciones adicionales sobre tipos, overflow, aliasing y bibliotecas.
