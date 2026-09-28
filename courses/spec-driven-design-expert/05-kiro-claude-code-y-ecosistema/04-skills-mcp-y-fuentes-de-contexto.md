---
title: "Skills, MCP y fuentes de contexto"
order: 4
description: "Cómo enriquecer el contexto sin perder autoridad ni trazabilidad."
---

# Skills, MCP y fuentes de contexto

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Distinguir fuente autoritativa de contexto auxiliar.
- Diseñar skills transparentes.
- Usar MCP con límites.
- Evitar stale context.

## Conceptos esenciales

- **Authoritative source:** puede definir verdad
- **Context source:** orienta pero no manda
- **MCP:** conecta herramientas y fuentes
- **Skill:** procedimiento reusable
- **Freshness:** vigencia temporal

## Desarrollo técnico

### Jerarquía de autoridad

Policy/contract/spec pueden tener precedencia sobre tickets o chats.

### MCP como acceso, no verdad

Conectar un sistema no vuelve autoritativa toda respuesta.

### Curación

Más contexto puede empeorar si es redundante o contradictorio.

## Ejemplo aplicado

```text
Policy/Contract ── authoritative
Spec ───────────── authoritative for feature
Issue/Chat ─────── contextual
Logs/Metrics ───── evidence
```

## Práctica guiada

Listá 10 fuentes de tu entorno y clasificá autoridad, freshness y sensibilidad. Definí resolución de conflictos.

## Errores frecuentes y cómo evitarlos

- Tratar tickets como verdad eterna.
- Dar acceso MCP excesivo.
- No clasificar datos sensibles.

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
- [AWS — Kiro Documentation Overview](https://aws.amazon.com/documentation-overview/kiro/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
