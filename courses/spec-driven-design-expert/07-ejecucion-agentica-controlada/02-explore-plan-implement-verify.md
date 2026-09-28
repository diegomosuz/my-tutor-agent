---
title: "Explore → Plan → Implement → Verify"
order: 2
description: "Bucle operativo para reducir errores antes de editar."
---

# Explore → Plan → Implement → Verify

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Separar comprensión de ejecución.
- Definir plan revisable.
- Ejecutar por lotes.
- Cerrar con evidencia.

## Conceptos esenciales

- **Explore:** leer código/artefactos
- **Plan:** cambios antes de editar
- **Implement:** modificación acotada
- **Verify:** evidencia
- **Commit boundary:** estado estable

## Desarrollo técnico

### Explore antes de editar

Leer contratos, tests y call sites reduce cambios en el lugar equivocado.

### Plan como diff mental

Debe decir archivos, comportamiento y verificación.

### Verify inmediato

No acumular muchas tareas sin probar; frecuencia sube con riesgo.

## Ejemplo aplicado

```text
READ → PLAN → REVIEW → EDIT → TEST → DIFF → COMMIT
                    ↑                   │
                    └──── correction ───┘
```

## Práctica guiada

Tomá una tarea y redactá un plan de 8 pasos con archivos, riesgos y comandos.

## Errores frecuentes y cómo evitarlos

- Editar durante exploración.
- Plan abstracto.
- No revisar diff después de tests verdes.

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

- [Anthropic — Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
