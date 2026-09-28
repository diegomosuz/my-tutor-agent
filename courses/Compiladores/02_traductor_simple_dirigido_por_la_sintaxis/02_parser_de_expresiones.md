# Parsing de expresiones: del reconocimiento a un AST

**Módulo 02.**

## Cobertura

Cubre 2.4 y 2.5.

## Idea central

Un parser de expresiones permite estudiar precedencia, asociatividad y construcción de árboles sin la complejidad de un lenguaje completo.

## Descenso recursivo como correspondencia gramática-código

En una gramática adecuada, cada no terminal puede corresponder a una función. `parse_expr` consume términos separados por `+/-`; `parse_term` consume factores separados por `*/`; `parse_factor` reconoce literales, identificadores o expresiones parentizadas. La jerarquía de funciones codifica precedencia.

El parser mantiene un cursor sobre tokens. Cada función garantiza un contrato: si tiene éxito, devuelve un nodo y deja el cursor inmediatamente después de la construcción reconocida; si falla, produce un diagnóstico en el punto de mayor información.

## Asociatividad y forma del árbol

Para operadores asociativos a la izquierda, un bucle construye sucesivamente `Binary(Binary(a,'-',b),'-',c)`. Para exponenciación asociativa a la derecha, se necesita una forma recursiva distinta. El árbol no es decoración: determina semántica de evaluación y más tarde orden de código.

## Ejemplo trabajado

Para `a - b - c`, asociatividad izquierda produce `(a-b)-c`. En AST: `Sub(Sub(a,b),c)`. Cambiar accidentalmente la recursión puede producir `a-(b-c)`, que no es semánticamente equivalente.

## Traslado a implementación

Implemente `peek()`, `match(kind)` y `expect(kind)`. `expect` debe generar error con `SourceSpan`. No disperse lógica de avance del cursor por todo el parser: centralizarla disminuye errores off-by-one.

## Errores conceptuales frecuentes

- Parsear caracteres en lugar de tokens.
- Construir un AST que conserve paréntesis innecesarios como nodos semánticos.
- No distinguir error de fin de entrada de un token inesperado.

## Ejercicios de dominio

1. Añada operadores relacionales.
2. Implemente precedencia para `&&` y `||`.
3. Construya golden tests del AST.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
