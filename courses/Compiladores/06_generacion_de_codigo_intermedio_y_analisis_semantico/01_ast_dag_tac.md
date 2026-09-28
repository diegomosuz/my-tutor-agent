# AST, DAG y código de tres direcciones

**Módulo 06.**

## Cobertura

Cubre 6.1 y 6.2.

## Idea central

La representación intermedia debe hacer explícitas las operaciones relevantes para análisis y generación de código sin quedar atada a sintaxis accidental del lenguaje fuente.

## AST frente a DAG

Un AST representa estructura semántica de un programa. Un DAG puede compartir nodos de subexpresiones comunes, representando que un mismo valor computado alimenta varios usos. El sharing es útil dentro de bloques básicos, aunque con memoria mutable hay que demostrar que las cargas y expresiones siguen siendo equivalentes antes de compartirlas.

## Three-Address Code

TAC usa formas como `x = y op z`, `x = op y`, `goto L`, `if x rel y goto L`, `param x`, `call f,n`, `return x`, cargas y stores. Puede almacenarse como quadruples `(op,arg1,arg2,result)` o triples. El formato uniforme simplifica recorridos, análisis de def-use y backend.

## Temporales y nombres virtuales

Los temporales son valores virtuales ilimitados. No deben confundirse con registros físicos. El backend realizará register allocation más tarde. Mantener esta abstracción permite optimizar sin contaminar el middle-end con escasez concreta de registros.

## Ejemplo trabajado

`x = (a+b)*(a+b)` puede bajar inicialmente a `t1=a+b; t2=a+b; t3=t1*t2; x=t3`. Una optimización local posterior puede reconocer que `t2` es redundante si ninguna operación invalida los valores de `a` o `b`.

## Traslado a implementación

Defina clases de instrucciones IR tipadas, no strings. Ejemplo: `BinOp(dest, op, lhs, rhs)`, `CJump(cond, t, f)`, `Load`, `Store`, `Call`, `Return`. Conserve metadata de fuente para mapear diagnósticos y depuración.

## Errores conceptuales frecuentes

- Usar nombres de registros físicos como temporales.
- Perder tipos en IR si son necesarios para seleccionar operaciones.
- Representar control de flujo solo con indentación.

## Ejercicios de dominio

1. Diseñe quadruples para llamadas.
2. Baje un AST a TAC.
3. Identifique cuándo un AST puede convertirse en DAG.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
