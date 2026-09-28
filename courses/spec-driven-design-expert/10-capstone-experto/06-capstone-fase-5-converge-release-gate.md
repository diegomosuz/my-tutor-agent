---
title: "Capstone Fase 5: Converge + Release Gate"
order: 6
description: "Cerrar gaps, probar compatibilidad y producir evidencia de release."
---

# Capstone Fase 5: Converge + Release Gate

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Ejecutar convergencia.
- Diseñar release gate.
- Probar rollout/rollback.
- Preparar observabilidad.

## Conceptos esenciales

- **Convergence report:** gaps
- **Release gate:** evidencia mínima
- **Compatibility check:** prueba consumidores
- **Operational readiness:** operabilidad
- **Post-release validation:** confirmar outcomes

## Desarrollo técnico

### Converge

Comparar spec, plan, tasks, tests y comportamiento.

### Release gate

Full tests, contracts, security, migration dry-run, observabilidad y runbook.

### Post-release

Validar outcome y operación, no solo ausencia de errores.

## Ejemplo aplicado

| Gate | Evidence | Owner |
|---|---|---|
| compatibilidad | contract suite | API owner |
| seguridad | auth/privacy tests | security |
| migration | dry-run | data owner |
| operación | dashboard+alerts | on-call |
| producto | tiempo de generación | product |

## Práctica guiada

Producí `release-evidence.md` con links a evidencia y ejecutá un simulacro de rollback.

## Errores frecuentes y cómo evitarlos

- Publicar porque 'anda local'.
- No probar legacy.
- No definir quién observa release.

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

- [GitHub Spec Kit — documentación oficial](https://github.github.com/spec-kit/)
- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
