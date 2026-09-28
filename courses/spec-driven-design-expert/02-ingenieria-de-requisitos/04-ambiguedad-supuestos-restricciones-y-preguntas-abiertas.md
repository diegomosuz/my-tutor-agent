---
title: "Ambigüedad, supuestos, restricciones y preguntas abiertas"
order: 4
description: "Disciplina de clarificación para evitar que el agente rellene vacíos silenciosamente."
---

# Ambigüedad, supuestos, restricciones y preguntas abiertas

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Clasificar incertidumbres.
- Convertir supuestos en decisiones explícitas.
- Priorizar preguntas por impacto.
- Distinguir restricción de preferencia.

## Conceptos esenciales

- **Ambiguity:** más de una interpretación razonable
- **Assumption:** hecho no confirmado usado para avanzar
- **Constraint:** condición que no puede violarse
- **Open question:** decisión pendiente
- **Decision log:** registro de resolución

## Desarrollo técnico

### No todas las preguntas valen igual

Priorizar dudas que cambian alcance, arquitectura, seguridad, contratos o aceptación.

### Supuestos visibles

Si hay que avanzar, el supuesto se escribe con impacto y condición de revisión.

### Restricción vs preferencia

'On-prem por política' es restricción; 'preferimos PostgreSQL' puede ser preferencia.

## Ejemplo aplicado

| ID | Tipo | Pregunta / supuesto | Impacto | Estado |
|---|---|---|---|---|
| Q1 | open question | ¿incluye PII? | alto | resuelto |
| A1 | assumption | máximo 50k filas | medio | validar |
| C1 | constraint | SSO obligatorio | alto | fijo |

## Práctica guiada

Creá 12 incertidumbres para un sistema de aprobación de gastos. Clasificalas y elegí las 5 que deben resolverse antes de diseñar.

## Errores frecuentes y cómo evitarlos

- Ocultar supuestos.
- Resolver primero dudas de bajo impacto.
- Tratar restricciones temporales como eternas.

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
