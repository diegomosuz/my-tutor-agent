# Scheduling de bloques básicos y scheduling global

**Módulo 10.**

## Cobertura

Cubre 10.3 y 10.4.

## Idea central

List scheduling ordena instrucciones ready según prioridades mientras respeta recursos. Global scheduling amplía el movimiento más allá de un bloque y necesita considerar caminos y frecuencia.

## List scheduling

Se mantiene un conjunto de instrucciones listas cuyas dependencias ya fueron satisfechas. En cada ciclo se eligen candidatas compatibles con recursos. Prioridades típicas: altura en critical path, latencia, número de sucesores o presión de registros. El algoritmo es heurístico: optimal scheduling general puede ser costoso.

## Trace scheduling

En código con branches, se puede escoger un trace probable de bloques y optimizarlo como región principal, compensando efectos en entradas/salidas laterales. Profile-guided information mejora la elección, pero la transformación debe seguir siendo correcta incluso si el perfil cambia.

## Presión de registros

Mover una definición más temprano puede aumentar el intervalo vivo y provocar spills. Por eso instruction scheduling y register allocation interactúan. Una mejora local de ciclos puede empeorar rendimiento total si aumenta tráfico de memoria.

## Ejemplo trabajado

Una prioridad por `critical_path_length` elige primero instrucciones cuyo retraso probablemente extienda el makespan. Si dos candidatas tienen igual prioridad, puede preferirse la que no incremente live ranges.

## Traslado a implementación

Experimente con un bloque y compare schedule original, list schedule y número de ciclos bajo un modelo sencillo. Reporte también presión máxima de valores vivos.

## Errores conceptuales frecuentes

- Evaluar schedule solo por número de instrucciones.
- Mover instrucciones sobre branches sin compensación.
- Ignorar register pressure.

## Ejercicios de dominio

1. Implemente list scheduling.
2. Compare dos heurísticas.
3. Diseñe un caso donde scheduling causa spill.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
