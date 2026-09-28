# Sintaxis y traducción dirigida por la sintaxis

**Módulo 02.**

## Cobertura

Cubre 2.1–2.3.

## Idea central

El capítulo construye un traductor pequeño para mostrar, en miniatura, la arquitectura que luego se generaliza. La clave es asociar información semántica a la estructura sintáctica.

## Gramáticas como especificación ejecutable

Una gramática libre de contexto define terminales, no terminales, símbolo inicial y producciones. Para expresiones, separar niveles de precedencia suele conducir a no terminales `expr`, `term` y `factor`. La gramática no solo acepta o rechaza cadenas: su árbol de derivación ofrece una estructura sobre la que realizar traducción.

La traducción dirigida por sintaxis asocia reglas semánticas a producciones. Por ejemplo, una producción para suma puede construir un nodo AST, calcular un valor, emitir postfix o generar TAC. El objetivo didáctico es comprender que la estructura sintáctica guía un cálculo adicional.

## Atributos sintetizados e idea de flujo de información

Un atributo sintetizado de un nodo se calcula a partir de atributos de sus hijos. Para un traductor infix→postfix, la traducción de `E -> E1 + T` puede ser `E.code = E1.code || T.code || '+'`. Más adelante aparecerán atributos heredados, que transportan contexto desde padres o hermanos. Este patrón anticipa type checking, offsets y generación de código.

## Formalización

Una SDD puede modelarse como un grafo de dependencias entre atributos. Un orden de evaluación válido es cualquier orden topológico del grafo. Si existe un ciclo de dependencias, la definición no es evaluable por un recorrido simple.

## Ejemplo trabajado

Entrada: `3 + 4 * 5`. La gramática debe imponer que `4 * 5` se agrupe primero. Un traductor postfix produce `3 4 5 * +`. La salida hace explícito un orden de evaluación que el infix dejaba implícito mediante precedencia.

## Traslado a implementación

Construya primero nodos AST en lugar de emitir directamente assembly. Incluso en el traductor simple, esta disciplina separa reconocimiento de estructura y acciones posteriores.

## Errores conceptuales frecuentes

- Usar acciones semánticas para corregir una gramática ambigua.
- Introducir side effects en acciones cuya evaluación dependa de un orden no garantizado.

## Ejercicios de dominio

1. Diseñe una SDD para calcular el valor de expresiones enteras.
2. Modifique el traductor para unary minus.
3. Compare AST con postfix como representaciones.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
