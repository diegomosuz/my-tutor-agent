---
name: formal-derive
description: Deriva lógica de una spec SDD con cálculo de predicados, weakest preconditions, comandos guardados, cuantificaciones, invariantes y prueba de terminación según Anne Kaldewaij. Úsala para algoritmos y reglas no triviales.
---

# Formal derive — Kaldewaij

## Contrato

**No edites código hasta completar la primera derivación suficiente.** Requiere P, Q, dominios y supuestos explícitos.

## Método

1. Escribe `{P} S {Q}` con `S` desconocida.
2. Transforma `Q` mediante equivalencias algebraicas y leyes válidas; anota la justificación de cada paso.
3. Selecciona técnica apropiada: conjunción como invariante, sustituir constante por variable, fortalecer, invariante de cola, búsqueda por eliminación, manejo de segmentos o arreglos auxiliares.
4. Deriva inicialización desde `wp.Init.I`.
5. Deriva la guarda para que `I∧¬B⇒Q`.
6. Deriva el cuerpo para `{I∧B}S{I}`; incluye `def.E`.
7. Prueba terminación con función acotada entera no negativa, estrictamente decreciente.
8. Analiza tiempo, espacio y modelo de costo.
9. Solo entonces implementa la traducción mínima que conserva semántica.

## Archivo de salida

`specs/<id>/derivation.md`: especificación, cadena de derivación, comandos guardados, obligaciones, complejidad, supuestos; usa la plantilla del curso `plantillas/DERIVACION.md` si existe.

## Restricciones

- No confundas `P⇒Q` con `P≡Q`.
- No consideres una salida numérica válida como prueba de procedencia.
- No conviertas selecciones no deterministas en una única rama sin demostrar equivalencia respecto de Q.
- No etiquetes una derivación de LLM como «verificada formalmente» sin revisión independiente.
- Si no puedes justificar un paso, deja PO pendiente y pide resolución.


## Regla de honestidad de evidencia

Nunca declarar una propiedad "formalmente demostrada" si la única evidencia es una batería de tests, una inferencia de un LLM o un ejemplo particular. Si una obligación depende de una hipótesis externa, declararla en forma explícita y marcar su estado como **pendiente** cuando no esté respaldada.
