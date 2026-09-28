---
title: "Inicialización e integración con agentes"
order: 2
description: "Instalación, estructura generada y principios para repos nuevos y existentes."
---

# Inicialización e integración con agentes

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Inicializar de forma segura.
- Entender archivos del toolkit.
- Seleccionar integración de agente.
- Evitar mezclar bootstrap con feature work.

## Conceptos esenciales

- **Integration key:** adaptador del agente
- **Scaffolding:** templates/scripts/comandos
- **Existing project:** repo con historia real
- **Air-gapped:** entorno controlado
- **Upgrade:** mantenimiento del scaffolding

## Desarrollo técnico

### Bootstrap controlado

La CLI prepara assets; no debería modificar producto durante instalación.

### Agente intercambiable

La agent-neutrality preserva el proceso aunque cambie la sintaxis de invocación.

### Brownfield

Inicializar tooling no equivale a comprender el repo; primero se preservan restricciones y comportamiento actual.

## Ejemplo aplicado

```bash
uv tool install specify-cli
specify init my-project --integration copilot
```

Verificá siempre la documentación oficial de la versión instalada.

## Práctica guiada

En un repo de prueba, separá process assets de product assets y definí cómo actualizarías el toolkit sin mezclar cambios funcionales.

## Errores frecuentes y cómo evitarlos

- Committear secretos.
- Suponer equivalencia perfecta entre integraciones.
- Ejecutar init sin revisar diff.

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
- [GitHub Spec Kit — Quickstart](https://github.com/github/spec-kit/blob/main/docs/quickstart.md)
- [Microsoft — Diving Into Spec-Driven Development With GitHub Spec Kit](https://developer.microsoft.com/blog/spec-driven-development-spec-kit/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
