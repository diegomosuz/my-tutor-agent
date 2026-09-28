---
title: "Seguridad, privacidad, compliance y anti-patrones"
order: 5
description: "Cómo integrar obligaciones regulatorias y evitar SDD ceremonial."
---

# Seguridad, privacidad, compliance y anti-patrones

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Convertir políticas en requisitos.
- Especificar sensibilidad/retención.
- Definir evidencia de seguridad.
- Reconocer spec theater.

## Conceptos esenciales

- **Data classification:** sensibilidad
- **Least privilege:** mínimo acceso
- **Retention:** retención/eliminación
- **Audit trail:** evidencia de acciones
- **Spec theater:** documentos que no guían decisiones

## Desarrollo técnico

### Política→requisito

Cifrado, acceso, retención y logging deben volverse obligaciones concretas.

### Privacidad por diseño

Minimización, propósito y eliminación se discuten antes del schema.

### Anti-patrones

Cantidad de páginas no equivale a precisión; generar toda la cadena sin review solo automatiza errores.

## Ejemplo aplicado

| Control | Spec | Evidencia |
|---|---|---|
| least privilege | roles | auth tests |
| retention | 30 días | cleanup test |
| audit | eventos | log assertions |
| encryption | at-rest/in-transit | config scan |

## Práctica guiada

Elegí una feature con PII: documentá propósito, retención, acceso, logging, deletion path y evidencia.

## Errores frecuentes y cómo evitarlos

- Compliance genérico al final.
- Loguear PII por auditabilidad.
- Specs largas sin señal.

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
- [AWS — Kiro Documentation Overview](https://aws.amazon.com/documentation-overview/kiro/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
