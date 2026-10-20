# 16 · Construcción de skills de derivación formal

**Módulo complementario.** **Carga:** 4 h. Aquí diseñamos mecanismos prácticos para cargar instrucciones de derivación en agentes contemporáneos.

## Competencias a lograr

1. Diseñar skills con disparadores claros, insumos, procedimiento, artefactos y criterios de salida reproducibles.
2. Separar normas siempre activas de habilidades bajo demanda y evitar prompts excesivos.
3. Integrar una habilidad de derivación y otra de revisión en el flujo de SDD de una feature.

**Evidencias:** dos archivos `SKILL.md` utilizables como punto de partida, un ejemplo de invocación y una revisión piloto de su resultado.

## 1. Principio de diseño de la habilidad

Una skill útil debe responder: **cuándo se usa, qué necesita, qué hace, qué entrega y qué NO puede afirmar**. Su descripción permite que el agente la seleccione al trabajar en la tarea pertinente.

Se proponen cuatro habilidades:

1. `formal-contract`: obtener y auditar `P`, `Q`, dominio y definiciones.
2. `formal-derive`: transformar el contrato en guardas/invariantes/asignaciones.
3. `formal-review`: cuestionar la derivación y comparar con el código.
4. `formal-evidence`: comprobar que las obligaciones relevantes tienen una evidencia asociada.

Estas habilidades deben ser **ortogonales**. No crear una «mega-skill» que haga todo y deje sin separación al implementador y al revisor.

## 2. Formato mínimo

Un `SKILL.md` puede incluir un encabezado YAML y un cuerpo Markdown. Ejemplo ilustrativo:

```markdown
---
name: formal-derive
description: Deriva lógica crítica de una spec SDD mediante cálculo de predicados, invariantes y weakest preconditions.
---

# Procedimiento
1. Lee la spec y el contrato normalizado.
2. Especifica dominio, P y Q.
3. Deriva las operaciones justificando cada equivalencia.
4. Formula obligaciones de prueba y terminación.
5. Entrega `derivation.md` y señala lagunas.

Nunca afirmes que los tests equivalen a una demostración.
```

La forma exacta de activar o almacenar una skill **depende de la versión del agente**. Como punto de partida de proyecto, Claude Code utiliza típicamente `.claude/skills/<nombre>/SKILL.md`; GitHub Copilot puede utilizar `.github/skills`, `.claude/skills` o `.agents/skills` para skills de proyecto según la superficie. Consulta documentación oficial antes de integrarlo en CI o automatización.

## 3. Patrón de implementación en repositorio

```text
.claude/
  skills/
    formal-contract/SKILL.md
    formal-derive/SKILL.md
    formal-review/SKILL.md
    formal-evidence/SKILL.md
specs/
  004-ml-risk/
    spec.md
    plan.md
    tasks.md
    derivation.md
```

El ZIP de este curso incluye estos archivos en `skills/` para copiar al destino de agente que se elija. El material no crea por sí solo una integración activa en un repositorio ajeno.

## 4. Ejemplo de invocación y entrega

**Solicitud del responsable de la feature:**

```text
Aplica formal-contract y formal-derive a specs/004-ml-risk/spec.md.
No modifiques código hasta entregar el contrato y la derivación.
Prioriza la solución más simple y marca los supuestos no demostrables.
```

**Salida esperada:** `spec.md` con `P/Q`, `derivation.md` con leyes y guardas, tabla `PO-001...`, y una lista de preguntas a resolver antes del código.

**Solicitud del revisor:**

```text
Aplica formal-review usando la spec original y el diff.
Intenta refutar cada obligación, no aceptes la narrativa del
implementador como demostración. Registra fallas y supuestos.
```

## 5. Evitar sobreingeniería

- No usar un agente distinto por cada ley matemática.
- No incluir todo el libro en el contexto de cada petición; incluir el resumen aplicable.
- No generar `derivation.md` para un cambio puramente de presentación.
- No prometer demostración automática de dependencias externas.
- No bloquear feature de bajo riesgo por demostraciones que no influyen en su resultado.

## 6. Recursos verificables sobre herramientas

- Claude Code: https://code.claude.com/docs/en/skills
- Claude Code, extensiones: https://code.claude.com/docs/en/features-overview
- GitHub Copilot, skills: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills

Estas fuentes describen tecnologías modernas y **no** forman parte del libro de Kaldewaij.

## Práctica

1. Instala la skill `formal-contract` en un proyecto de prueba.
2. Pide al agente el contrato de un endpoint que valida enteros.
3. Ejecuta `formal-derive` y verifica manualmente dos obligaciones.
4. Repite con una especificación contradictoria y comprueba que la skill lo informa.
5. Ejecuta `formal-review` con una implementación defectuosa e identifica al menos una falla que el implementador omitió.

**Criterio:** la skill debe generar artefactos verificables y negar explícitamente las garantías que no puede probar.
