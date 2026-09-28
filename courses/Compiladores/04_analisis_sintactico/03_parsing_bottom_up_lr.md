# Parsing ascendente: items LR, SLR, LR(1) y LALR

**Módulo 04.**

## Cobertura

Cubre 4.5–4.7 y 4.9.

## Idea central

El parsing LR reconoce una clase mucho mayor de gramáticas deterministas y modela el reconocimiento como una máquina de estados sobre prefijos viables.

## Shift-reduce

Un parser shift-reduce mantiene una pila de estados/símbolos. **Shift** consume un token y avanza; **reduce** reconoce que un sufijo de la pila corresponde al lado derecho de una producción y lo reemplaza por el no terminal. **Accept** termina; una celda sin acción produce error. La pregunta central es cuándo un handle está completo.

## Items y cierre

Un item LR(0) `A→α·β` representa cuánto de una producción se ha reconocido. `closure(I)` agrega items de producciones que podrían comenzar donde el punto precede a un no terminal. `goto(I,X)` avanza el punto sobre `X` y vuelve a cerrar. Los conjuntos de items forman los estados de un DFA de prefijos viables.

## SLR, canonical LR(1) y LALR

SLR usa FOLLOW para decidir reducciones, lo que puede ser demasiado aproximado. LR(1) adjunta un lookahead a cada item y obtiene mayor precisión a costa de más estados. LALR fusiona estados LR(1) con el mismo núcleo LR(0), logrando tablas más pequeñas con poder práctico muy cercano; históricamente es popular en yacc/bison.

## Conflictos

Un shift/reduce conflict significa que la tabla propone ambas acciones; reduce/reduce ofrece dos reducciones. A veces el conflicto refleja ambigüedad intencional resuelta por precedencia, pero no debe ignorarse automáticamente. El reporte de estados e items es una herramienta de diagnóstico de la gramática.

## Ejemplo trabajado

Un item `E→E + T ·` indica que `E+T` está completo y podría reducirse, pero la legitimidad de la reducción depende del método y lookahead. En LR(1), el item incluye el conjunto preciso de terminales para los que esa reducción es válida.

## Traslado a implementación

Aunque el proyecto base use recursive descent, haga una práctica con Bison/PLY u otra herramienta LR. Comprender ambos paradigmas evita asociar “parser” con una sola técnica.

## Errores conceptuales frecuentes

- Creer que LR construye el árbol “al revés” semánticamente.
- Resolver todos los conflictos con precedencia sin investigar su origen.
- Confundir estado de parser con nodo del AST.

## Ejercicios de dominio

1. Construya la colección LR(0) de una gramática pequeña.
2. Identifique un conflicto SLR resuelto por LR(1).
3. Compare tamaño de tablas LR(1) y LALR.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
