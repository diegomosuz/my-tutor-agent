---
title: "Contratos, modelos de datos y artefactos de interfaz"
order: 4
description: "Especificación de fronteras observables para desacoplar equipos y agentes."
---

# Contratos, modelos de datos y artefactos de interfaz

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Reconocer cuándo un contrato es crítico.
- Definir schemas y errores.
- Aplicar compatibilidad/versionado.
- Usar contract tests.

## Conceptos esenciales

- **API contract:** operaciones/payloads/errores
- **Schema:** estructura y restricciones
- **Compatibility:** evolución sin romper consumidores
- **Idempotency:** mismo efecto ante retry
- **Contract test:** prueba de obligaciones

## Desarrollo técnico

### Diseñar frontera antes que interior

Cuando componentes evolucionan independientemente, acordar contrato temprano evita interfaces divergentes.

### Errores son parte del contrato

Estados, retryability, idempotencia y opcionalidad importan tanto como el caso exitoso.

### Evolución

Agregar campos opcionales suele ser compatible; cambiar semántica puede no serlo.

## Ejemplo aplicado

```yaml
POST /v1/reports
response:
  202: {job_id: "..."}
errors:
  400: invalid_range
  403: forbidden
  409: duplicate_request
```

## Práctica guiada

Diseñá el contrato mínimo de una operación asíncrona: request, respuesta, consulta de estado, errores e idempotencia.

## Errores frecuentes y cómo evitarlos

- Definir solo ejemplos.
- No versionar interfaces públicas.
- Cambiar semántica manteniendo el mismo campo.

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
- [Kiro Docs — Specs](https://kiro.dev/docs/specs/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
