# Checklist de revisión independiente de derivación y código

**Spec:** `[ID]` · **Revisor:** `[persona/agente]` · **Fecha:** `[fecha]`.

## 1. Especificación

- [ ] P y Q representan exactamente la intención original.
- [ ] Los rangos vacíos y entradas inválidas están definidos.
- [ ] Los supuestos del modelo externo son visibles.

## 2. Derivación

- [ ] Cada igualdad indica una ley válida.
- [ ] No hay implicación invertida ni variable capturada.
- [ ] Todos los invariantes se inicializan.
- [ ] Cada rama del ciclo los preserva.
- [ ] Salida de ciclo implica Q.
- [ ] Existe medida de terminación y decrece en **todas** las ramas.
- [ ] No hay operaciones indefinidas o fuera del dominio.

## 3. Código

- [ ] La implementación corresponde al programa derivado.
- [ ] Se preserva la semántica de asignaciones simultáneas.
- [ ] No se introduce conversión silenciosa de tipos, overflow o NaN.
- [ ] La invocación externa y el procesamiento de errores son compatibles con Q.

## 4. Evidencias

- [ ] Tests reproducibles, ejecutados y resultados registrados.
- [ ] Eficiencia justificada con modelo de costo.
- [ ] «Demostrado», «evidenciado» y «pendiente» correctamente diferenciados.

## Veredicto

`APROBADO | APROBADO CON CONDICIONES | BLOQUEADO`

**Objeciones refutables:** `[ID/estado contraejemplo/propiedad]`.  
**Excepciones aceptadas:** `[ID/aprobador]`.
