# Pointer/points-to analysis y sensibilidad

**Módulo 12.**

## Cobertura

Cubre 12.4–12.6.

## Idea central

Pointer analysis aproxima qué ubicaciones puede referenciar cada puntero. Su precisión condiciona optimizaciones sobre memoria y llamadas indirectas.

## Andersen-style inclusion

Un análisis inclusion-based genera restricciones como `pts(y)⊆pts(x)` para `x=y`, `o∈pts(x)` para `x=&o`, y reglas para load/store. Es flow-insensitive si ignora orden de statements. La solución se obtiene como cierre monotónico de conjuntos y suele ser conservadora.

## Flow sensitivity

Un análisis flow-sensitive distingue puntos del programa y puede descubrir que una asignación sobrescribe información anterior. Gana precisión pero multiplica estados. Para compiladores optimizantes, SSA y Memory SSA pueden ayudar, aunque aliasing de heap continúa siendo complejo.

## Context sensitivity

Context-insensitive mezcla efectos de todas las llamadas a una función. Context-sensitive distingue contextos: call strings, object sensitivity, functional approach, summaries parametrizados. La precisión crece, pero también el costo y memoria. No existe un nivel universalmente óptimo.

## Soundness práctica

Si el análisis omite una posible referencia, una optimización puede ser incorrecta. Por eso se sobreaproxima: es aceptable decir que `p` puede apuntar a A o B aunque en runtime solo ocurra A; no es aceptable omitir B si existe una ejecución donde ocurre.

## Ejemplo trabajado

`p=&a; q=p; *q=1` implica que `q` puede apuntar a `a`. Si después `p=&b`, un flow-insensitive analysis puede decir `pts(p)={a,b}`; uno flow-sensitive puede distinguir antes/después de la reasignación.

## Traslado a implementación

La extensión opcional de MiniC-RV puede agregar punteros simples. Si no se implementan, modele points-to sobre un pequeño IR abstracto separado para practicar el algoritmo.

## Errores conceptuales frecuentes

- Interpretar `may-point-to` como certeza.
- Usar información unsound para eliminar stores.
- Creer que más sensibilidad siempre compensa su costo.

## Ejercicios de dominio

1. Resuelva restricciones de points-to.
2. Compare flow-sensitive e insensitive.
3. Proponga dos contextos de llamada.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
