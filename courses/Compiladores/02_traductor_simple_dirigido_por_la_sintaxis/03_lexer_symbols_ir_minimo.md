# Lexer, tabla de símbolos e IR en el traductor mínimo

**Módulo 02.**

## Cobertura

Cubre 2.6–2.8.

## Idea central

El traductor simple introduce versiones mínimas de tres subsistemas que luego se desarrollan rigurosamente: scanner, símbolos e IR.

## Separar token kind, lexema y valor

El token `INT_LITERAL` puede conservar lexema `"123"` y valor numérico `123`. Un `IDENT` conserva el texto pero más tarde deberá resolverse a un símbolo. Palabras reservadas se reconocen como kinds específicos para simplificar la gramática. Esta separación permite que el parser razone sobre clases de tokens sin reexaminar caracteres.

## Tabla de símbolos temprana

La tabla de símbolos relaciona nombres con atributos: clase de símbolo, tipo, scope, offset, firma, etc. En el traductor del capítulo puede ser una tabla simple; en el compilador real se convierte en una estructura jerárquica. No debe confundirse con una tabla de strings: su función es representar entidades semánticas.

## IR como lenguaje del compilador

Una IR lineal de tres direcciones limita cada instrucción a una operación principal. Esto introduce temporales pero simplifica análisis y backend. `x = a + b*c` se descompone en `t1=b*c; t2=a+t1; x=t2`. La aparente verbosidad es una ventaja porque vuelve explícitas dependencias y puntos de definición/uso.

## Ejemplo trabajado

Un pipeline mínimo puede aceptar `let x = 2 + 3 * 4;`, producir tokens, AST y TAC. Aunque todavía no haya tipos ni CFG, ya existe un esqueleto completo de front-end.

## Traslado a implementación

Añada comandos de depuración `--emit-tokens` y `--emit-ast`. Estos observables reducen drásticamente el costo de diagnosticar fallas al avanzar hacia etapas más complejas.

## Errores conceptuales frecuentes

- Insertar automáticamente todo identificador usado sin verificar declaración.
- Usar el lexema como ubicación física de una variable.
- Optimizar durante la construcción inicial del AST.

## Ejercicios de dominio

1. Diseñe una estructura `Symbol` extensible.
2. Genere TAC para unary minus.
3. Compare temporales explícitos con un AST.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
