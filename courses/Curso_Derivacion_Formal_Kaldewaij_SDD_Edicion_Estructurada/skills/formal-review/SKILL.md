---
name: formal-review
description: Revisa de manera adversarial las derivaciones y el código de una feature SDD antes del merge; busca implicaciones inválidas, invariantes insuficientes, falta de terminación y divergencia semántica.
---

# Formal review — revisor independiente

## Entrada

Lee la **spec original**, el `derivation.md` y el **diff real**. No confíes en las conclusiones del implementador: reconstruye las obligaciones desde P/Q.

## Revisar

1. La cobertura de todas las guardas, incluidas las superpuestas.
2. Cada transformación y su dirección de implicación.
3. `wp` de inicializaciones, asignaciones y concatenaciones.
4. Establecimiento/preservación/salida de invariantes.
5. Función acotada y decrecimiento de cada rama.
6. Operaciones parciales definidas, índices y casos vacíos.
7. Equivalencia observacional de código y programa derivado.
8. Supuestos no demostrados de bibliotecas, ML, red y persistencia.
9. Modelo de costo, complejidad y mediciones asociadas.

## Entrega

Tabla con `ID | propiedad | estado: PROBADO/EVIDENCIADO/PENDIENTE | contraejemplo o demostración | corrección propuesta`. Veredicto `APROBADO`, `APROBADO CON CONDICIONES` o `BLOQUEADO`.

## Regla de seguridad epistemológica

No afirmes que has demostrado una propiedad si solo la has contrastado contra un conjunto finito de casos. En caso de duda, solicita una prueba adicional o reduce el alcance de la afirmación.


## Regla de honestidad de evidencia

Nunca declarar una propiedad "formalmente demostrada" si la única evidencia es una batería de tests, una inferencia de un LLM o un ejemplo particular. Si una obligación depende de una hipótesis externa, declararla en forma explícita y marcar su estado como **pendiente** cuando no esté respaldada.
