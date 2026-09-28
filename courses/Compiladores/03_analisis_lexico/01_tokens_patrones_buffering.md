# Tokens, lexemas, patrones y buffering de entrada

**Módulo 03.**

## Cobertura

Cubre 3.1–3.4.

## Idea central

El lexer convierte una secuencia de caracteres en tokens. Su dificultad real está en resolver fronteras, prioridad, errores y eficiencia sin perder ubicación de origen.

## Token, patrón y lexema

Un **token** es una categoría sintáctica como `IDENT`, `INT` o `LE`. Un **patrón** describe el conjunto de lexemas que pertenecen a esa categoría; una expresión regular es una notación habitual. El **lexema** es la secuencia concreta encontrada. Separar estos conceptos evita diseñar parsers que dependan del texto exacto de cada identificador o literal.

La regla práctica predominante es **maximal munch**: elegir el prefijo más largo que forme un token válido. Cuando varios patrones aceptan la misma longitud, se aplica una prioridad definida, por ejemplo reconocer `if` como keyword antes que `IDENT`, o reconocer identificadores y luego reclasificar palabras reservadas.

## Buffering y posiciones

Un lexer ingenuo puede funcionar carácter a carácter, pero históricamente el buffering es importante porque las operaciones de I/O son costosas y el reconocimiento necesita lookahead. El esquema de doble buffer con centinelas reduce comprobaciones de fin de buffer. En implementaciones modernas sobre strings en memoria, el concepto sigue siendo útil: distinguir `start`, `current` y posición lógica permite reconocer sin copiar cada prefijo.

La ubicación debe avanzar correctamente con saltos de línea y Unicode si el lenguaje lo admite. El token ideal conserva offsets absolutos y línea/columna para el rango completo.

## Errores léxicos

Un carácter no reconocido no debe transformarse silenciosamente en otro token. El lexer debe informar el carácter, su ubicación y, cuando sea posible, una categoría útil: literal sin cerrar, escape inválido, número mal formado. La recuperación más segura suele consumir una unidad mínima y continuar para evitar un bucle infinito.

## Ejemplo trabajado

Para `if (count<=10) count=count+1;`, `<=` debe ser un único token, no `<` seguido de `=`. El maximal munch resuelve esta frontera. `ifx`, en cambio, debe ser `IDENT("ifx")`, no `IF IDENT("x")` porque la coincidencia del identificador es más larga.

## Traslado a implementación

Modele el scanner como un iterador. Evite regex gigantes si está enseñando la mecánica: implementar a mano identificadores, números, comentarios y operadores revela las decisiones de estado. Más tarde compare contra Flex u otra herramienta.

## Errores conceptuales frecuentes

- Confundir keyword con prefijo de identificador.
- No actualizar columna después de tabs/nuevas líneas.
- Ignorar comentarios antes de considerar comentarios anidados o strings.

## Ejercicios de dominio

1. Defina reglas de prioridad.
2. Diseñe tokens para `==`, `=`, `<=`, `<`.
3. Escriba casos negativos para strings sin cerrar.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
