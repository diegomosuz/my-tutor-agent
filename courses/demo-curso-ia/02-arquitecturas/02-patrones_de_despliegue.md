# Patrones de despliegue de IA

Este tema no incluye metadata en formato YAML (frontmatter), para demostrar
que el sistema es tolerante a su ausencia: el título y el orden se infieren
directamente del nombre del archivo.

## Despliegue batch

El modelo procesa grandes volúmenes de datos de forma periódica (por
ejemplo, una vez por día), sin necesidad de responder en tiempo real.

## Despliegue en tiempo real

El modelo se expone como un servicio (API) que responde a solicitudes
individuales de manera inmediata.

## Despliegue embebido

El modelo se empaqueta junto con la aplicación que lo consume, sin depender
de un servicio externo.

## Resumen

- Existen al menos tres patrones de despliegue: batch, tiempo real y
  embebido.
- La elección del patrón depende de los requisitos de latencia y volumen de
  la solución.
