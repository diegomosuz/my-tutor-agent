# Estructura interna de un compilador

**Módulo 01.**

## Cobertura

Cubre 1.2 y conecta con la arquitectura del proyecto integrador.

## Idea central

La arquitectura clásica front-end / middle-end / back-end no es una moda: desacopla dependencias del lenguaje fuente de dependencias de la máquina objetivo.

## Front-end, middle-end y back-end

El **front-end** conoce el lenguaje fuente. Se ocupa del léxico, la sintaxis, el enlace de nombres, el sistema de tipos y la creación de una representación semánticamente válida. El **middle-end** intenta ser independiente tanto de la sintaxis original como de detalles excesivamente concretos de la máquina; opera sobre IR, CFG y propiedades de flujo de datos. El **back-end** conoce la ISA, ABI, registros, formas de direccionamiento, latencias y restricciones del target.

La ventaja del desacoplamiento puede expresarse como un problema combinatorio. Con `S` lenguajes fuente y `T` targets, una arquitectura de traductores directos necesita potencialmente `S×T` implementaciones. Una IR bien diseñada permite aproximarse a `S + T`: cada front-end baja a la IR y cada backend consume esa IR.

## Representaciones internas

Una representación no es solo una estructura de datos conveniente; es una decisión sobre qué propiedades se vuelven fáciles de expresar. El token stream conserva orden léxico. El parse tree refleja producciones gramaticales. El AST elimina sintaxis accidental. El TAC hace explícitos temporales y orden de evaluación. El CFG hace explícitas las transferencias de control. SSA hace explícita la definición única de valores y simplifica numerosas optimizaciones.

Cada cambio de representación debe tener un propósito. Una IR demasiado cercana al lenguaje fuente hace difícil reutilizar optimizaciones. Una IR demasiado cercana a la máquina puede perder información de alto nivel necesaria para optimizar.

## Diagnósticos como responsabilidad transversal

Un compilador docente suele concentrarse en programas correctos, pero un compilador profesional vive gran parte del tiempo procesando programas incorrectos. Por eso cada token y nodo del AST debe conservar un `SourceSpan` con archivo, línea y columna. El mensaje debe separar: ubicación, naturaleza del error, evidencia y posible corrección. La recuperación de errores en parsing busca continuar para reportar más de un problema sin producir una cascada engañosa.

## Ejemplo trabajado

Para `if (x < 10) y = y + 1;`, el AST conserva `If(Compare(x,10), Assign(...))`. El CFG, en cambio, lo representa como bloques y aristas: bloque de condición, bloque verdadero y bloque de continuación. Ninguna representación es “más correcta”; sirven para preguntas distintas.

## Traslado a implementación

Defina dataclasses o clases inmutables para tokens y nodos. Centralice los tipos de IR. Evite pasar diccionarios ad hoc entre fases: los contratos explícitos permiten validar invariantes y serializar representaciones para pruebas golden.

## Errores conceptuales frecuentes

- Usar el parse tree como IR universal.
- Perder ubicaciones de origen después del lexer.
- Permitir que el backend consulte texto fuente.

## Ejercicios de dominio

1. Proponga una IR que soporte `if`, `while` y llamadas.
2. Explique qué información del AST se elimina al construir TAC.
3. Diseñe una política de diagnósticos con severidad y código.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
