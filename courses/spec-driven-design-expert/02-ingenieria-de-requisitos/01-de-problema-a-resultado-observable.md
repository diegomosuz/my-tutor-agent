---
title: "De problema a resultado observable"
order: 1
description: "Cómo transformar pedidos vagos en objetivos verificables antes de hablar de solución."
---

# De problema a resultado observable

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Separar problema, necesidad, resultado y solución.
- Escribir objetivos medibles sin sobre-especificar tecnología.
- Definir alcance/no alcance.
- Identificar stakeholders y conflictos.

## Conceptos esenciales

- **Problem statement:** situación observable que justifica el cambio
- **Outcome:** cambio medible esperado
- **Scope:** frontera de lo incluido
- **Non-goal:** comportamiento fuera de alcance
- **Stakeholder:** actor afectado

## Desarrollo técnico

### No empezar por la solución

'Usar microservicios' no describe un problema. Hay que retroceder a la necesidad verificable.

### Resultados, no deseos

'95% de reportes disponibles en <30s' es más verificable que 'mejorar performance'.

### Scope como mecanismo de control

Los non-goals evitan que el agente expanda el alcance por helpfulness.

## Ejemplo aplicado

**Pedido:** “Necesitamos un dashboard más inteligente”.

- Problema: analistas combinan tres reportes manualmente.
- Outcome: una vista consolidada para las métricas prioritarias.
- En alcance: filtros, exportación y freshness.
- Fuera de alcance: predicción y alertas.

## Práctica guiada

Elegí un pedido real y redactá problem statement, 2 outcomes, 5 ítems de alcance, 3 non-goals y stakeholders.

## Errores frecuentes y cómo evitarlos

- Escribir tecnología como objetivo.
- No declarar qué NO se construye.
- Confundir actividad con resultado.

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
- [GitHub Spec Kit — What is Spec-Driven Development?](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
