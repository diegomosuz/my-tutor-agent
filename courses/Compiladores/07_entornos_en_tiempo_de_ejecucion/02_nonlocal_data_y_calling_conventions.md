# Acceso a datos no locales y calling conventions

**Módulo 07.**

## Cobertura

Cubre 7.3 y profundiza el vínculo entre scope estático y ejecución.

## Idea central

Los lenguajes con funciones anidadas muestran que el scope léxico y la pila dinámica son relaciones diferentes. Acceder a un nombre no local requiere conservar información del entorno léxico.

## Enlace dinámico frente a enlace estático

El enlace dinámico apunta al frame del caller y sirve para desenrollar la pila. El enlace estático apunta al frame de la función léxicamente envolvente necesaria para resolver no locales. En recursión y llamadas cruzadas estas cadenas pueden diferir radicalmente.

## Displays y closures

Un display mantiene accesos directos por nivel léxico. Una closure empaqueta código junto con un entorno cuando una función puede sobrevivir al frame que la creó. Si el lenguaje permite funciones de primera clase, variables capturadas quizá deban elevarse al heap. El compilador transforma así una regla de scope en una representación de runtime.

## ABI como interfaz binaria

La ABI define más que nombres de registros: alineación, paso y retorno de valores, preservación de registros, stack frame, representación de structs y convenciones para llamadas. Un compilador que produce instrucciones correctas pero viola ABI no puede interoperar de forma fiable.

## Ejemplo trabajado

Si `outer` define `x` y retorna una función `inner` que usa `x`, el frame de `outer` no puede destruirse sin más cuando retorna. `x` debe vivir en un ambiente capturado en heap o representación equivalente.

## Traslado a implementación

MiniC-RV base puede prohibir funciones anidadas, pero el estudiante debe implementar una extensión opcional o un simulador de static links para comprender el problema.

## Errores conceptuales frecuentes

- Confundir caller chain con lexical nesting.
- Tratar closures como punteros a código solamente.
- Diseñar calling convention incompatible con el ensamblador/runtime elegido.

## Ejercicios de dominio

1. Dibuje static/dynamic links.
2. Convierta una función anidada a closure explícita.
3. Documente la ABI usada por MiniC-RV.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
