---
title: "Capstone Fase 1: Constitution + Spec"
order: 2
description: "Definir principios, objetivos, escenarios, requisitos y non-goals."
---

# Capstone Fase 1: Constitution + Spec

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Crear constitución compacta.
- Escribir spec verificable.
- Priorizar riesgos.
- Definir evidence plan preliminar.

## Conceptos esenciales

- **Constitution:** reglas persistentes
- **Feature spec:** intención
- **Non-goal:** frontera
- **Acceptance:** condición verificable
- **Evidence plan:** cómo demostrar cumplimiento

## Desarrollo técnico

### Constitution

Incluí compatibilidad, seguridad, testabilidad, observabilidad y migrations.

### Spec

Definí actores, escenarios, límites, FR/NFR y criterios de éxito.

### Review

Cada requisito crítico debe tener evidencia y los non-goals no pueden aparecer luego como tasks.

## Ejemplo aplicado

### Entregables
- `constitution.md`
- `spec.md`
- `open-questions.md`
- `acceptance-matrix.md`

No escribas `plan.md` hasta cerrar ambigüedades arquitectónicamente relevantes.

## Práctica guiada

Producí los cuatro entregables y pedí una review adversarial de 10 ambigüedades.

## Errores frecuentes y cómo evitarlos

- Constitución específica del caso.
- Tecnología prematura.
- Aceptación no medible.

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

- [GitHub Spec Kit — Quickstart](https://github.com/github/spec-kit/blob/main/docs/quickstart.md)
- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
