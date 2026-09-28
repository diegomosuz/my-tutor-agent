# Datalog, BDD y optimización whole-program

**Módulo 12.**

## Cobertura

Cubre 12.7 y cierra el curso.

## Idea central

La representación declarativa permite expresar análisis complejos como relaciones y reglas recursivas; estructuras como BDD pueden comprimir relaciones grandes en ciertos dominios.

## Datalog

Datalog usa predicados relacionales y reglas Horn sin funciones arbitrarias. Un análisis points-to puede declarar hechos `Addr(x,o)` y `Copy(x,y)` y una regla `PointsTo(x,o) :- Copy(x,y), PointsTo(y,o)`. La evaluación semi-naive evita recomputar todos los hechos en cada iteración.

## BDD

Binary Decision Diagrams representan funciones booleanas canónicas bajo un orden de variables. Relaciones de gran dimensión pueden codificarse como conjuntos booleanos y operar por conjunción, disyunción y cuantificación. Su eficacia depende críticamente del orden y estructura de datos; no son una bala de plata.

## Whole-program optimizations

Con call graph y summaries, el compilador puede devirtualizar llamadas, inlinear selectivamente, propagar constantes entre funciones, eliminar funciones no alcanzables y refinar aliasing. Link-time optimization aplica ideas similares cuando módulos antes separados están disponibles juntos.

## Cierre conceptual

El curso termina donde empezó: preservación semántica. Desde eliminar un temporal local hasta paralelizar un nest de loops, cada transformación necesita una justificación basada en información demostrada. El compilador es una cadena de abstracciones conectadas por invariantes.

## Ejemplo trabajado

Reglas simplificadas:
```text
PointsTo(x,o) :- Addr(x,o).
PointsTo(x,o) :- Copy(x,y), PointsTo(y,o).
```
El resultado es el menor cierre que satisface los hechos y reglas. La implementación con sets y worklist es suficiente para comprender la semántica antes de estudiar representaciones comprimidas.

## Traslado a implementación

Como cierre, ejecute el compilador sobre un programa no trivial y archive: source, tokens, AST, typed AST, TAC, CFG antes/después de optimizar, interference graph y assembly final. Explique una invariante por transición.

## Errores conceptuales frecuentes

- Creer que Datalog decide automáticamente qué análisis es correcto.
- Usar BDD sin medir si comprime el dominio.
- Inlinear indiscriminadamente y provocar code bloat.

## Ejercicios de dominio

1. Implemente cierre Datalog mínimo.
2. Diseñe una regla de reachability.
3. Proponga política de inlining basada en costo.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
