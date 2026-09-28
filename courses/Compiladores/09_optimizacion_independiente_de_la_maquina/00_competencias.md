# Módulo 09 — Optimización independiente de la máquina

**Referencia estructural:** Capítulo 9 de la segunda edición del Dragon Book.

## Competencias del módulo

- Fundamentos de análisis de flujo de datos y puntos fijos.
- Propagación de constantes, CSE, DCE y PRE.
- Bucles, regiones, dominadores y análisis simbólico.

## Secciones del texto guía cubiertas

9.1 Sources of Optimization; 9.2 Data-Flow Intro; 9.3 Foundations; 9.4 Constant Propagation; 9.5 PRE; 9.6 Loops; 9.7 Regions; 9.8 Symbolic Analysis.

## Resultado práctico

**Optimizador de IR**.

![CFG para análisis de flujo](images/cfg_dataflow.png)

## Criterio de dominio

El estudiante debe poder explicar el concepto sin depender del código, derivar el algoritmo sobre un ejemplo pequeño y luego reconocer cómo aparece en el proyecto MiniC-RV.
