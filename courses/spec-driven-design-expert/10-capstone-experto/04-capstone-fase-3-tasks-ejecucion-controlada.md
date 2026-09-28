---
title: "Capstone Fase 3: Tasks + ejecución controlada"
order: 4
description: "Descomponer y ejecutar en batches con evidencia explícita."
---

# Capstone Fase 3: Tasks + ejecución controlada

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Crear dependency graph.
- Definir batches.
- Identificar checkpoints.
- Evitar contención entre agentes.

## Conceptos esenciales

- **Task graph:** dependencias
- **Batch:** grupo ejecutable
- **Parallel lane:** trabajo independiente
- **Evidence:** prueba por task
- **Checkpoint:** gate

## Desarrollo técnico

### Primero contratos

Congelar fronteras antes de paralelizar consumidores.

### Lotes pequeños

Cada batch debe tener outcome y evidencia.

### Paralelismo

Investigación read-only y componentes independientes; evitar writers múltiples.

## Ejemplo aplicado

```text
T1 contract ──► T2 domain ──► T4 API ──► T7 E2E
                  │
                  └────────► T5 worker
T3 UI skeleton ─────────────► T6 UI integration
```

## Práctica guiada

Generá 15–25 tasks con IDs, dependencia, evidencia y ownership; marcá paralelismo.

## Errores frecuentes y cómo evitarlos

- Tasks tipo 'hacer backend'.
- No incluir tests.
- Paralelizar antes de contratos.

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

- [GitHub Spec Kit — Agentic SDD reference](https://github.com/github/spec-kit/blob/main/docs/reference/agentic-sdd.md)
- [GitHub Spec Kit — Spec of Specs](https://github.com/github/spec-kit/blob/main/docs/concepts/spec-of-specs.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
