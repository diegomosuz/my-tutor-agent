---
title: "Reverse engineering de intención y reglas de negocio"
order: 2
description: "Cómo recuperar comportamiento y restricciones cuando no existe spec confiable."
---

# Reverse engineering de intención y reglas de negocio

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Separar evidencia de inferencia.
- Usar múltiples fuentes.
- Documentar incertidumbre.
- Crear baseline revisable.

## Conceptos esenciales

- **Observed behavior:** lo que hace hoy
- **Inferred intent:** hipótesis del porqué
- **Business rule:** regla de decisión
- **Evidence source:** fuente de respaldo
- **Confidence:** certeza

## Desarrollo técnico

### Código no es intención

Puede contener bugs, workarounds y deuda.

### Triangulación

Comparar tests, tickets, logs, usuarios y código; desacuerdos son información.

### Baseline explícita

Escribir qué preservar, qué está en duda y qué se cambiará deliberadamente.

## Ejemplo aplicado

| Hallazgo | Fuente | Tipo | Confianza |
|---|---|---|---|
| límite 500 | código + test | observado | alta |
| razón regulatoria | ticket antiguo | inferido | media |
| excepción VIP | producción | observado | alta |

## Práctica guiada

Reconstruí 5 reglas de negocio de un módulo y etiquetá evidencia/confianza.

## Errores frecuentes y cómo evitarlos

- Copiar ifs como reglas sin contexto.
- Ignorar producción.
- Ocultar incertidumbre.

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

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
