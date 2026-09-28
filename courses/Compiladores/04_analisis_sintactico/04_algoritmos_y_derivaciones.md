# Algoritmos y derivaciones — parsing

## 1. FIRST

Itere hasta estabilidad:

1. `FIRST(terminal)={terminal}`.
2. Para `A -> X1...Xn`, agregue `FIRST(X1)-{ε}`.
3. Si `X1` es nullable, agregue `FIRST(X2)-{ε}`, y así sucesivamente.
4. Si todos son nullable, agregue `ε`.

## 2. FOLLOW

Inicialice `$ ∈ FOLLOW(S)`. Para cada `A -> α B β`:

- agregue `FIRST(β)-{ε}` a `FOLLOW(B)`;
- si `β` es nullable o vacío, agregue `FOLLOW(A)` a `FOLLOW(B)`.

Itere hasta que ningún conjunto cambie.

## 3. Tabla LL(1)

Para `A->α`, coloque la producción en `M[A,a]` para `a∈FIRST(α)-{ε}`. Si `α` es nullable, colóquela también para `b∈FOLLOW(A)`. Dos entradas diferentes en una celda son un conflicto.

## 4. LR(0): closure y goto

```text
closure(I):
  repeat
    for [A -> α · B β] in I:
      for B -> γ:
        add [B -> · γ]
  until no change
```

```text
goto(I,X) = closure({ A -> α X · β | A -> α · X β in I })
```

Partiendo de `closure({S'->·S})`, aplicar `goto` sobre símbolos construye la colección canónica de estados.

## 5. SLR actions

- item `A->α·aβ`: `ACTION[state,a]=shift goto(state,a)`;
- item `A->α·`, `A!=S'`: reduce por `A->α` para `a∈FOLLOW(A)`;
- `S'->S·`: accept sobre `$`.

El contraste con LR(1) es que este último lleva lookahead específico en cada item, evitando reducciones demasiado amplias basadas solo en FOLLOW.
