---
title: "Requisitos funcionales y no funcionales"
order: 3
description: "Cómo especificar comportamiento, atributos de calidad y restricciones operativas."
---

# Requisitos funcionales y no funcionales

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Separar comportamiento de atributos de calidad.
- Convertir NFR vagos en criterios mensurables.
- Priorizar NFR por riesgo.
- Detectar conflictos.

## Conceptos esenciales

- **Functional requirement:** capacidad observable
- **Quality attribute:** seguridad, performance, disponibilidad, etc.
- **Constraint:** límite no negociable
- **SLO:** objetivo medible
- **Trade-off:** tensión entre propiedades

## Desarrollo técnico

### Los NFR también son producto

Performance, resiliencia y seguridad cambian experiencia, riesgo y costo.

### Especificar bajo contexto

Incluir población, período, operación y excepción.

### Trade-offs explícitos

Una spec madura reconoce tensiones como consistencia vs disponibilidad o latencia vs costo.

## Ejemplo aplicado

| Atributo | Débil | Verificable |
|---|---|---|
| Performance | “rápido” | p95 < 300 ms |
| Seguridad | “seguro” | MFA para roles privilegiados |
| Resiliencia | “robusto” | retry idempotente |
| Observabilidad | “monitoreable” | trace-id por request |

## Práctica guiada

Redactá 8 NFR para una feature: seguridad, performance, disponibilidad, recoverability, observabilidad, privacidad, accesibilidad y mantenibilidad.

## Errores frecuentes y cómo evitarlos

- Copiar NFR genéricos.
- Poner objetivos imposibles de medir.
- Convertir deseos en críticos.

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

- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)
- [Kiro Docs — Specs](https://kiro.dev/docs/specs/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
