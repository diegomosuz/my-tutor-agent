---
name: formal-contract
description: Formaliza una feature de SDD en espacio de estados, precondiciones, postcondiciones, dominios y casos límite antes de programar. Úsala al iniciar una especificación o al detectar ambigüedades.
---

# Formal contract — Kaldewaij

## Entradas

Spec funcional, contratos externos conocidos y tipos de datos. Lee `recursos/NOTACION_Y_CONVENCIONES.md` del curso si está disponible.

## Procedimiento

1. Extrae las variables constantes, variables de programa y espacio de estados.
2. Escribe `P` y `Q` en notación cuantificada cuando corresponda.
3. Define `def.E` para operaciones parciales y rangos válidos.
4. Separa los casos por guardas y demuestra cobertura.
5. Comprueba estados frontera, entradas inválidas y resultados inexistentes.
6. En servicios externos, identifica resultados `Returned`, `Failed`, `TimedOut` o estados equivalentes según el contrato real.
7. No inventes hipótesis; registra preguntas y restricciones faltantes.

## Entrega

Actualiza o propone sección de contrato formal dentro de `spec.md` y lista inicial de obligaciones `PO-...`.

## Control de salida

Si Q no es inequívoca, detente antes de implementar y registra exactamente la ambigüedad. No confundas éxito de tests con una propiedad lógica universal.
