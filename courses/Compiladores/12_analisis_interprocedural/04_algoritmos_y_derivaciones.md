# Algoritmos y derivaciones — análisis interprocedural

## 1. SCC del call graph

Use Tarjan o Kosaraju. Una SCC con más de una función o self-edge representa recursión potencial. Colapsar SCCs produce un DAG de componentes sobre el cual pueden propagarse summaries en orden topológico inverso.

## 2. Points-to inclusion-based simplificado

Restricciones:

```text
x = &o      => o ∈ pts(x)
x = y       => pts(y) ⊆ pts(x)
x = *y      => para p∈pts(y): pts(p) ⊆ pts(x)
*x = y      => para p∈pts(x): pts(y) ⊆ pts(p)
```

Una worklist propaga nuevos elementos. Las reglas de load/store generan constraints dinámicamente a medida que crecen los points-to sets.

## 3. Sensibilidad a contexto por call strings

Identifique un estado como `(procedure, call_string_k)`, conservando las últimas `k` call sites. `k=0` equivale a context-insensitive; aumentar `k` separa llamadas pero puede multiplicar estados exponencialmente.

## 4. Datalog semi-naive

En vez de recalcular una regla con toda la relación en cada iteración, evalúe al menos una ocurrencia recursiva usando solo hechos nuevos `ΔR`. Esto evita rediscoveries masivas.

## 5. Política de inlining

Una heurística razonable combina tamaño del callee, frecuencia estimada del call site, recursión, posibilidad de constant propagation y code growth budget. Inlining es un enabling optimization: su valor puede aparecer en pases posteriores, pero el costo es aumento de código e I-cache pressure.
