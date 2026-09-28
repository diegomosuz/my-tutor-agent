---
title: "SDD frente a Prompt-Driven, TDD, BDD y Contract-Driven"
order: 4
description: "Comparación rigurosa de prácticas complementarias y sus límites."
---

# SDD frente a Prompt-Driven, TDD, BDD y Contract-Driven

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Distinguir disciplinas que suelen confundirse con SDD.
- Combinar SDD con TDD/BDD.
- Reconocer cuándo Contract-Driven es prioritario.
- Evitar usar una metodología como sustituto de otra.

## Conceptos esenciales

- **Prompt-Driven:** la conversación es el principal artefacto
- **TDD:** tests guían diseño incremental
- **BDD:** comportamientos expresados como escenarios
- **Contract-Driven:** interfaces observables acordadas antes de implementar
- **SDD:** intención completa guía diseño, implementación y validación

## Desarrollo técnico

### No son rivales directos

SDD opera a nivel de intención, requisitos, diseño y trazabilidad. TDD trabaja cerca de la implementación; BDD puede expresar escenarios; Contract-Driven protege fronteras.

### Composición práctica

Una feature puede usar SDD para intención, OpenAPI como contrato, BDD para escenarios y TDD para componentes.

### Elegir por riesgo

Cuanto mayor el costo de interpretar mal el problema, más valor aporta SDD; cuanto mayor el riesgo de interfaz, más importa el contrato.

## Ejemplo aplicado

| Práctica | Pregunta principal | Artefacto típico |
|---|---|---|
| SDD | ¿Qué debemos construir y por qué? | spec / plan / tasks |
| BDD | ¿Cómo se comporta? | Given/When/Then |
| TDD | ¿Cómo diseño código correcto? | tests |
| Contract-Driven | ¿Qué promete la interfaz? | OpenAPI/schema |
| Prompt-Driven | ¿Qué hago ahora? | conversación |

## Práctica guiada

Para una API de pagos, asigná a cada disciplina un artefacto concreto y explicá qué riesgo reduce.

## Errores frecuentes y cómo evitarlos

- Llamar spec de producto a tests unitarios.
- Usar BDD para decisiones de arquitectura.
- Convertir SDD en taxonomía rígida.

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

- [GitHub Spec Kit — What is Spec-Driven Development?](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md)
- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
