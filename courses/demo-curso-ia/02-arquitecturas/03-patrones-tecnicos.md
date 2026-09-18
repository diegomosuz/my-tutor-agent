---
title: Patrones técnicos y componentes de referencia
order: 3
description: Ejemplo de tópico con tabla, código, cita y términos técnicos, usado para validar el parser canónico.
---

# Patrones técnicos y componentes de referencia

Este tópico existe principalmente para ejercitar el parser canónico de
Fase 2 con distintos tipos de bloque, además de explicar brevemente algunos
componentes técnicos habituales en soluciones de IA.

## Componentes habituales

La siguiente tabla resume algunos componentes técnicos frecuentes:

| Componente | Función |
| --- | --- |
| API Gateway | Exponer servicios de forma controlada y centralizada |
| Kubernetes | Orquestar el despliegue de contenedores en producción |
| Vector store | Almacenar embeddings para búsquedas de similitud |

## Ejemplo de configuración

A continuación, un fragmento de configuración de ejemplo:

```yaml
service:
  name: modelo-inferencia
  retrieval:
    enabled: true
  fine-tuning:
    enabled: false
```

## Consideración de gobierno

> El fine-tuning de un modelo sobre datos propios de la organización debe
> pasar por el mismo proceso de revisión que cualquier otro cambio de
> modelo en producción.

![Diagrama simplificado de un pipeline de inferencia](https://example.com/diagramas/pipeline-inferencia.png)

## Resumen

- Un API Gateway centraliza el acceso a los servicios del sistema de IA.
- Kubernetes es una opción habitual para orquestar el despliegue.
- El retrieval (recuperación de información) y el fine-tuning son técnicas
  distintas y no deben confundirse entre sí.
