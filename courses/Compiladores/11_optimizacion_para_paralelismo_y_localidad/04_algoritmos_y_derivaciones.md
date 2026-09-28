# Algoritmos y derivaciones — dependencias y localidad

## 1. Dependencia de una dimensión

Para accesos `A[a*i+b]` y `A[c*j+d]`, buscar soluciones enteras a:

```text
a*i + b = c*j + d
```

dentro de los rangos de iteración y con orden lexicográfico apropiado. Tests como GCD pueden descartar dependencia si `gcd(a,c)` no divide `d-b`.

## 2. Direction vector

Para dos iteraciones `I` y `J`, cada dimensión se clasifica `<`, `=`, `>`. Una transformación de loop order es legal si no convierte una dependencia requerida en un orden que ejecute sink antes de source.

## 3. Interchange

Intercambiar loops equivale a permutar componentes de los direction vectors. Si después de permutar aparece como primer componente no igual un `>`, se viola el orden de una dependencia y el interchange no es legal.

## 4. Tiling

Para tile size `T`:

```text
for ii = 0..N step T
  for jj = 0..M step T
    for i = ii..min(ii+T,N)
      for j = jj..min(jj+T,M)
        body(i,j)
```

La transformación no elimina iteraciones; cambia el orden agrupándolas. Su utilidad depende de que el working set del tile reutilizado quepa razonablemente en el nivel de cache objetivo.

## 5. Benchmark responsable

Controle tamaño, warmup, número de repeticiones y optimización del compilador. Reporte mediana/dispersión. Una diferencia pequeña sin control experimental no demuestra beneficio.
