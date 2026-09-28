---
title: "Tests derivados de la spec"
order: 2
description: "Diseño de pruebas trazable a comportamiento y riesgo."
---

# Tests derivados de la spec

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Derivar tests de requisitos.
- Elegir nivel correcto.
- Cubrir propiedades/invariantes.
- Detectar gaps de evidencia.

## Conceptos esenciales

- **Example test:** caso concreto
- **Property test:** propiedad sobre muchos inputs
- **Contract test:** interfaz
- **Regression test:** bug corregido
- **Acceptance test:** requisito observable

## Desarrollo técnico

### Tests como evidencia

No sustituyen outcomes o requisitos operativos.

### Propiedades

Invariantes como no duplicar pagos por retry se benefician de property tests.

### Cobertura de riesgo

Más test donde el costo de error es alto.

## Ejemplo aplicado

| Requisito | Test adecuado |
|---|---|
| cálculo puro | unit/property |
| contrato REST | contract/integration |
| auth | integration/security |
| UI crítico | E2E focalizado |
| p95 | load test |

## Práctica guiada

Para 10 requisitos, elegí el test mínimo suficiente y justificá por qué no usar E2E para todo.

## Errores frecuentes y cómo evitarlos

- 1 requisito=1 test mecánico.
- Mocks como única evidencia.
- No probar negativos.

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

- [Kiro Docs — Specs](https://kiro.dev/docs/specs/)
- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
