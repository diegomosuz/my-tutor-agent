# Laboratorio — Anatomía de una toolchain y especificación de MiniC-RV

## Objetivo
Construir la especificación inicial del lenguaje y observar una toolchain real antes de programar el front-end.

## Parte A — observar un compilador existente
1. Compile un programa C con `gcc -E`, `-S`, `-c` y finalmente link.
2. Compare archivo preprocesado, assembly y object file.
3. Use `objdump -d` para ver instrucciones y `readelf` para símbolos/secciones.
4. Dibuje qué herramienta produjo cada artefacto.

## Parte B — especificar MiniC-RV
Entregue un documento que defina tokens, EBNF inicial, precedencia, tipos, scope, reglas de evaluación, `return`, errores y semántica de enteros.

## Parte C — esqueleto
Cree paquetes `lexer`, `parser`, `semantics`, `ir`, `optimizer`, `backend`, `diagnostics` y tests. Cada paquete puede estar vacío, pero sus interfaces deben estar documentadas.

## Criterio
No se evalúa cantidad de código sino la claridad de contratos entre fases.
