# Generadores de lexer y optimización de matchers DFA

**Módulo 03.**

## Cobertura

Cubre 3.5, 3.8 y 3.9.

## Idea central

Un generador de analizadores léxicos automatiza la transformación de reglas regulares en código eficiente y agrega una capa de acciones y prioridades.

## Arquitectura de un lexer generator

La entrada es un conjunto ordenado de reglas `regex -> action`. El generador combina AFN de reglas, determiniza, marca aceptación con identidad de regla y produce una tabla o código especializado. En tiempo de ejecución mantiene el último estado de aceptación mientras avanza; si una transición falla, retrocede lógicamente al último lexema aceptado y ejecuta su acción.

La técnica explica cómo se implementa maximal munch incluso cuando se leyó más allá del final del token. No hace falta “adivinar” la frontera: se recuerda la mejor aceptación previa.

## Representación de tablas

Una tabla densa `estado × carácter` es rápida pero puede ocupar mucho espacio. Compresión por clases de equivalencia de caracteres, filas compartidas o esquemas `base/check/next` explotan esparsidad. Otra opción es generar código con tests y saltos. La elección enfrenta tamaño de código, cache locality y costo de branches.

## Keywords e identificadores

Hay dos estrategias comunes: reglas explícitas por keyword o una regla general de identificador seguida por consulta a una tabla de reservadas. La segunda reduce estados y facilita mantener el lenguaje. Sin embargo, algunas herramientas manejan prioridad de reglas de forma suficientemente eficiente para mantenerlas declarativas.

## Ejemplo trabajado

Suponga reglas para `=`, `==` e identificadores. El DFA llega a un estado de aceptación tras `=`, pero sigue porque `==` podría ser más largo. Si el segundo carácter no es `=`, emite el primer token y deja el carácter no consumido para la próxima iteración lógica.

## Traslado a implementación

Compare el rendimiento y claridad del scanner manual con Flex. La meta no es decidir que uno sea universalmente mejor, sino entender qué complejidad compra la herramienta y qué control se pierde o gana.

## Errores conceptuales frecuentes

- Emitir token apenas se alcanza un estado final sin considerar coincidencia más larga.
- No documentar cómo se resuelven prioridades.
- Optimizar tablas antes de tener pruebas exhaustivas.

## Ejercicios de dominio

1. Explique `last_accepting_state`.
2. Diseñe clases de caracteres para MiniC-RV.
3. Mida tokens/segundo en archivos grandes.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
