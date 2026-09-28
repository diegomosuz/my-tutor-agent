---
title: "Seguridad, performance, resiliencia y observabilidad"
order: 5
description: "Integrar atributos de calidad al diseño en vez de agregarlos al final."
---

# Seguridad, performance, resiliencia y observabilidad

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Traducir amenazas en requisitos.
- Definir SLOs.
- Diseñar degradación/recuperación.
- Relacionar controles con evidencia.

## Conceptos esenciales

- **Threat model:** actores, activos, fronteras, amenazas
- **SLO:** objetivo operativo
- **Rate limit:** control de abuso/capacidad
- **Circuit breaker:** aislamiento de fallos
- **Telemetry:** logs, métricas y traces

## Desarrollo técnico

### Security by specification

Autorización, privacidad y logging sensible deben aparecer en escenarios/aceptación.

### Performance presupuestada

Asignar presupuestos evita diseños imposibles.

### Resiliencia observable

Retry, timeout, backoff y breaker necesitan condiciones y métricas.

## Ejemplo aplicado

| Riesgo | Diseño | Evidencia |
|---|---|---|
| abuso | rate limit | test throttling |
| fuga PII | redacción logs | security test |
| dependencia lenta | timeout+breaker | chaos test |
| pérdida de job | durable queue | recovery test |

## Práctica guiada

Para una API crítica, escribí 3 amenazas, 3 SLOs y 3 modos de degradación; ligá cada uno a test o métrica.

## Errores frecuentes y cómo evitarlos

- Seguridad al final.
- Retry sin idempotencia.
- SLO sin ventana/población.

## Checklist de dominio

- [ ] Puedo explicar el concepto sin consultar el material.
- [ ] Puedo reconocer cuándo aplicarlo y cuándo no.
- [ ] Puedo transformar una necesidad ambigua en un artefacto verificable.
- [ ] Puedo identificar riesgos, supuestos y criterios de aceptación.
- [ ] Puedo revisar el resultado de un agente sin delegar el juicio técnico.

## Preguntas de reflexión

1. ¿Qué riesgo reduce este artefacto o práctica?
2. ¿Qué evidencia pedirías antes de pasar a la siguiente fase?
3. ¿Qué cambiaría en un sistema regulado o multi-equipo?

## Fuentes y lecturas recomendadas

- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
