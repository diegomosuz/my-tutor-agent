---
title: "Tasks, Implement y Converge"
order: 5
description: "Ejecución controlada y cierre del loop entre spec y código."
---

# Tasks, Implement y Converge

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Crear tasks con evidencia.
- Ejecutar en batches.
- Comprender converge.
- Definir stop conditions.

## Conceptos esenciales

- **Implement:** ejecución contra artefactos
- **Converge:** detección/corrección de gaps
- **Batch size:** trabajo por iteración
- **Evidence:** pruebas/build/review
- **Stop condition:** criterio de cierre

## Desarrollo técnico

### No ejecutar todo ciegamente

Limitar batches cuando riesgo o contexto es grande reduce drift acumulativo.

### Convergence loop

Implementar, verificar gaps, corregir y repetir.

### Cerrar con evidencia

'El agente terminó' no es criterio; suite, build, contracts y revisión sí.

## Ejemplo aplicado

```text
TASKS → IMPLEMENT → VERIFY → CONVERGE?
                    ↑           │
                    └── fix gaps┘
```

## Práctica guiada

Definí un stop condition para una feature web: tests, build, seguridad, UX, compatibilidad y evidencia de aceptación.

## Errores frecuentes y cómo evitarlos

- Implementar todos los tasks sin checkpoints.
- Confundir tests verdes con spec satisfecha.
- Modificar spec para justificar código.

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
- [GitHub Spec Kit — documentación oficial](https://github.github.com/spec-kit/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
