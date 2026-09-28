---
title: "Por qué SDD importa en ingeniería asistida por IA"
order: 2
description: "Pérdida de intención, ambigüedad y control del contexto en sistemas de desarrollo agentic."
---

# Por qué SDD importa en ingeniería asistida por IA

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Identificar dónde se pierde intención.
- Explicar por qué más capacidad del modelo no elimina la necesidad de especificar.
- Diseñar checkpoints humanos de alto valor.
- Diferenciar velocidad de generación de velocidad de entrega.

## Conceptos esenciales

- **Translation loss:** pérdida de significado al pasar de necesidad a requisito, diseño, código y validación
- **Context budget:** capacidad finita del agente para mantener instrucciones y evidencia relevante
- **Binding decisions:** decisiones de implementación con costo de reversión
- **Reviewability:** capacidad de revisar artefactos antes de que aumente el costo del cambio

## Desarrollo técnico

### El problema no es generar código

Los agentes pueden producir mucho código. El cuello de botella se desplaza hacia decidir correctamente qué construir, mantener contexto útil y validar el resultado.

### Costo de corregir tarde

Una ambigüedad detectada en una spec suele resolverse con una conversación. Descubierta después de APIs, esquemas y automatizaciones puede exigir migraciones y retrabajo.

### Control humano de alto apalancamiento

El objetivo no es revisar cada línea generada. Es revisar alcance, criterios de éxito, arquitectura, interfaces, riesgos y evidencia.

## Ejemplo aplicado

```text
Necesidad ──► Requisito ──► Diseño ──► Código ──► Producción
   │             │            │          │
   └─ ambigüedad ┴─ supuestos ┴─ tradeoff┴─ drift
```

## Práctica guiada

Elegí una feature implementada con IA. Reconstruí qué decidió el agente sin que se lo pidieras y qué habrías especificado para evitar retrabajo.

## Errores frecuentes y cómo evitarlos

- Medir productividad solo por LOC o commits.
- Usar una spec como prompt gigante sin checkpoints.
- Agregar contexto indiscriminadamente en vez de curarlo.

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
- [Anthropic — Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [GitHub Spec Kit — What is Spec-Driven Development?](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
