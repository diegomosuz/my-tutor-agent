---
title: "Constitution, Specify y Clarify"
order: 3
description: "Cómo construir intención y resolver ambigüedad con los primeros gates."
---

# Constitution, Specify y Clarify

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Usar constitution para principios persistentes.
- Escribir specify centrado en qué/por qué.
- Usar clarify para preguntas críticas.
- Saber cuándo detenerse antes de plan.

## Conceptos esenciales

- **Constitution:** guardrails globales
- **Specify:** requisitos/escenarios
- **Clarify:** reducción focalizada de ambigüedad
- **Context boundary:** separación necesidad/solución
- **Gate:** revisión explícita

## Desarrollo técnico

### Constitution una vez, specs muchas

La constitución cambia menos que las features.

### Specify sin stack

La guía oficial enfatiza qué y porqué antes de tecnología.

### Clarify con impacto

Se usa cuando la decisión cambia comportamiento, riesgo, arquitectura o contratos.

## Ejemplo aplicado

**Débil:** “Construí API FastAPI + PostgreSQL + Redis”.

**Mejor:** “Los analistas deben lanzar reportes auditables en segundo plano, consultar estado y descargar el resultado durante 30 días; reintentos no deben duplicar trabajos.”

## Práctica guiada

Redactá una entrada specify y después 8 preguntas de clarificación. Conservá solo las 4 de mayor impacto.

## Errores frecuentes y cómo evitarlos

- Poner stack en la spec sin necesidad.
- Usar clarify para reescribir todo.
- Avanzar con una pregunta crítica abierta.

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
