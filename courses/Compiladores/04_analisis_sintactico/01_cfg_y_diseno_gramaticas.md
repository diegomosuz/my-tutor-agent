# Gramáticas libres de contexto y diseño de gramáticas

**Módulo 04.**

## Cobertura

Cubre 4.1–4.3 y 4.8.

## Idea central

El parser reconoce estructura jerárquica que un autómata finito no puede capturar. La gramática libre de contexto es el modelo central, pero escribir una gramática útil para parsing requiere trabajo de ingeniería.

## CFG: símbolos y derivaciones

Una CFG `G=(V,T,P,S)` tiene no terminales `V`, terminales `T`, producciones `P` y símbolo inicial `S`. Una derivación reemplaza un no terminal por el lado derecho de una producción. Derivaciones izquierdas y derechas son estrategias; el árbol de parseo captura la estructura esencial independientemente del orden de derivación.

## Ambigüedad, precedencia y asociatividad

Una gramática es ambigua si alguna cadena posee más de un parse tree. La ambigüedad es problemática porque distintos árboles pueden producir distintos significados. En expresiones, la eliminamos estratificando precedencia o la resolvemos mediante declaraciones de precedencia en algunos generadores. Para `if/else`, la regla de asociar `else` con el `if` más cercano es una resolución clásica de ambigüedad.

## Recursión izquierda y factorización

Los parsers predictivos no toleran recursión izquierda directa `A→Aα|β`. Se transforma en `A→βA'` y `A'→αA'|ε`. La factorización izquierda extrae prefijos comunes cuando un token de lookahead no alcanza para decidir producción. Estas transformaciones deben preservar lenguaje y semántica estructural.

## Ejemplo trabajado

La gramática ambigua `E→E+E|E*E|id` permite dos árboles para `id+id*id`. Una versión estratificada `E→E+T|T`, `T→T*F|F`, `F→id|(E)` fuerza multiplicación debajo de suma y por lo tanto mayor precedencia.

## Traslado a implementación

Mantenga una gramática legible como artefacto de especificación incluso si el parser manual está escrito directamente. Agregue tests que ejerciten cada producción y cada error esperado.

## Errores conceptuales frecuentes

- Confundir ambigüedad con nondeterminismo del algoritmo.
- Eliminar recursión izquierda y cambiar asociatividad sin compensarlo al construir AST.
- Codificar precedencia solo en comentarios.

## Ejercicios de dominio

1. Pruebe ambigüedad en una gramática de expresiones.
2. Elimine recursión izquierda.
3. Factorice una gramática de llamadas y variables.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?

## Visualización complementaria

![AST de expresión](images/ast_expresion.png)
