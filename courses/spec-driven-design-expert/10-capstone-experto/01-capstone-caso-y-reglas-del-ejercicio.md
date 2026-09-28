---
title: "Capstone: caso y reglas del ejercicio"
order: 1
description: "Proyecto integral para demostrar dominio de SDD desde intención hasta release."
---

# Capstone: caso y reglas del ejercicio

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Comprender el escenario.
- Identificar stakeholders/riesgos.
- Definir entregables.
- Planificar por fases.

## Conceptos esenciales

- **Case:** plataforma de exportación y auditoría
- **Actors:** analista, auditor, admin, operador
- **Constraints:** seguridad, trazabilidad, compatibilidad
- **Deliverables:** spec, plan, contracts, tasks, tests
- **Evaluation:** claridad, trazabilidad, evidencia

## Desarrollo técnico

### Escenario

Una organización necesita generar reportes de auditoría grandes sin bloquear UI, con retención limitada y acceso por rol. Existe API legacy síncrona.

### Tensiones

Preservar consumidores legacy, evitar duplicación ante retry, cumplir retención y observabilidad.

### Regla principal

No se evalúa cantidad de documentos; se evalúan coherencia, verificabilidad y trazabilidad.

## Ejemplo aplicado

### Constraints iniciales
- API legacy no puede romperse durante 90 días.
- reportes pueden tardar hasta 10 minutos.
- datos contienen PII.
- máximo 50k filas.
- auditor necesita historial.
- backend corre con 2 instancias.

## Práctica guiada

Creá `specs/001-audit-reports/` y un registro inicial de preguntas abiertas. No implementes código.

## Errores frecuentes y cómo evitarlos

- Empezar por framework.
- Evitar restricciones difíciles.
- Generar artefactos sin revisar.

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

- [GitHub Spec Kit — documentación oficial](https://github.github.com/spec-kit/)
- [Kiro Docs — Specs](https://kiro.dev/docs/specs/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
