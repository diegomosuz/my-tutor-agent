---
title: "Cuándo usar SDD y cuándo mantenerlo liviano"
order: 5
description: "Criterios de proporcionalidad para evitar improvisación y ceremonia excesiva."
---

# Cuándo usar SDD y cuándo mantenerlo liviano

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Dimensionar el nivel de especificación según riesgo.
- Identificar features que requieren SDD completo.
- Diseñar una variante liviana.
- Establecer señales para escalar de quick spec a spec completa.

## Conceptos esenciales

- **Reversibilidad:** costo de deshacer una decisión
- **Blast radius:** usuarios/sistemas/datos afectados
- **Ambigüedad:** interpretaciones plausibles
- **Coordinación:** actores/equipos involucrados
- **Evidence burden:** nivel de prueba requerido

## Desarrollo técnico

### La spec debe ser proporcional

Un cambio de copy no requiere el mismo proceso que una migración de pagos.

### Señales de mayor rigor

Múltiples equipos, datos sensibles, cambios de schema, compatibilidad externa, regulación o migraciones elevan la necesidad de SDD.

### Fast path seguro

Un quick spec puede contener objetivo, alcance/no alcance, aceptación y plan mínimo. Si aparecen riesgos irreversibles, se promueve a flujo completo.

## Ejemplo aplicado

| Riesgo | Ambigüedad | Coordinación | Enfoque |
|---|---|---|---|
| bajo | baja | 1 dev | prompt + aceptación |
| medio | media | equipo | mini-spec + plan |
| alto | alta | multi-equipo | SDD completo + gates |
| crítico | alta | regulado | SDD + contratos + evidencia auditable |

## Práctica guiada

Clasificá cinco cambios de backlog usando riesgo, ambigüedad, reversibilidad y coordinación. Elegí el nivel mínimo de SDD adecuado.

## Errores frecuentes y cómo evitarlos

- Aplicar flujo completo a cambios triviales.
- Usar 'es pequeño' como excusa cuando el blast radius es grande.
- No subir el rigor cuando aparecen nuevos riesgos.

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

- [Kiro Docs — Specs](https://kiro.dev/docs/specs/)
- [GitHub Spec Kit — Spec of Specs](https://github.com/github/spec-kit/blob/main/docs/concepts/spec-of-specs.md)
- [GitHub Spec Kit — What is Spec-Driven Development?](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
