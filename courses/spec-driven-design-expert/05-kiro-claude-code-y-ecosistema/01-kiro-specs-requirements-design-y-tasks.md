---
title: "Kiro Specs: requirements, design y tasks"
order: 1
description: "Modelo de specs en Kiro y comparación conceptual con SDD tool-agnostic."
---

# Kiro Specs: requirements, design y tasks

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Explicar el workflow de Kiro.
- Distinguir feature, bugfix y quick spec.
- Relacionar requirements/design/tasks con SDD.
- Reconocer análisis/correctness.

## Conceptos esenciales

- **requirements.md:** historias y aceptación
- **design.md:** arquitectura y flujos
- **tasks.md:** unidades ejecutables
- **Quick Spec:** generación acelerada
- **Bugfix Spec:** diagnóstico y reparación

## Desarrollo técnico

### Tres artefactos, un flujo

Kiro formaliza requirements→design→tasks y preserva revisión entre fases.

### Feature vs bug

El bug parte de comportamiento actual/esperado y diseño quirúrgico de reparación.

### Correctness

El análisis y property-based testing refuerzan la tendencia hacia specs verificables.

## Ejemplo aplicado

```text
Idea/Bug → requirements.md|bugfix.md → design.md → tasks.md → implementation
```

## Práctica guiada

Abordá la misma necesidad como Feature Spec, Quick Spec y Bugfix Spec. Justificá cuál elegirías.

## Errores frecuentes y cómo evitarlos

- Usar Quick Spec en alta ambigüedad.
- No revisar artefactos.
- Confundir design.md con todos los ADRs.

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
- [AWS — Kiro Documentation Overview](https://aws.amazon.com/documentation-overview/kiro/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
