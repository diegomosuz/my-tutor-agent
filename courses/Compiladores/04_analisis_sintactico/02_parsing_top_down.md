# Parsing descendente: FIRST, FOLLOW, LL(1) y recursive descent

**Módulo 04.**

## Cobertura

Cubre 4.4.

## Idea central

El parsing top-down intenta construir una derivación desde el símbolo inicial hacia la entrada. Su forma predictiva es especialmente didáctica porque conecta propiedades formales de la gramática con decisiones concretas del parser.

## FIRST y FOLLOW

`FIRST(α)` contiene terminales que pueden iniciar strings derivados de `α`, incluyendo `ε` si corresponde. `FOLLOW(A)` contiene terminales que pueden aparecer inmediatamente después de `A` en alguna forma sentencial. Estos conjuntos permiten decidir qué producción aplicar con un token de lookahead y también construir sincronización para recuperación de errores.

## Condición LL(1)

Para alternativas `A→α|β`, los conjuntos `FIRST(α)` y `FIRST(β)` deben ser disjuntos. Si `ε∈FIRST(α)`, entonces `FIRST(β)` también debe ser disjunto de `FOLLOW(A)`. Cuando se cumplen las condiciones, una tabla `M[A,a]` puede elegir producción sin backtracking.

## Recursive descent y Pratt parsing

Recursive descent implementa funciones por no terminal y es excelente para statements y construcciones estructuradas. Para expresiones con muchos operadores, Pratt parsing o precedence climbing pueden producir parsers manuales más compactos. Conceptualmente siguen modelando precedencia y asociatividad; la elección es de ingeniería.

## Recuperación de errores

Panic mode descarta tokens hasta un conjunto de sincronización como `;`, `}` o un token en FOLLOW del no terminal. La recuperación debe evitar reportes en cascada. Un parser educativo debe distinguir error primario de nodos “error” insertados para continuar.

## Formalización

La tabla LL(1) se llena así: para `A→α`, por cada `a∈FIRST(α)` distinto de `ε`, colocar la producción en `M[A,a]`; si `ε∈FIRST(α)`, colocarla para cada `b∈FOLLOW(A)`. Dos producciones en la misma celda indican conflicto.

## Ejemplo trabajado

Para `Stmt→if (Expr) Stmt ElseOpt | while (Expr) Stmt | { StmtList } | id = Expr ;`, el primer token casi siempre selecciona la alternativa. `ElseOpt→else Stmt|ε` depende del lookahead y FOLLOW.

## Traslado a implementación

Implemente primero un parser predictivo manual de MiniC-RV. Instrumente `--trace-parse` para mostrar entrada/salida de funciones durante depuración, pero no lo use como mecanismo normal de semántica.

## Errores conceptuales frecuentes

- Calcular FIRST solo sobre el primer símbolo y olvidar nullable.
- Usar backtracking para ocultar una gramática mal diseñada.
- Consumir tokens durante un `peek` de decisión.

## Ejercicios de dominio

1. Calcule FIRST/FOLLOW de una gramática.
2. Construya tabla LL(1).
3. Diseñe sincronización para statements.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
