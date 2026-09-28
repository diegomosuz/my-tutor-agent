---
title: "Modernización y migraciones dirigidas por specs"
order: 3
description: "Uso de specs para reemplazos, strangler patterns y compatibilidad temporal."
---

# Modernización y migraciones dirigidas por specs

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Definir equivalencia funcional.
- Especificar coexistencia.
- Diseñar cutover/rollback.
- Medir convergencia.

## Conceptos esenciales

- **Behavioral equivalence:** nuevo preserva comportamiento requerido
- **Strangler:** reemplazo incremental
- **Cutover:** cambio de autoridad
- **Dual run:** comparación paralela
- **Rollback plan:** retorno controlado

## Desarrollo técnico

### Target y transición

No basta diseñar el sistema nuevo; hay que especificar convivencia.

### Comparación

Dual run/shadow traffic puede generar evidencia antes del cutover.

### Decommission

Retirar legacy también tiene criterios: tráfico cero, datos migrados y dependencias eliminadas.

## Ejemplo aplicado

```text
Legacy ──────┐
             ├─ router ─► New service
New path ────┘

observe → shadow → partial traffic → full cutover → decommission
```

## Práctica guiada

Diseñá una migración de endpoint legacy con 5 fases, métricas y rollback.

## Errores frecuentes y cómo evitarlos

- Big-bang sin necesidad.
- No definir autoridad en dual-write.
- Retirar legacy sin observar dependencias.

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
