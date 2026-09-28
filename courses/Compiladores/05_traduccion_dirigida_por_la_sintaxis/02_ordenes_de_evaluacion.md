# Órdenes de evaluación y aplicaciones de SDD

**Módulo 05.**

## Cobertura

Cubre 5.2 y 5.3.

## Idea central

El mismo conjunto de ecuaciones puede admitir uno o varios órdenes de evaluación. Entender esa libertad es importante para implementar traducción, tipos y layout sin introducir dependencias accidentales.

## Orden topológico y ciclos

Si el grafo de dependencias es acíclico existe al menos un orden topológico. Un ciclo indica que un atributo necesita, directa o indirectamente, su propio valor antes de calcularse. Algunos formalismos admiten soluciones por punto fijo, pero las SDD de compiladores suelen diseñarse para recorridos deterministas simples.

## Tipos y tamaños como atributos

Declaraciones estructuradas permiten calcular `type` y `width`. Un array `array[10] of int` sintetiza un tipo compuesto y un ancho `10*width(int)`. A partir de un offset heredado puede asignarse ubicación a cada variable. Estas reglas conectan semántica estática con layout posterior.

## Construcción de AST

Una aplicación fundamental es construir AST eliminando símbolos puramente sintácticos. En vez de conservar una producción `factor -> '(' expr ')'`, la acción devuelve directamente el nodo de `expr`. Esto reduce ruido y estabiliza las fases posteriores frente a cambios menores de gramática.

## Ejemplo trabajado

Para una declaración `int a, b, c;`, el tipo `int` puede heredarse hacia la lista, mientras que el desplazamiento puede avanzar acumulativamente: `a` offset 0, `b` offset 8, `c` offset 16 en un modelo de 64 bits.

## Traslado a implementación

En MiniC-RV, use un visitor separado para layout en lugar de fijar offsets al parsear. El ejemplo de SDD muestra el principio, pero separar fases facilita redefinir ABI y target sin tocar el parser.

## Errores conceptuales frecuentes

- Fijar tamaño de tipos en el parser.
- Confundir tipo del lenguaje con representación exacta de target demasiado temprano.

## Ejercicios de dominio

1. Calcule width de arrays multidimensionales.
2. Construya AST de una declaración.
3. Proponga atributos para break/continue.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
