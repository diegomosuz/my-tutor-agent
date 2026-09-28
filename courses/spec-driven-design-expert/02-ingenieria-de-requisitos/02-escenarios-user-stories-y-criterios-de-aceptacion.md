---
title: "Escenarios, user stories y criterios de aceptación"
order: 2
description: "Técnicas para especificar comportamiento sin convertir requisitos en implementación."
---

# Escenarios, user stories y criterios de aceptación

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Escribir escenarios verificables.
- Usar user stories cuando aportan contexto.
- Crear aceptación positiva, negativa y de borde.
- Diferenciar requisito de ejemplo.

## Conceptos esenciales

- **Scenario:** secuencia concreta de comportamiento
- **Acceptance criterion:** condición para aceptar
- **Happy path:** flujo principal
- **Negative path:** entrada/estado inválido
- **Edge case:** caso extremo relevante

## Desarrollo técnico

### Escenarios comprimen ambigüedad

Obligan a concretar actor, precondición, acción y resultado.

### Criterios verificables

Evitar 'intuitivo' o 'rápido' sin método de verificación.

### No convertir escenario en algoritmo

El requisito describe comportamiento observable; DB/framework pertenecen al plan.

## Ejemplo aplicado

```gherkin
Scenario: usuario bloqueado intenta autenticarse
  Given una cuenta bloqueada
  When envía credenciales correctas
  Then la sesión no se crea
  And se registra el evento de auditoría
```

## Práctica guiada

Escribí 6 escenarios de recuperación de contraseña: 2 happy path, 2 negativos y 2 edge cases.

## Errores frecuentes y cómo evitarlos

- Usar Given/When/Then como decoración.
- Describir llamadas internas.
- No cubrir errores.

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

- [Microsoft Learn — Spec-driven development with GitHub Spec Kit](https://learn.microsoft.com/es-es/training/modules/spec-driven-development-github-spec-kit-enterprise-developers/)
- [GitHub Spec Kit — Quickstart](https://github.com/github/spec-kit/blob/main/docs/quickstart.md)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
