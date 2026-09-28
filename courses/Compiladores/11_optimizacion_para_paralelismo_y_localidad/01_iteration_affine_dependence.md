# Espacios de iteración, índices afines y dependencias de arrays

**Módulo 11.**

## Cobertura

Cubre 11.1–11.6.

## Idea central

Las optimizaciones de loops multidimensionales necesitan una representación matemática de iteraciones y accesos para demostrar cuándo reordenar es legal.

## Iteration space

Un nest de loops con límites afines define un conjunto de puntos enteros. Para `for i=0..N-1` y `for j=0..M-1`, cada ejecución del cuerpo corresponde a `(i,j)`. Transformar loops puede verse como transformar el orden o las coordenadas de estos puntos.

## Affine accesses

Un acceso como `A[2*i+j+1]` es afín en índices del loop y parámetros. Esta restricción permite aplicar álgebra lineal para razonar sobre igualdad de direcciones y dependencias. Accesos con `A[B[i]]` son indirectos y escapan al modelo affine simple.

## Dependencias

Existe flow dependence si una escritura en una iteración alimenta una lectura posterior; anti-dependence si una lectura debe preceder a una escritura; output dependence entre escrituras. Direction vectors describen orden relativo por dimensiones (`<`, `=`, `>`). Una transformación es legal si preserva el orden requerido por dependencias verdaderas y, según memoria, de nombre.

## Ejemplo trabajado

Para `A[i]=A[i-1]+1`, hay una dependencia de `(i-1)` a `i` con distancia 1. Las iteraciones no pueden ejecutarse todas en paralelo sin cambiar el algoritmo. En `A[i]=B[i]+1` con arrays no aliasing, no existe dependencia entre iteraciones y el loop es parallelizable.

## Traslado a implementación

Implemente un analizador restringido a subscripts `a*i+b` y detecte dependencias simples. La meta es practicar la prueba de legalidad, no construir un polyhedral compiler completo.

## Errores conceptuales frecuentes

- Asumir que índices distintos implican memoria distinta sin considerar aliasing.
- Paralelizar porque no hay dependencia textual aparente.
- Confundir dependencia intra-iteración con loop-carried.

## Ejercicios de dominio

1. Calcule direction vectors.
2. Determine si interchange es legal.
3. Clasifique accesos afines/no afines.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?

## Visualización complementaria

![Dependencia loop-carried](images/loop_dependence.png)
