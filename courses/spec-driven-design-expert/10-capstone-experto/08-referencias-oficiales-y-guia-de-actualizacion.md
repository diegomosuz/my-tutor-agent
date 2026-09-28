---
title: "Referencias oficiales y guía de actualización"
order: 8
description: "Fuentes primarias y criterios para mantener el curso actualizado sin depender de snapshots obsoletos."
---

# Referencias oficiales y guía de actualización

## Principio

SDD evoluciona rápido. Separá **principios duraderos** de **comandos/versiones específicas**.

| Capa | Ejemplos | Estrategia |
|---|---|---|
| Principios | intención, trazabilidad, evidencia, convergencia | fundamentos estables |
| Workflow | specify/plan/tasks/implement/converge | revisar periódicamente |
| CLI | flags, instalación, integración | verificar antes de automatizar |
| Producto | IDE, UI, capabilities | tratar como herramienta |

## Fuentes oficiales principales

- [GitHub Spec Kit](https://github.github.com/spec-kit/)
- [What is Spec-Driven Development?](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md)
- [Spec Kit Quickstart](https://github.com/github/spec-kit/blob/main/docs/quickstart.md)
- [Agentic SDD reference](https://github.com/github/spec-kit/blob/main/docs/reference/agentic-sdd.md)
- [Spec of Specs](https://github.com/github/spec-kit/blob/main/docs/concepts/spec-of-specs.md)
- [Kiro — Specs](https://kiro.dev/docs/specs/)
- [Microsoft — Spec-Driven Development: A Spec-First Approach to AI-Native Engineering](https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/)
- [Microsoft — Diving Into Spec-Driven Development With GitHub Spec Kit](https://developer.microsoft.com/blog/spec-driven-development-spec-kit/)
- [Microsoft Learn — Spec-driven development with GitHub Spec Kit](https://learn.microsoft.com/es-es/training/modules/spec-driven-development-github-spec-kit-enterprise-developers/)
- [Anthropic — Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [AWS — Kiro Documentation Overview](https://aws.amazon.com/documentation-overview/kiro/)

## Protocolo de actualización

1. Revisar breaking changes del toolkit.
2. Comparar workflow actual con fundamentos del curso.
3. Actualizar solo comandos/ejemplos afectados.
4. Mantener ejemplos tool-neutral como baseline.
5. Registrar fecha y fuente de cambios operativos.
6. Revalidar con un caso greenfield y uno brownfield.

> El dominio experto no consiste en memorizar comandos, sino en mantener intención, decisiones, implementación y evidencia alineadas aunque cambie la herramienta.
