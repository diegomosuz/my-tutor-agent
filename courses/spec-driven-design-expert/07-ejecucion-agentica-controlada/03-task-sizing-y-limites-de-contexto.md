---
title: "Task sizing y límites de contexto"
order: 3
description: "Cómo dividir trabajo para agentes sin fragmentarlo hasta perder coherencia."
---

# Task sizing y límites de contexto

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Estimar tamaño por dependencias.
- Reconocer saturación.
- Usar checkpoints.
- Evitar microtareas.

## Conceptos esenciales

- **Context saturation:** demasiadas decisiones simultáneas
- **Cohesion:** resultado unitario
- **Batch:** grupo de tareas
- **Checkpoint:** estado estable
- **Spec of Specs:** decomposición excepcional

## Desarrollo técnico

### Tamaño por decisión

Una tarea de 20 líneas puede ser compleja si cambia un contrato.

### Señales de división

Olvido de requisitos, mezcla de componentes, relecturas constantes o demasiados 'y también'.

### No sobrefragmentar

Tareas diminutas pierden propósito y aumentan coordinación.

## Ejemplo aplicado

| Señal | Acción |
|---|---|
| >3 contratos modificados | dividir por boundary |
| migration + API + UI | separar fases |
| tarea sin evidencia local | redefinir outcome |
| mismo archivo por 4 agentes | evitar paralelismo |

## Práctica guiada

Clasificá 12 tareas por small/medium/too-large según decisiones y dependencias.

## Errores frecuentes y cómo evitarlos

- Usar nº de archivos como única métrica.
- Subdividir sin outcome.
- Paralelizar con contención.

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
- [Anthropic — Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
