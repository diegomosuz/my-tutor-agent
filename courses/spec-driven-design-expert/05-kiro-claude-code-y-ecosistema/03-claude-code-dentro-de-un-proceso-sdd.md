---
title: "Claude Code dentro de un proceso SDD"
order: 3
description: "Uso de plan mode, CLAUDE.md, skills y revisión explícita."
---

# Claude Code dentro de un proceso SDD

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Usar CLAUDE.md como briefing, no feature spec.
- Separar exploración/plan/ejecución.
- Convertir prácticas repetibles en skills.
- Mantener checkpoints humanos.

## Conceptos esenciales

- **CLAUDE.md:** contexto persistente del repo
- **Plan mode:** plan antes de editar
- **Skill:** procedimiento reusable
- **Tool allowlist:** límites de acciones
- **Course correction:** intervención temprana

## Desarrollo técnico

### CLAUDE.md no reemplaza specs

Contiene comandos, convenciones, arquitectura estable y reglas.

### Explore→plan→code→commit

La recomendación de Anthropic encaja naturalmente con SDD.

### Skills

Encapsulan procedimientos repetibles sin convertirlos en memoria invisible.

## Ejemplo aplicado

```markdown
# CLAUDE.md
## Comandos
- pytest -q
- npm test -- --run
## Reglas
- no force-push
- leer spec antes de implementar
```

## Práctica guiada

Diseñá un CLAUDE.md de máximo 150 líneas y separá reglas persistentes de requisitos de una feature.

## Errores frecuentes y cómo evitarlos

- Volcar documentación completa.
- Permisos peligrosos por comodidad.
- Auto-accept en cambios irreversibles.

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

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
