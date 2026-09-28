---
title: "Diseñar SDD portable entre agentes"
order: 5
description: "Convenciones para que specs y proceso sobrevivan al cambio de modelo o IDE."
---

# Diseñar SDD portable entre agentes

> **Nivel:** intermedio-avanzado. Este tópico forma parte de un recorrido progresivo.

## Competencias de aprendizaje

- Separar artefactos estándar de comandos vendor-specific.
- Versionar decisiones de proceso.
- Crear adaptadores finos.
- Reducir lock-in.

## Conceptos esenciales

- **Portable artifact:** Markdown/schema tool-neutral
- **Adapter:** traducción pequeña a un agente
- **Canonical process:** secuencia estable
- **Vendor capability:** feature específica
- **Exit strategy:** migración de tooling

## Desarrollo técnico

### Repo como punto de encuentro

Specs, contratos y tests versionados crean base portable.

### Adapters pequeños

La lógica central vive en artefactos compartidos; integraciones solo invocan.

### Prueba de portabilidad

Ejecutar una feature pequeña con un segundo agente revela dependencias invisibles.

## Ejemplo aplicado

**Canon:** `specs/<feature>/{spec.md,plan.md,tasks.md}`  
**Adapters:** `.github/prompts/`, `.claude/skills/`, integración Kiro, etc.

## Práctica guiada

Diseñá un layout que permita ejecutar la misma feature con dos agentes sin duplicar la spec.

## Errores frecuentes y cómo evitarlos

- Conocimiento crítico solo en IDE settings.
- Formatos propietarios innecesarios.
- No documentar exit strategy.

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
- [Anthropic — Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Kiro Docs — Specs](https://kiro.dev/docs/specs/)

> **Idea clave:** en SDD, una especificación útil no es documentación ceremonial; es un contrato de intención suficientemente preciso para guiar decisiones y suficientemente verificable para detectar desvíos.
