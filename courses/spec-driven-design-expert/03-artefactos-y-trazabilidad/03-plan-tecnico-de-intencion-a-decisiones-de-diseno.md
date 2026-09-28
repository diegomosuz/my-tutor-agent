---
title: "Plan técnico: de intención a decisiones de diseño"
order: 3
description: "Cómo convertir una spec en arquitectura, contratos y estrategia de implementación."
---

# Plan técnico: de intención a decisiones de diseño

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Traducir requisitos en decisiones.
- Documentar alternativas/trade-offs.
- Mantener trazabilidad.
- Producir un plan suficientemente preciso.

## Conceptos esenciales

- **Architecture:** componentes y responsabilidades
- **Technical constraint:** condición obligatoria
- **Research:** evidencia para decidir
- **Trade-off:** costo aceptado
- **Interface:** frontera observable

## Desarrollo técnico

### Planificar no es listar tecnologías

Un plan explica cómo el diseño satisface requisitos.

### Decisiones reversibles e irreversibles

Profundizar schema, protocolo, seguridad, particionamiento y contratos externos.

### Trazabilidad

Cada decisión principal debe apuntar a requisitos; si no satisface ninguno, puede ser sobreingeniería.

## Ejemplo aplicado

| Decisión | Requisito | Alternativas | Motivo |
|---|---|---|---|
| REST versionada | compatibilidad | GraphQL | consumidores |
| idempotency key | retry seguro | lock global | escala |
| storage cifrado | privacidad | texto plano | política |

## Práctica guiada

A partir de 5 requisitos, redactá un plan con componentes, interfaces, riesgos, decisiones y evidencia.

## Errores frecuentes y cómo evitarlos

- Planificar antes de clarificar.
- Elegir herramientas por familiaridad.
- No declarar alternativas relevantes.

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
- [Microsoft — Diving Into Spec-Driven Development With GitHub Spec Kit](https://developer.microsoft.com/blog/spec-driven-development-spec-kit/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
