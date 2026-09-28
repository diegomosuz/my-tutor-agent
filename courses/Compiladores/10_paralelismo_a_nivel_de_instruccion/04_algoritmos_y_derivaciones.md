# Algoritmos y derivaciones — ILP

## 1. DAG de dependencias

Para cada instrucción, compute `reads`, `writes` y recursos. Agregue:

- RAW: última definición de un operando → uso;
- WAR: lecturas anteriores → nueva definición si no hay renaming;
- WAW: definición previa → nueva definición;
- memory edges cuando alias analysis no demuestra independencia.

## 2. Critical path priority

```text
height(v) = latency(v) + max(height(s) for s in succ(v))
```

Los sinks tienen altura igual a su latencia. List scheduling suele priorizar mayor `height`.

## 3. List scheduling

En cada ciclo:

1. agregue nodos cuyas dependencias estén satisfechas;
2. filtre por recursos disponibles;
3. ordene por prioridad;
4. emita hasta el ancho permitido;
5. avance el tiempo y actualice disponibilidad de resultados.

## 4. Software pipelining

Calcule mínimos:

```text
MII = max(ResMII, RecMII)
```

Intente `II=MII`; si el modulo reservation table no admite schedule legal, incremente `II`. Una dependencia con distancia de iteración `d` impone:

```text
start(v) - start(u) >= latency(u,v) - d*II
```

Esta desigualdad explica formalmente cómo operaciones de iteraciones distintas pueden solaparse.
