# Loops, dominadores, regiones y análisis simbólico

**Módulo 09.**

## Cobertura

Cubre 9.6–9.8.

## Idea central

Los loops concentran ejecución y por ello son objetivos prioritarios. Detectarlos y razonar sobre su estructura requiere dominadores y back edges.

## Dominadores

Un nodo `d` domina a `n` si todo camino desde entry a `n` pasa por `d`. `idom` define el árbol de dominadores. Una arista `n→h` donde `h` domina a `n` es un back edge y permite identificar un natural loop con header `h`. Esta caracterización funciona bien en CFG reducibles.

## Loop-invariant code motion

Una operación es invariante si sus operandos son constantes o definidos por invariantes y moverla no cambia efectos/excepciones observables. Se mueve al preheader, pero deben verificarse condiciones de seguridad: dominación de usos, ejecución especulativa y ausencia de side effects.

## Induction variables

Una variable básica de inducción cambia por constante cada iteración; derivadas son funciones afines de ella. Detectarlas permite strength reduction y eliminar cálculos repetidos. Sin embargo, overflow definido por el lenguaje puede afectar validez de transformaciones algebraicas.

## Regiones y symbolic analysis

Region-based analysis agrupa subgrafos con entrada controlada para escalar análisis. Symbolic analysis conserva expresiones en lugar de valores concretos, útil para bounds, dependencias y optimización de loops. Introduce el puente hacia el capítulo 11.

## Ejemplo trabajado

Para `for(i=0;i<n;i++){ t=a*b; x[i]=t+i; }`, `a*b` es candidato a invariant code motion si `a` y `b` no cambian y multiplicar no tiene efectos/excepciones observables relevantes. El preheader calcula `t` una vez.

## Traslado a implementación

Añada cálculo de dominadores y detección de loops al `FunctionIR`. Genere DOT del CFG con headers y back edges para inspección visual durante tests.

## Errores conceptuales frecuentes

- Llamar loop a cualquier ciclo sin considerar entry/header.
- Mover una división fuera de un loop donde antes podía no ejecutarse.
- Ignorar overflow.

## Ejercicios de dominio

1. Calcule dominadores.
2. Detecte natural loop.
3. Evalúe seguridad de LICM.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
