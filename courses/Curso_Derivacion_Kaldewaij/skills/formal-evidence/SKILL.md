---
name: formal-evidence
description: Conecta obligaciones de corrección de una derivación con pruebas automatizadas, evidencia de ejecución y análisis de complejidad; usa esta skill después de implementar una feature SDD.
---

# Formal evidence — dossier de aceptación

## Pasos

1. Lee `spec.md`, `derivation.md` y el código implementado.
2. Extrae identificadores `PO-...` y relaciones matemáticas.
3. Para cada obligación, identifica demostración, prueba ejecutable, análisis estático o su ausencia.
4. Genera tests de frontera y contraejemplos; ejecuta solo las herramientas autorizadas por el usuario/proyecto.
5. Registra comando, versión de entorno, resultados y limitaciones.
6. Calcula número de iteraciones/operaciones, distinguiendo worst/average y recursos externos.
7. Entrega `evidencias.md` con la plantilla `plantillas/EVIDENCIAS.md` cuando esté disponible.

## Condiciones de aceptación

No se permite: inventar resultados de ejecución; ocultar tests fallidos; llamar demostración a una simple suite; inferir exactitud predictiva ML a partir del rango de probabilidades.
