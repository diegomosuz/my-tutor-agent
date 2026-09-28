---
title: "Subagentes y paralelismo seguro"
order: 4
description: "Uso de agentes especializados sin perder coherencia."
---

# Subagentes y paralelismo seguro

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Identificar trabajo paralelizable.
- Definir contratos de subagente.
- Evitar conflictos de escritura.
- Consolidar con owner.

## Conceptos esenciales

- **Subagent:** agente con objetivo acotado
- **Read-only investigation:** análisis paralelo seguro
- **Write ownership:** writer único por frontera
- **Merge point:** consolidación
- **Coordinator:** responsable global

## Desarrollo técnico

### Investigar primero

Buscar referencias, revisar tests o alternativas son excelentes tareas paralelas.

### Write ownership

Dos agentes editando el mismo contrato aumentan riesgo semántico.

### Consolidación

El coordinador compara resultados contra la spec; no concatena outputs.

## Ejemplo aplicado

```text
Coordinator
├─ Agent A: API callers (read-only)
├─ Agent B: migration risks (read-only)
├─ Agent C: backend boundary
└─ Agent D: UI después de congelar contrato
```

## Práctica guiada

Diseñá un plan de 4 subagentes indicando read-only, ownership y puntos de sincronización.

## Errores frecuentes y cómo evitarlos

- Paralelizar dependencias ocultas.
- No definir formato de salida.
- Aceptar resultados sin reconciliar.

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
