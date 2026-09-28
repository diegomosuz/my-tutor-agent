# Propagación de constantes, CSE, DCE y PRE

**Módulo 09.**

## Cobertura

Cubre 9.4 y 9.5, con técnicas relacionadas.

## Idea central

Las optimizaciones globales usan hechos de data-flow para demostrar redundancia o valores conocidos y transformar IR sin alterar comportamiento observable.

## Constant propagation

Un dominio clásico por variable contiene `UNDEF`, una constante concreta o `NAC` (not a constant). El meet de dos caminos con la misma constante mantiene la constante; constantes distintas producen NAC. Después del análisis, operaciones con operandos conocidos pueden plegarse. La versión sparse sobre SSA puede ser más eficiente y precisa.

## Common subexpression elimination

Una expresión es redundante si ya se calculó y sus operandos no cambiaron. Local CSE puede usar value numbering dentro de un bloque. Global CSE requiere available expressions o SSA/value numbering global, además de cuidado con memoria y aliasing.

## Dead code elimination

Una definición es muerta si su resultado no puede afectar comportamiento observable. Liveness detecta temporales sin usos futuros, pero stores, llamadas y operaciones con side effects no se eliminan solo porque su resultado no se use. DCE global suele iterar porque eliminar una instrucción puede volver muerta a otra.

## Partial redundancy elimination

PRE elimina expresiones redundantes en algunos pero no todos los caminos insertando cómputos donde sea rentable/seguro. Unifica ideas de CSE y code motion. Requiere análisis más fino de anticipabilidad y disponibilidad, y demuestra por qué la teoría de data-flow merece formalización.

## Ejemplo trabajado

`if (c) x=a+b; ... y=a+b;` puede tener redundancia parcial: en un camino `a+b` ya se calculó y en otro no. PRE puede insertar el cómputo en el camino faltante y reemplazar el segundo por un valor común, siempre que no se alteren efectos ni operandos.

## Traslado a implementación

Construya pases pequeños, cada uno con una función clara y tests de equivalencia. Ejecute `const-prop -> fold -> dce` repetidamente hasta no cambiar o use un pipeline razonado. No mezcle todas las transformaciones en un único visitor opaco.

## Errores conceptuales frecuentes

- Eliminar llamadas “puras” sin tener información de pureza.
- CSE de loads a través de stores aliasing.
- Propagar constantes ignorando joins.

## Ejercicios de dominio

1. Construya lattice de constantes.
2. Aplique DCE.
3. Explique un caso de PRE.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
