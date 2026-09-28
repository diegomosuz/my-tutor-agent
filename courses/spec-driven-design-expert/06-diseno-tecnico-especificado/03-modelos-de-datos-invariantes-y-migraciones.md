---
title: "Modelos de datos, invariantes y migraciones"
order: 3
description: "Cómo especificar estado persistente, invariantes y evolución segura."
---

# Modelos de datos, invariantes y migraciones

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Definir invariantes antes del schema físico.
- Separar modelo conceptual de storage.
- Diseñar migraciones seguras.
- Especificar integridad/ownership.

## Conceptos esenciales

- **Invariant:** condición que siempre debe cumplirse
- **Entity:** identidad persistente
- **Value object:** valor por atributos
- **Migration:** transformación versionada
- **Rollback:** retorno a estado seguro

## Desarrollo técnico

### Primero semántica

El schema físico viene después de entidades, relaciones e invariantes.

### Migraciones como feature

Cambiar datos requiere precondiciones, fases, compatibilidad temporal y observabilidad.

### Transiciones controladas

Dual read/write solo se justifica cuando rollout/reversibilidad lo exige.

## Ejemplo aplicado

```text
Invariant: un ReportJob terminado debe tener output_uri.
Invariant: un ReportJob cancelado no puede pasar a COMPLETED.
Migration: nullable → backfill → validate → NOT NULL.
```

## Práctica guiada

Escribí 6 invariantes para órdenes y diseñá una migración de opcional a obligatorio sin downtime.

## Errores frecuentes y cómo evitarlos

- Confiar solo en UI validation.
- Migraciones destructivas sin rollback.
- Ignorar datos históricos inconsistentes.

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

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
