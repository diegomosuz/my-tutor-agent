---
title: "Review de specs y quality checklists"
order: 1
description: "Cómo revisar una spec antes de autorizar diseño o implementación."
---

# Review de specs y quality checklists

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Crear checklists específicas.
- Detectar contradicciones.
- Revisar errores/límites.
- Separar calidad de estilo.

## Conceptos esenciales

- **Completeness:** cobertura suficiente
- **Consistency:** sin contradicciones
- **Testability:** verificabilidad
- **Atomicity:** obligaciones claras
- **Review gate:** condición para avanzar

## Desarrollo técnico

### Checklist contextual

Pagos y landing pages no comparten el mismo riesgo.

### Revisar negativos

Autorización, límites, retries y timeouts suelen faltar.

### Estilo vs calidad

Buena redacción no garantiza requisitos verificables.

## Ejemplo aplicado

- [ ] cada requisito crítico tiene evidencia
- [ ] errores y estados inválidos están especificados
- [ ] non-goals no aparecen en tasks
- [ ] NFR críticos tienen umbral
- [ ] no hay decisiones técnicas escondidas

## Práctica guiada

Creá un checklist de 15 ítems para una feature con datos sensibles.

## Errores frecuentes y cómo evitarlos

- Checklist genérico.
- Marcar sin evidencia.
- Review solo por el autor.

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
- [Microsoft Learn — Spec-driven development with GitHub Spec Kit](https://learn.microsoft.com/es-es/training/modules/spec-driven-development-github-spec-kit-enterprise-developers/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
