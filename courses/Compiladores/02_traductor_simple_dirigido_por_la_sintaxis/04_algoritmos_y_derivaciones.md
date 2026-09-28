# Algoritmos y derivaciones — traductor dirigido por sintaxis

## 1. Recursive descent de expresiones

Con la gramática estratificada:

```text
Expr   -> Term   {(PLUS|MINUS) Term}
Term   -> Unary  {(STAR|SLASH) Unary}
Unary  -> MINUS Unary | Primary
Primary-> INT | IDENT | LPAREN Expr RPAREN
```

la estructura del código sigue directamente a los no terminales. El bucle en `Expr` produce asociatividad izquierda; la recursión en `Unary` produce anidamiento a la derecha.

```text
parseExpr():
    node = parseTerm()
    while lookahead in {+, -}:
        op = consume()
        rhs = parseTerm()
        node = Binary(op, node, rhs)
    return node
```

**Invariante:** al retornar, `node` representa exactamente el prefijo reconocido por `Expr` y el cursor apunta al primer token no perteneciente a esa expresión.

## 2. Emisión TAC postorder

```text
lower(expr):
    if Literal: return Const(value)
    if Var:     return SymbolRef(symbol)
    if Binary:
        l = lower(left)
        r = lower(right)
        t = newTemp()
        emit(t = l op r)
        return t
```

Este patrón es un atributo sintetizado operacional: cada subárbol retorna el lugar donde está su valor.

## 3. Errores

`expect(RPAREN)` debe fallar en la posición actual, no en el inicio de la expresión. Conserve además un span del paréntesis de apertura para producir un diagnóstico secundario “se abrió aquí”.
