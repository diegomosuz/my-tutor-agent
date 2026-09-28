# Módulo 12 — Análisis interprocedural

**Referencia estructural:** Capítulo 12 de la segunda edición del Dragon Book.

## Competencias del módulo

- Motivación, grafos de llamadas y representación lógica de flujo.
- Pointer/points-to analysis: sensibilidad a contexto y flujo.
- Datalog/BDD, resúmenes de procedimientos y optimizaciones whole-program.

## Secciones del texto guía cubiertas

12.1 Basic Concepts; 12.2 Why Interprocedural; 12.3 Logical Data Flow; 12.4 Pointer Analysis; 12.5 Context-Insensitive; 12.6 Context-Sensitive; 12.7 Datalog/BDD.

## Resultado práctico

**Análisis whole-program y cierre**.

![Análisis interprocedural](images/tecnicas_avanzadas.png)

![Call graph](images/call_graph.png)

## Criterio de dominio

El estudiante debe poder explicar el concepto sin depender del código, derivar el algoritmo sobre un ejemplo pequeño y luego reconocer cómo aparece en el proyecto MiniC-RV.
