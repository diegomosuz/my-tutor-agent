---
title: "Success criteria y definición de evidencia"
order: 5
description: "Cómo conectar requisitos con pruebas, métricas y señales observables."
---

# Success criteria y definición de evidencia

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Definir criterios de éxito medibles.
- Asignar evidencia a requisitos críticos.
- Distinguir aceptación técnica de éxito de producto.
- Crear matriz requirement→evidence.

## Conceptos esenciales

- **Success criterion:** condición que indica logro
- **Verification:** prueba de cumplimiento
- **Validation:** evidencia de resolver el problema correcto
- **Traceability:** seguimiento requisito→diseño→test
- **Evidence owner:** responsable de producir/revisar evidencia

## Desarrollo técnico

### Dos niveles de éxito

Una feature puede pasar tests y no generar el outcome esperado.

### Evidence by design

Si un criterio no tiene método de verificación, probablemente todavía es ambiguo.

### Evitar métricas decorativas

Elegir pocas señales ligadas a hipótesis y riesgos.

## Ejemplo aplicado

| Requisito | Evidencia | Momento |
|---|---|---|
| XLSX válido | integration test + apertura | CI |
| p95 < 2 s | load test | pre-release |
| solo auditor accede | auth tests | CI |
| reduce tiempo operativo | métrica de proceso | post-release |

## Práctica guiada

Construí una matriz de trazabilidad para 6 requisitos. Ningún requisito crítico puede quedar sin evidencia.

## Errores frecuentes y cómo evitarlos

- Confundir test coverage con requirement coverage.
- Definir métricas imposibles de obtener.
- Dejar validación de negocio para después.

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
- [GitHub Spec Kit — documentación oficial](https://github.github.com/spec-kit/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
