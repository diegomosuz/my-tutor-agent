# 01 · Cálculo de predicados

**Correspondencia:** capítulo 1 (*Predicate Calculus*) del libro. **Carga sugerida:** 5 h.

## Competencias a lograr

1. Simplificar y transformar predicados mediante leyes de equivalencia, distribución, absorción, De Morgan e implicación, sin alterar su significado.
2. Distinguir implicación (`⇒`) de equivalencia (`≡`) y reconocer fortalecimiento/debilitamiento de predicados.
3. Realizar sustituciones simultáneas sin capturas de variables, y utilizar cuantificadores existenciales y universales con rangos explícitos.

**Evidencias:** hoja de diez equivalencias desarrolladas paso a paso, revisión cruzada de una demostración ajena. **Dominio esperado:** cada signo de relación se justifica; no confundir `P ⇒ Q` con `P ≡ Q`.

## 1. Predicados y estados

Sea `Σ` un conjunto de estados. Un predicado `P` es una función `Σ → {false,true}`. Operadores: `∧` conjunción, `∨` disyunción, `¬` negación, `⇒` implicación, `≡` equivalencia. La afirmación `[P]` significa que `P` vale en **todos** los estados pertinentes. No confundir esta validez con el valor de `P` en un solo estado.

Tabla conceptual: `P⇒Q` es falso **solo** si `P` es verdadero y `Q` falso. `P≡Q` es verdadero cuando ambos tienen el mismo valor.

## 2. Leyes principales

| Ley | Identidad |
|---|---|
| Idempotencia | `P ∧ P ≡ P`, `P ∨ P ≡ P` |
| Conmutatividad | `P ∧ Q ≡ Q ∧ P` |
| Asociatividad | `(P ∧ Q) ∧ R ≡ P ∧ (Q ∧ R)` |
| Distributividad | `P ∧ (Q ∨ R) ≡ (P ∧ Q) ∨ (P ∧ R)` |
| Absorción | `P ∧ (P ∨ Q) ≡ P` |
| De Morgan | `¬(P ∧ Q) ≡ ¬P ∨ ¬Q` |
| Complemento | `P ∧ ¬P ≡ false`, `P ∨ ¬P ≡ true` |
| Implicación | `P ⇒ Q ≡ ¬P ∨ Q` |
| Equivalencia | `P ≡ Q ≡ (P⇒Q) ∧ (Q⇒P)` |

Una cadena válida distingue con cuidado cada transformación:

$$\begin{aligned}
P\land(\neg P\lor Q)
&\equiv (P\land\neg P)\lor(P\land Q) &&\{\text{distributividad}\}\\
&\equiv false\lor(P\land Q) &&\{\text{complemento}\}\\
&\equiv P\land Q &&\{\text{identidad}\}.
\end{aligned}$$

**Decisión metodológica:** no saltamos directamente al resultado porque cada igualdad constituye una justificación auditable.

## 3. Orden lógico: más fuerte y más débil

`P` es **más fuerte** que `Q` si `[P ⇒ Q]`. Ejemplo: `x≥3` es más fuerte que `x≥0`; no se puede invertir la implicación. `false` es el predicado más fuerte; `true`, el más débil. Un predicado más fuerte describe menos estados.

Esto permitirá, en el siguiente capítulo, **fortalecer precondiciones** o **debilitar postcondiciones** sin perder corrección.

## 4. Sustitución

`P(x:=E)` significa reemplazar las ocurrencias libres de `x` en `P` por `E`. Ejemplo:

$$ (x^2\geq x)(x:=y+1)\equiv (y+1)^2\geq y+1.$$

Para sustitución **simultánea** `P(x,y:=E,F)`, ambas expresiones se evalúan sobre el estado anterior; no realizar primero `x:=E` y luego sustituir `y` usando el nuevo `x`.

## 5. Cuantificadores: rango y cuerpo

Se usa la forma `(∃i : R.i : P.i)` o `(∀i : R.i : P.i)`. `i` está **ligada**; otras variables pueden quedar libres. Un rango falso produce `(∃i:false:P.i) ≡ false` y `(∀i:false:P.i) ≡ true`.

**Regla de un punto:**

$$(\exists i:i=k:P.i)\equiv P.k.$$

**Negación dual:**

$$\neg(\exists i:R.i:P.i)\equiv(\forall i:R.i:\neg P.i).$$

**Regla de separación de rango:**

$$(\exists i:R.i\lor S.i:P.i)\equiv
(\exists i:R.i:P.i)\lor(\exists i:S.i:P.i).$$

La sustitución en fórmulas cuantificadas requiere renombrar variables ligadas cuando hay riesgo de captura.

## 6. Derivación ejemplar: cuantificadores negativos

Queremos reescribir «ningún elemento es negativo» en forma universal:

$$\begin{aligned}
\neg(\exists i:0\le i<N:f.i<0)
&\equiv (\forall i:0\le i<N:\neg(f.i<0))
&&\{\text{dualidad}\}\\
&\equiv (\forall i:0\le i<N:f.i\ge0)
&&\{\text{orden total}\}.
\end{aligned}$$

La equivalencia depende de que los valores pertenecen a un dominio de orden total usual. El razonamiento no depende de que el arreglo tenga o no datos.

## 7. Taller de transformación

1. Deriva `P ∨ (¬P ∧ Q) ≡ P ∨ Q` justificando cada paso.
2. Determina cuáles predicados son más fuertes: `x=4`, `x≥4`, `x≥0`.
3. Aplica sustitución simultánea a `(x<y)(x,y:=y+1,x+2)`.
4. Niega correctamente `(∀i:0≤i<N:f.i≠0)`.
5. Da un contraejemplo para la inferencia inválida `(∃i:R:P.i) ∧ (∃i:R:Q.i) ⇒ (∃i:R:P.i∧Q.i)`.

### Solución orientativa del ejercicio 5

Con rango `i∈{0,1}`, `P.i ≡ (i=0)` y `Q.i ≡ (i=1)`, las dos existencias son verdaderas, pero no existe un mismo `i` que satisfaga ambas. **Aprendizaje:** la manipulación de cuantificaciones exige controlar el alcance del testigo.

## Autoevaluación

- [ ] Todas las equivalencias tienen ley explícita.
- [ ] No se usa `⇒` donde solo corresponde `⇐`.
- [ ] Las sustituciones son libres de captura.
- [ ] Los rangos vacíos se interpretan con la identidad correcta.

## 8. Demostraciones algebraicas avanzadas

### 8.1 Equivalencia como ecuación en un cálculo

Una derivación puede verse como una sucesión de fórmulas que describen **el mismo** conjunto de estados. Por eso escribir

```text
P
≡ {ley L₁}
R
≡ {ley L₂}
Q
```

es más fuerte que escribir `P ⇒ Q`: garantiza una transformación reversible. Conviene pensar en tres preguntas antes de cada línea: ¿qué operador se modificó?, ¿qué variables quedaron libres?, ¿la ley necesita un rango no vacío o un orden concreto?

**Ejemplo original:** demostrar `P⇒(Q∧R) ≡ (P⇒Q)∧(P⇒R)`.

$$\begin{aligned}
P\Rightarrow(Q\land R)
&\equiv \neg P\lor(Q\land R) &&\{\text{implicación}\}\\
&\equiv (\neg P\lor Q)\land(\neg P\lor R) &&\{\text{distributividad}\}\\
&\equiv (P\Rightarrow Q)\land(P\Rightarrow R) &&\{\text{implicación}\}.
\end{aligned}$$

No se ha enumerado ninguna combinación de valores: la validez se deduce de las leyes. El mismo tipo de cálculo se aplicará a guardas y postcondiciones.

### 8.2 Negación, existencia y contraejemplos

El predicado `(∀i:0≤i<N:P.i)` no se refuta señalando un resultado «raro»; se refuta proporcionando **un índice** dentro del rango que satisface `¬P.i`. La dualidad:

$$(\forall i:R.i:P.i)\equiv\neg(\exists i:R.i:\neg P.i)$$

explica formalmente por qué los contraejemplos son útiles en testing. En cambio, muchos intentos fallidos de hallar contraejemplo **no** demuestran universalidad.

### 8.3 Reglas de trading y manipulación de rangos

En cuantificaciones universales, es posible trasladar parte de la condición de rango hacia el cuerpo:

$$(\forall i:R.i\land S.i:P.i)\equiv(\forall i:R.i:S.i\Rightarrow P.i).$$

Para existenciales:

$$(\exists i:R.i\land S.i:P.i)\equiv(\exists i:R.i:S.i\land P.i).$$

Estas dos reglas son distintas: implicación en universal, conjunción en existencial. Probar a sustituir ambas por implicación es un error típico porque en el caso existencial podría haber testigos que no satisfacen `S`.

### 8.4 Práctica de demostración

Demostrar con cadenas justificadas:

1. `(P∨Q)⇒R ≡ (P⇒R)∧(Q⇒R)`.
2. `(∀i:R.i∧S.i:P.i) ≡ (∀i:R.i:S.i⇒P.i)`.
3. `(∃i:R.i: P.i∨Q.i) ≡ (∃i:R.i:P.i)∨(∃i:R.i:Q.i)`.
4. `¬(∀i:R.i:P.i) ≡ (∃i:R.i:¬P.i)`.

**Autocorrección:** dar un argumento por ley y otro por contraejemplo de qué fallaría al retirar una precondición de rango.
