# Fundamentos de lenguajes que condicionan al compilador

**Módulo 01.**

## Cobertura

Cubre la evolución y bases de lenguajes tratadas en 1.3, 1.4 y 1.6.

## Idea central

El compilador implementa una especificación de lenguaje. Por lo tanto, antes de programar el compilador hay que fijar sintaxis, semántica, sistema de tipos, alcance y reglas de evaluación.

## Sintaxis frente a semántica

La **sintaxis** determina qué secuencias tienen forma válida. La **semántica estática** impone restricciones comprobables sin ejecutar: por ejemplo, que una variable exista o que un `return` sea compatible con el tipo de la función. La **semántica dinámica** define cómo se evalúa el programa: orden de operandos, cambios de estado, llamadas, excepciones, etc.

Una gramática puede aceptar `true + 4` si la gramática solo modela la forma `expr + expr`; el rechazo por incompatibilidad de tipos corresponde al análisis semántico. Mantener esta separación evita gramáticas inmanejables.

## Nombres, scope y binding

Un identificador textual no es todavía una entidad semántica. El compilador debe resolver cada uso contra una declaración según reglas de alcance. **Scope léxico** significa que la relación se determina por la estructura textual/anidada. El `binding` puede verse como una función desde usos de nombres a símbolos declarados. El sombreado introduce múltiples símbolos con el mismo lexema en ámbitos distintos.

El diseño de la tabla de símbolos debe reflejar estas reglas. Una pila de scopes funciona bien para lenguajes con bloques; lenguajes con módulos, clases o imports requieren estructuras adicionales.

## Tipos y modelo de ejecución

Un tipo describe un conjunto de valores y operaciones válidas, pero en compilación también guía layout, selección de instrucciones y calling convention. `int32` e `int64` pueden compartir operadores sintácticos pero demandar instrucciones o extensiones diferentes. Arrays implican cálculo de offsets; funciones implican tipos de firma; punteros introducen aliasing, que después afectará optimización.

## Ejemplo trabajado

En MiniC-RV, `int` será entero con signo de 64 bits y `bool` un valor lógico. La expresión `1 + true` será sintácticamente válida pero semánticamente inválida. `if (x)` puede prohibirse o definirse como conversión implícita: esa decisión pertenece a la especificación, no al parser.

## Traslado a implementación

Escriba una especificación mínima antes del lexer: palabras reservadas, operadores, precedencia, tipos, reglas de scope, evaluación y errores. Esa especificación será el oráculo contra el que se evalúa el compilador.

## Errores conceptuales frecuentes

- Dejar conversiones implícitas sin especificar.
- Confiar en la intuición para decidir precedencia.
- Tratar cada aparición del texto `x` como el mismo símbolo.

## Ejercicios de dominio

1. Especifique scope para bloques anidados.
2. Defina evaluación de `&&` con short-circuit.
3. Decida si MiniC-RV permite shadowing y justifique.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
