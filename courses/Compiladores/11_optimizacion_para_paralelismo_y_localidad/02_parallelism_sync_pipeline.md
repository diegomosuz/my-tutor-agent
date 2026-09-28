# Paralelismo, sincronización y pipelining de loops

**Módulo 11.**

## Cobertura

Cubre 11.7–11.9.

## Idea central

Una vez conocidas las dependencias, el compilador puede encontrar dimensiones de ejecución que no requieren sincronización o insertar coordinación mínima.

## DOALL y DOACROSS

Un loop DOALL no tiene dependencias loop-carried que impidan ejecutar iteraciones en paralelo. DOACROSS permite ciertas dependencias y sincroniza entre iteraciones. El costo de sincronización puede anular beneficios si la granularidad es pequeña.

## Privatización y reducción

Variables temporales compartidas pueden privatizarse por worker. Reducciones como `sum += A[i]` tienen una dependencia aparente pero poseen una estructura asociativa/commutativa que permite acumuladores parciales y combinación, sujeto a semántica numérica: floating point no es estrictamente asociativo.

## Pipelining entre etapas

Loops productores/consumidores pueden transformarse en pipelines de etapas, donde distintas iteraciones ocupan etapas distintas. La corrección exige respetar dependencias y buffers. Esta idea se relaciona con software pipelining pero opera a nivel de transformaciones de loops/tareas.

## Ejemplo trabajado

Una reducción entera `sum += A[i]` puede dividir el rango en chunks, calcular `partial[k]` y combinar. Para floats, el cambio de orden puede modificar redondeo; la legalidad depende de si el lenguaje/flags permiten reassociation.

## Traslado a implementación

Añada una anotación experimental `@parallel` y haga que el compilador rechace loops que no pueda demostrar independientes bajo un análisis simple. El valor pedagógico está en justificar el rechazo.

## Errores conceptuales frecuentes

- Prometer bitwise-identical FP después de reassociation.
- Compartir temporales privatizables.
- Usar locks por iteración sin analizar costo.

## Ejercicios de dominio

1. Detecte reducción.
2. Explique DOALL vs DOACROSS.
3. Proponga sincronización mínima.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
