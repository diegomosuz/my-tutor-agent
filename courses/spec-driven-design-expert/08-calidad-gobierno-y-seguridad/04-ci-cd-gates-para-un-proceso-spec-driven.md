---
title: "CI/CD gates para un proceso spec-driven"
order: 4
description: "Automatización de consistencia, calidad y seguridad."
---

# CI/CD gates para un proceso spec-driven

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Diseñar gates automatizables.
- Separar blocking/warning.
- Evitar pipelines frágiles.
- Mantener trazabilidad en PRs.

## Conceptos esenciales

- **Pre-merge gate:** control antes de integrar
- **Release gate:** antes de publicar
- **Policy-as-code:** reglas automáticas
- **Artifact validation:** verificación estructural
- **Evidence bundle:** resultados asociados

## Desarrollo técnico

### Automatizar lo determinístico

Schemas, tests, lint, contracts y scans son buenos gates.

### Severity

No todo bloquea; warnings ayudan a madurar reglas.

### Evidence in PR

El PR enlaza spec, tasks, ADRs y pruebas.

## Ejemplo aplicado

```text
PR
├─ spec link
├─ schema validate
├─ tests
├─ security scan
├─ migration dry-run
└─ reviewer approval
```

## Práctica guiada

Diseñá 6 gates y clasificá cada uno blocking/warning/manual.

## Errores frecuentes y cómo evitarlos

- Reglas ruidosas bloqueantes.
- Automatizar semántica no confiable.
- Policy sin versionado.

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

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
