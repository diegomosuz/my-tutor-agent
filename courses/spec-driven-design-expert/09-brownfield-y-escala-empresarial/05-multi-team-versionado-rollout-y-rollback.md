---
title: "Multi-team, versionado, rollout y rollback"
order: 5
description: "Gobernanza de contratos y releases cuando varios equipos comparten sistemas."
---

# Multi-team, versionado, rollout y rollback

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Definir ownership de artefactos.
- Separar contratos de implementación.
- Diseñar gates cross-team.
- Especificar rollout/rollback.

## Conceptos esenciales

- **Service owner:** responsable del contrato
- **Shared contract:** artefacto versionado
- **Compatibility window:** coexistencia
- **Canary:** rollout parcial
- **Release gate:** condición para ampliar

## Desarrollo técnico

### Ownership explícito

Cada spec/contrato necesita owner.

### Asincronía mediante artefactos

Specs y contratos de calidad reducen reuniones y hacen decisiones revisables.

### Producción es parte del diseño

Rollout, feature flags, canary, data compatibility y rollback pertenecen al plan.

## Ejemplo aplicado

| Artefacto | Owner | Revisores |
|---|---|---|
| feature spec | team A | product |
| API contract | service owner | consumers |
| migration plan | data owner | ops/security |
| release evidence | deploy owner | on-call |

## Práctica guiada

Diseñá un RACI simplificado y un rollout 5%→25%→100% con gates y rollback.

## Errores frecuentes y cómo evitarlos

- Contratos sin owner.
- Aprobación de todos para todo.
- Rollback que ignora datos nuevos.

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

- [GitHub Spec Kit — What is Spec-Driven Development?](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md)
- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
