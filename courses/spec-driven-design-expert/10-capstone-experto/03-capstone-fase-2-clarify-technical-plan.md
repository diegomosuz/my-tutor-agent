---
title: "Capstone Fase 2: Clarify + Technical Plan"
order: 3
description: "Resolver preguntas y diseñar arquitectura, datos, contratos y rollout."
---

# Capstone Fase 2: Clarify + Technical Plan

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Cerrar ambigüedades críticas.
- Diseñar solución justificable.
- Producir contratos.
- Definir rollout/rollback.

## Conceptos esenciales

- **Clarification:** resolución explícita
- **Plan:** arquitectura/trade-offs
- **Contract:** API/schema observable
- **ADR:** rationale duradero
- **Rollout:** transición a producción

## Desarrollo técnico

### Clarify

Resolver quién descarga, retención, compatibilidad legacy y retry.

### Plan

Diseñar job asíncrono, storage, estado, seguridad y observabilidad.

### Operación

Incluir migration path, feature flags si aplican y rollback.

## Ejemplo aplicado

### Artefactos
- `plan.md`
- `research.md`
- `contracts/openapi.yaml`
- `data-model.md`
- `adr/ADR-001-async-processing.md`
- `rollout.md`

## Práctica guiada

Implementá el plan documental y hacé una review adversarial: buscá requisitos no satisfechos y componentes sin justificación.

## Errores frecuentes y cómo evitarlos

- Diseño ornamental.
- Errores/retry ausentes.
- Rollback ficticio.

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
- [Microsoft — Diving Into Spec-Driven Development With GitHub Spec Kit](https://developer.microsoft.com/blog/spec-driven-development-spec-kit/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
