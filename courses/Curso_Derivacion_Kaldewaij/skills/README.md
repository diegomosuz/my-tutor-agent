# Skills para incorporar derivación de Kaldewaij a agentes de código

Estos archivos `SKILL.md` son **plantillas operativas de implementación**, no parte del libro.

## Skills incluidas

| Skill | Foco | Cuándo invocarla |
|---|---|---|
| [formal-contract](formal-contract/SKILL.md) | P/Q y frontera | Antes de planificar feature |
| [formal-derive](formal-derive/SKILL.md) | Cálculo e invariantes | Algoritmos y lógica crítica |
| [formal-review](formal-review/SKILL.md) | Refutación independiente | Antes de merge |
| [formal-evidence](formal-evidence/SKILL.md) | Pruebas y trazabilidad | Después de implementar |

## Instalación orientativa

Para Claude Code, copiar cada carpeta a `.claude/skills/` dentro del repositorio. Para GitHub Copilot, consultar el soporte actual de `.github/skills/`, `.claude/skills/` y `.agents/skills/`. En otras herramientas, adaptar su mecanismo de extensiones, conservando los contratos.

**Referencias:**

- https://code.claude.com/docs/en/skills
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills

No se incluyen permisos automáticos de ejecución de shell ni herramientas externas: revisarlos explícitamente antes de delegar operaciones con efectos.

## Orden de trabajo sugerido

`formal-contract → formal-derive (si aplica) → implementación → formal-evidence → formal-review`.

Para cambios de presentación sin algoritmo, puede usarse solo `formal-contract` y pruebas de aceptación relevantes. Para un algoritmo de ordenamiento, recurrencias o motor de reglas, la derivación completa es más apropiada.
