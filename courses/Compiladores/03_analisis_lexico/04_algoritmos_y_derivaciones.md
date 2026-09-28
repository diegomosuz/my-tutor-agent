# Algoritmos y derivaciones — análisis léxico

## 1. Thompson: ER → AFN

Reglas esenciales:

- símbolo `a`: dos estados con transición `a`;
- concatenación: conectar final del primer fragmento al inicio del segundo por ε;
- unión: nuevo inicio con ε hacia ambos fragmentos y finales hacia un nuevo final;
- estrella: nuevo inicio/final con caminos para cero repeticiones y loop por ε.

La construcción es lineal en el tamaño de la ER.

## 2. Subset construction: AFN → AFD

```text
D0 = ε-closure({startNFA})
worklist = [D0]
while worklist:
    S = pop()
    for clase de carácter a:
        U = ε-closure(move(S,a))
        if U no existe como estado DFA:
            crear U; push(U)
        Dtran[S,a] = U
```

**Invariante:** después de consumir un prefijo `w`, el estado DFA representa exactamente el conjunto de estados NFA alcanzables tras consumir `w` incluyendo ε-transiciones.

## 3. Maximal munch con último estado aceptante

```text
start = current
last_accept = None
while transition_exists(state, peek()):
    state = transition(state, advance())
    if accepting(state):
        last_accept = (state, current)
if last_accept is None: lexical_error()
rewind/logically restore current to last_accept.position
emit token chosen by acceptance priority
```

En un scanner sobre string puede evitarse rebobinar físicamente manteniendo índices. El punto crucial es que **alcanzar un final no implica emitir aún**.

## 4. Clases de equivalencia de caracteres

Si todos los estados tratan dos caracteres igual, pertenecen a la misma clase. En vez de 256/Unicode columnas por estado, la tabla usa clases como `letter`, `digit`, `_`, whitespace, operadores. Esto reduce memoria y puede mejorar cache behavior.
