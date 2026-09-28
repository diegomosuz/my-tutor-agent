---
title: "Anatomía de una spec de alta calidad"
order: 2
description: "Estructura mínima para describir un cambio de forma clara y verificable."
---

# Anatomía de una spec de alta calidad

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Organizar una spec tool-neutral.
- Distinguir secciones imprescindibles.
- Mantener separación intención/diseño.
- Revisar completitud.

## Conceptos esenciales

- **Context:** por qué existe el cambio
- **Goals:** resultados
- **Non-goals:** fronteras
- **Scenarios:** comportamientos
- **Requirements:** obligaciones
- **Risks:** situaciones críticas

## Desarrollo técnico

### Narrativa estructurada

Debe permitir comprender problema, actores, comportamiento y límites sin leer código.

### Separación de capas

Tecnologías pertenecen al plan salvo que sean restricciones.

### Criterio de suficiencia

Está lista cuando escenarios críticos no dependen de interpretación privada.

## Ejemplo aplicado

```markdown
# Feature
## Contexto
## Objetivos
## No objetivos
## Actores
## Escenarios
## Requisitos
## NFR
## Aceptación
## Riesgos y preguntas
## Evidencia requerida
```

## Práctica guiada

Auditá una spec propia: marcá intención, comportamiento, restricciones, diseño y evidencia. Mové todo lo que esté en la capa incorrecta.

## Errores frecuentes y cómo evitarlos

- Títulos sin contenido verificable.
- Arquitectura dentro de requisitos.
- No declarar non-goals.

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
