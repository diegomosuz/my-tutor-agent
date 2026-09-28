# Esquemas de traducción y SDD L-attributed

**Módulo 05.**

## Cobertura

Cubre 5.4 y 5.5.

## Idea central

Un syntax-directed translation scheme inserta acciones en el lado derecho de producciones, haciendo explícito cuándo se ejecutan. La propiedad L-attributed permite implementarlas durante un recorrido predecible.

## Acciones embebidas

Una acción colocada antes de un símbolo puede preparar contexto; una al final puede sintetizar resultados. En parsers top-down, esto se parece a código ejecutado antes/después de llamadas recursivas. En parsers bottom-up, acciones al final encajan con reducciones; acciones intermedias pueden transformarse introduciendo no terminales marcadores.

## Control de flujo como atributos de etiquetas

Una traducción puede pasar `true`, `false` y `next` labels como atributos heredados. Expresiones booleanas de short-circuit generan saltos en lugar de valores temporales. Esta técnica prepara el terreno para backpatching del capítulo 6.

## Ejemplo trabajado

`B1 && B2` puede traducirse dando a `B1.true` una etiqueta que inicia `B2`, mientras que `B1.false` y `B2.false` apuntan al mismo destino falso. La semántica short-circuit queda codificada en el grafo de saltos.

## Traslado a implementación

Implemente acciones semánticas como construcción de nodos y evite emitir texto assembly desde el parser. Use la teoría de atributos para diseñar APIs limpias de visitors posteriores.

## Errores conceptuales frecuentes

- Acciones con side effects que dependen de orden ambiguo.
- Generar labels globales sin un allocator central.
- Perder spans al reemplazar parse tree por AST.

## Ejercicios de dominio

1. Diseñe atributos para `if/else`.
2. Traduzca booleanos por jumping code.
3. Reescriba una acción intermedia con marcador.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
