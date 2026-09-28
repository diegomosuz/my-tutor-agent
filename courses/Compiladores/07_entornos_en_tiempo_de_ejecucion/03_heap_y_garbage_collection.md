# Heap y garbage collection

**Módulo 07.**

## Cobertura

Cubre 7.4–7.8.

## Idea central

La gestión dinámica de memoria exige responder dos preguntas: cómo asignar bloques eficientemente y cuándo es seguro reutilizar memoria que ya no puede afectar la ejecución.

## Asignación de heap

Un allocator administra bloques libres y usados, alineación, metadata y fragmentación. Estrategias como free lists segregadas, bump allocation o buddy systems ofrecen distintos compromisos. El compilador puede insertar llamadas a runtime para `alloc`; no necesita implementar el allocator dentro del código generado.

## Reachability y tracing GC

Un objeto es vivo para un collector de trazado si es alcanzable desde raíces: registros, stack, globals y otros objetos vivos. Mark-sweep marca alcanzables y luego barre el heap. Copying collection mueve objetos vivos desde un semiespacio a otro y actualiza referencias, compactando de forma natural.

## Generational hypothesis

Muchos objetos mueren jóvenes. Un collector generacional recolecta frecuentemente una young generation pequeña y menos frecuentemente old generation. Para no escanear todo old cada vez necesita remembered sets o write barriers que registren referencias old→young.

## Pausas y precisión

Collectors incrementales/concurrentes reducen pausas pero complican invariantes entre mutator y collector. Un GC preciso necesita conocer qué palabras son punteros; el compilador puede emitir stack maps en safepoints. Un GC conservador acepta falsos positivos a cambio de menor metadata.

## Ejemplo trabajado

Mark-sweep: `mark(root)` recorre referencias y marca; luego `sweep` recorre bloques y libera no marcados. El costo de mark depende de objetos vivos; sweep depende del tamaño/estructura del heap. Copying collector depende esencialmente de memoria viva, pero requiere espacio de copia.

## Traslado a implementación

Implemente un pequeño heap simulado con objetos `{fields}` y roots. Ejecute mark-sweep y grafique objetos alcanzables. No es necesario integrar GC completo con el backend para dominar el concepto.

## Errores conceptuales frecuentes

- Confundir “sin referencias locales” con inalcanzable globalmente.
- Olvidar referencias en registros como roots.
- Mover objetos sin actualizar todas las referencias.

## Ejercicios de dominio

1. Trace un heap manualmente.
2. Compare mark-sweep y copying.
3. Explique write barrier.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
