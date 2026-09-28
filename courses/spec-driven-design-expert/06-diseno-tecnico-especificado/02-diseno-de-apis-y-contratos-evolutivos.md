---
title: "Diseño de APIs y contratos evolutivos"
order: 2
description: "Patrones de compatibilidad, versionado, idempotencia y errores."
---

# Diseño de APIs y contratos evolutivos

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Especificar contratos antes de consumidores.
- Diseñar errores como parte de API.
- Planificar evolución compatible.
- Verificar retry semantics.

## Conceptos esenciales

- **Backward compatibility:** no romper consumidores existentes
- **Semantic versioning:** comunicación de compatibilidad
- **Idempotency key:** identidad de operación
- **Error model:** estructura consistente
- **Deprecation:** retiro planificado

## Desarrollo técnico

### Contract first

Reduce dependencias de calendario y evita interfaces divergentes.

### Compatibilidad semántica

Un schema puede validar y aun cambiar significado; la spec debe proteger semántica.

### Retiro seguro

Deprecation necesita observabilidad de uso, fecha objetivo y comunicación.

## Ejemplo aplicado

```json
{
  "error": {
    "code": "REPORT_NOT_READY",
    "retryable": true,
    "correlation_id": "..."
  }
}
```

## Práctica guiada

Evolucioná una API v1 agregando capacidad sin romper clientes viejos. Documentá cambios compatibles, deprecated y breaking.

## Errores frecuentes y cómo evitarlos

- Usar 500 para todos los errores.
- No especificar retryability.
- Cambiar enums sin compatibilidad.

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

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
