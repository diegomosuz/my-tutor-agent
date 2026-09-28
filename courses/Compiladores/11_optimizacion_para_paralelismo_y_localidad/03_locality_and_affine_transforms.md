# Localidad: interchange, tiling, fusión y transformaciones afines

**Módulo 11.**

## Cobertura

Cubre 11.10 y 11.11, usando multiplicación de matrices como caso central.

## Idea central

La jerarquía de memoria hace que el orden de acceso sea tan importante como el número de operaciones. Optimizar localidad busca reutilizar datos mientras permanecen en caches cercanas.

## Localidad temporal y espacial

Temporal: volver a usar pronto el mismo dato. Espacial: usar direcciones cercanas. En row-major, recorrer columnas internas salta grandes distancias y desperdicia líneas de cache. Loop interchange puede corregir el orden si las dependencias permiten intercambiar dimensiones.

## Tiling/blocking

Tiling divide el espacio de iteración en bloques pequeños. En matrix multiply, trabajar sobre submatrices aumenta reutilización de `A`, `B` y `C` dentro de cache. Elegir tile size depende de niveles de cache, asociatividad y elementos simultáneamente activos.

## Fusión, fisión y skewing

Loop fusion combina loops con rangos compatibles para reutilizar datos y reducir overhead, pero puede aumentar presión de cache/registros o crear dependencias. Fission separa para mejorar locality o paralelismo. Skewing transforma índices para hacer dependencias compatibles con interchange/parallelization.

## Transformaciones afines

Una transformación `i' = T i + c` sobre vectores de iteración puede unificar interchange, reversal, skewing y otras operaciones. Debe ser invertible apropiadamente sobre puntos enteros y preservar el orden de dependencias. Esta perspectiva es la puerta al modelo poliédrico.

## Ejemplo trabajado

Matrix multiply ingenuo `i,j,k`: si `B[k][j]` accede a columnas en row-major, una variante `i,k,j` puede mejorar locality porque `B[k][j]` recorre `j` contiguamente y `A[i][k]` se reutiliza. Tiling añade bloques `ii,jj,kk` antes de los loops internos.

## Traslado a implementación

Haga benchmarks con tamaños crecientes y compare órdenes de loop. Use medición como evidencia empírica, pero acompañe con explicación de working set y cache lines. Rendimiento observado sin modelo no constituye comprensión.

## Errores conceptuales frecuentes

- Aplicar tiling con tamaño arbitrario y asumir mejora.
- Interchange sin dependencia analysis.
- Confundir locality con paralelismo.

## Ejercicios de dominio

1. Compare órdenes `ijk` e `ikj`.
2. Diseñe un tile size razonado.
3. Analice legalidad de fusion.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
