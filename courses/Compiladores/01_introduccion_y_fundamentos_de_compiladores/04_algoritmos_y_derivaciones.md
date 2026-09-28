# Algoritmos y derivaciones — fundamentos

## 1. Invariante end-to-end

Una forma útil de pensar el compilador es como una composición `C = B ∘ O ∘ L`, donde `L` baja lenguaje fuente a IR, `O` transforma IR preservando semántica y `B` baja IR a target. La meta de corrección puede escribirse informalmente como:

```text
Obs_source(P) = Obs_target(C(P))
```

para todo programa válido `P`, bajo el conjunto de observables definido por el lenguaje.

La igualdad no exige igual traza interna. Un optimizador puede eliminar operaciones, cambiar el orden de instrucciones o usar registros distintos. Exige que el contexto externo permitido no pueda distinguir los resultados salvo diferencias que la especificación declare irrelevantes.

## 2. Estrategia de validación por fases

Para cada fase `F : A -> B`, defina:

1. **precondiciones** sobre `A`;
2. **postcondiciones** sobre `B`;
3. un verificador barato de invariantes;
4. tests positivos/negativos;
5. una forma de serializar `B` para inspección.

Ejemplo: `CFGBuilder` recibe TAC con labels válidas y produce bloques donde cada bloque termina en exactamente un terminador y cada arista apunta a un bloque existente.

## 3. Diagnósticos deterministas

No deje que el mensaje final dependa del orden accidental de un `dict` o de traversals no deterministas. Ordene diagnósticos por archivo/offset y asigne códigos estables. Esta práctica, aunque no aparece como algoritmo clásico, convierte el compilador en un sistema comprobable.

## 4. Prueba diferencial

Una estrategia de ingeniería poderosa es implementar un intérprete simple del AST/IR y comparar:

```text
run_interpreter(P) == run_target(compile(P))
```

sobre muchos programas pequeños. Con generación aleatoria restringida por tipos, esta técnica descubre errores sutiles del backend y optimizador.
