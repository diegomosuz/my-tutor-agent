---
title: "Plan, Checklist y Analyze"
order: 4
description: "Gates para decidir diseño y detectar inconsistencias antes de ejecutar."
---

# Plan, Checklist y Analyze

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Producir plan trazable.
- Usar checklist como tests de requisitos.
- Distinguir checklist de analyze.
- Detectar inconsistencias cross-artifact.

## Conceptos esenciales

- **Plan:** arquitectura y restricciones
- **Checklist:** quality gate específico
- **Analyze:** consistencia spec/plan/tasks
- **Research:** evidencia técnica
- **Cross-artifact:** alineación entre documentos

## Desarrollo técnico

### Plan con justificación

Cada decisión debe conectar con requisitos o guardrails.

### Checklist específico

Detecta huecos antes de convertirlos en tareas.

### Analyze

Busca contradicciones entre artefactos, algo que una revisión aislada no ve.

## Ejemplo aplicado

### Checklist de spec
- [ ] escenarios críticos tienen resultado observable
- [ ] errores no filtran información sensible
- [ ] NFR críticos tienen umbral o verificación
- [ ] no hay requisitos contradictorios
- [ ] non-goals no reaparecen como tasks

## Práctica guiada

Escribí 10 ítems de checklist para importación de archivos. Prohibido usar ítems genéricos como 'usar buenas prácticas'.

## Errores frecuentes y cómo evitarlos

- Checklist que siempre pasa.
- Plan no trazable.
- Usar analyze como sustituto de revisión humana.

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
- [GitHub Spec Kit — Agentic SDD reference](https://github.com/github/spec-kit/blob/main/docs/reference/agentic-sdd.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
