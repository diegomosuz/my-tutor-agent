---
title: "Spec Kit vs Kiro vs flujo manual"
order: 2
description: "Criterios de selección de tooling sin confundir herramienta con metodología."
---

# Spec Kit vs Kiro vs flujo manual

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Comparar por proceso/gobernanza.
- Diseñar un SDD manual mínimo.
- Evitar lock-in.
- Seleccionar tooling según contexto.

## Conceptos esenciales

- **Method/tool separation:** el método sobrevive al tool
- **Agent neutrality:** varios agentes
- **Integrated experience:** IDE/CLI/workflow
- **Governance:** control de templates/permisos
- **Portability:** artefactos versionables

## Desarrollo técnico

### Herramienta no es metodología

Podés practicar SDD con Markdown, Git y un agente.

### Spec Kit

Fuerte en agent-neutrality, extensibilidad y process harness.

### Kiro

Fuerte en experiencia integrada requirements/design/tasks.

## Ejemplo aplicado

| Criterio | Spec Kit | Kiro | Manual |
|---|---|---|---|
| portabilidad | alta | media-alta | alta |
| integración | media | alta | baja |
| personalización | alta | media | total |
| mantenimiento propio | medio | bajo-medio | alto |

## Práctica guiada

Construí una matriz de decisión con 8 criterios: seguridad, lock-in, IDE, agentes, air-gap, gobierno, onboarding y automatización.

## Errores frecuentes y cómo evitarlos

- Elegir por popularidad.
- Reimplementar tooling existente.
- Forzar mismo nivel de ceremony a todos.

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
- [Kiro Docs — Specs](https://kiro.dev/docs/specs/)
- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
