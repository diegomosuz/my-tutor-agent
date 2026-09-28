# Software pipelining y modulo scheduling

**Módulo 10.**

## Cobertura

Cubre 10.5.

## Idea central

Software pipelining solapa operaciones de iteraciones distintas para alcanzar un intervalo de iniciación pequeño en loops regulares.

## Prologue, kernel y epilogue

El schedule estacionario del kernel inicia una nueva iteración cada `II` ciclos. Al comienzo hay que llenar el pipeline (prologue) y al final drenarlo (epilogue). Operaciones de iteraciones diferentes coexisten, por lo que valores suelen renombrarse o rotarse.

## Límites de II

`ResMII` surge de recursos: si cada iteración necesita más uso de una unidad del que cabe por ciclo, impone mínimo. `RecMII` surge de ciclos de dependencias loop-carried: una recurrencia con latencia total `L` y distancia `d` exige aproximadamente `II ≥ ceil(L/d)`. El II factible debe respetar ambos.

## Correctitud

No basta con reordenar el cuerpo textual. Deben preservarse dependencias intra e inter-iteración, incluyendo memoria. Alias analysis y dependence analysis son esenciales en loops con arrays/punteros.

## Formalización

`II ≥ max(ResMII, RecMII)`. Un modulo scheduler intenta ubicar operaciones en slots `time mod II` sin conflicto y respetando dependencias con distancias de iteración.

## Ejemplo trabajado

En `A[i]=B[i]+C[i]`, loads de iteración `i+1` pueden solaparse con add/store de `i` si no hay dependencias cruzadas. El kernel resultante tiene varias iteraciones parcialmente activas.

## Traslado a implementación

La práctica puede usar un modelo abstracto de load=2 ciclos, add=1 y store=1. Visualice una tabla ciclos×iteraciones para hacer evidente el solapamiento.

## Errores conceptuales frecuentes

- Ignorar loop-carried dependencies.
- Confundir unrolling con software pipelining.
- Olvidar prologue/epilogue.

## Ejercicios de dominio

1. Calcule ResMII/RecMII.
2. Construya kernel.
3. Explique renaming de valores.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
