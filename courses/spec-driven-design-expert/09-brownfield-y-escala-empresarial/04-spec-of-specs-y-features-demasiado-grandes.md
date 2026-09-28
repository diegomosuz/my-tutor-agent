---
title: "Spec of Specs y features demasiado grandes"
order: 4
description: "Decomposición de iniciativas grandes sin perder coherencia global."
---

# Spec of Specs y features demasiado grandes

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Reconocer cuándo una spec única excede contexto.
- Crear roadmap de sub-specs.
- Mantener contratos entre sub-features.
- Evitar sobreusar decomposición.

## Conceptos esenciales

- **Spec of Specs:** roadmap de specs independientes
- **Sub-feature:** unidad con outcome propio
- **Cross-spec contract:** interfaz compartida
- **Dependency graph:** orden
- **Integration milestone:** punto de convergencia

## Desarrollo técnico

### Último recurso

La documentación recomienda primero batches pequeños y delegación; decomponer agrega overhead.

### Independencia real

Cada sub-spec debe poder razonarse sin cargar toda la iniciativa.

### Contratos globales

Identidad, eventos, schemas y guardrails compartidos estabilizan paralelismo.

## Ejemplo aplicado

```text
Roadmap
├─ Spec A: identity
├─ Spec B: reports
├─ Spec C: notifications
└─ Spec D: admin UI
```

## Práctica guiada

Tomá una iniciativa grande y diseñá 4–6 sub-specs con objetivos, dependencias y contratos.

## Errores frecuentes y cómo evitarlos

- Sub-spec por microservicio automáticamente.
- Duplicar requisitos globales.
- No definir integration milestones.

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

- [GitHub Spec Kit — Spec of Specs](https://github.com/github/spec-kit/blob/main/docs/concepts/spec-of-specs.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
