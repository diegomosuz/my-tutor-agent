---
title: "Human-in-the-loop y evolución de specs"
order: 5
description: "Checkpoints de alto valor y control de cambios durante ejecución."
---

# Human-in-the-loop y evolución de specs

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Diseñar gates de alto impacto.
- Evitar approval fatigue.
- Clasificar change requests.
- Mantener historial/rationale.

## Conceptos esenciales

- **Decision gate:** aprobación de decisión importante
- **Approval fatigue:** pérdida de atención
- **Change request:** nueva intención
- **Spec bug:** spec incorrecta/incompleta
- **Code drift:** código viola spec

## Desarrollo técnico

### Menos gates, mejores gates

Concentrar revisión en alcance, interfaces, migraciones, seguridad y release.

### Clasificar cambios

Si cambia negocio, actualizar spec; si código se desvía, corregir código; si spec era ambigua, aclarar y reconciliar.

### Historial

Cambios significativos deben quedar trazables para explicar por qué cambió el contrato.

## Ejemplo aplicado

| Gate | Evidencia |
|---|---|
| scope/spec | escenarios + non-goals |
| architecture | plan + ADR |
| migration | dry-run + rollback |
| release | tests + observabilidad |

## Práctica guiada

Diseñá máximo 4 checkpoints para una feature crítica y simulá un change request tardío.

## Errores frecuentes y cómo evitarlos

- Aprobación para cada comando.
- No revisar acciones irreversibles.
- Editar spec para justificar un bug.

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
- [GitHub Spec Kit — What is Spec-Driven Development?](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
