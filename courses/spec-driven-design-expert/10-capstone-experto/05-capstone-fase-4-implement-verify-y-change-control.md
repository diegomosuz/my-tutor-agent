---
title: "Capstone Fase 4: Implement, Verify y Change Control"
order: 5
description: "Ejecutar tareas manteniendo contexto, pruebas y trazabilidad."
---

# Capstone Fase 4: Implement, Verify y Change Control

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Ejecutar batches.
- Mantener context packages.
- Revisar diff/tests.
- Registrar desvíos legítimos.

## Conceptos esenciales

- **Implementation batch:** grupo acotado
- **Context package:** artefactos relevantes
- **Verification command:** evidencia ejecutable
- **Deviation:** diferencia consciente
- **Change control:** actualización coordinada

## Desarrollo técnico

### Implementar con límites

Cada batch empieza revisando tasks y termina con tests y diff.

### Desvíos

Una restricción nueva se clasifica: ¿cambia plan, spec o solo implementación?

### Evidencia acumulativa

Mantener trazabilidad actualizada.

## Ejemplo aplicado

### Checklist por batch
- [ ] contexto correcto
- [ ] tasks exactas
- [ ] tests focalizados
- [ ] diff revisado
- [ ] trazabilidad actualizada
- [ ] sin secrets/debug temporal

## Práctica guiada

Ejecutá al menos 3 batches. Forzá un cambio de diseño y documentá cómo se actualizan artefactos.

## Errores frecuentes y cómo evitarlos

- Sesión única demasiado larga.
- Spec modificada para justificar bug.
- No revisar diff.

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

- [Anthropic — Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [GitHub Spec Kit — Agentic SDD reference](https://github.com/github/spec-kit/blob/main/docs/reference/agentic-sdd.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
