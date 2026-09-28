# Tipos, declaraciones, scope y type checking

**Módulo 06.**

## Cobertura

Cubre 6.3 y 6.5, complementando la secuencia de Stanford sobre semantic analysis.

## Idea central

El análisis semántico transforma un AST sintácticamente válido en un programa semánticamente justificado: cada nombre se resuelve y cada operación satisface reglas de tipos.

## Resolución de nombres

Use una pila de scopes. Al entrar en bloque se crea un scope; al salir se descarta. Una declaración se inserta en el scope actual y un uso busca desde el más interno hacia afuera. El resultado debe ser una referencia estable a un `Symbol`, no solo el lexema. Así dos variables `x` sombreadas quedan correctamente diferenciadas.

## Juicios de tipos

Las reglas pueden expresarse como juicios `Γ ⊢ e : τ`, donde `Γ` mapea nombres a tipos. Para suma: si `Γ⊢e1:int` y `Γ⊢e2:int`, entonces `Γ⊢e1+e2:int`. Para asignación se exige compatibilidad entre tipo del l-value y expresión. Para llamadas se compara aridad y tipos con la firma de la función.

## Conversión, coerción y promoción

Toda conversión implícita debe estar especificada. Una forma robusta es insertar nodos explícitos `Cast` en el typed AST o IR. De esta forma el backend no necesita re-descubrir por qué una conversión es válida. MiniC-RV puede comenzar sin conversiones implícitas para simplificar la prueba de tipos.

## Errores y recuperación semántica

Después de un error de tipo conviene usar un tipo especial `ErrorType` que sea compatible de forma controlada con operaciones posteriores para evitar cascadas. No significa aceptar el programa: permite seguir analizando y reportar errores independientes.

## Formalización

Regla de llamada: si `Γ(f) = (τ1,...,τn)->τr` y `Γ⊢ei:τi` para cada argumento, entonces `Γ⊢f(e1,...,en):τr`. Si una firma no coincide, el error se reporta en la llamada con referencia opcional a la declaración.

## Ejemplo trabajado

`int f(bool b){ return b; }` es sintácticamente válido. El resolver encuentra `b`, pero el type checker detecta que `return` espera `int` y recibe `bool`. El parser no debe intentar codificar esta regla.

## Traslado a implementación

Separe `Resolver` y `TypeChecker` si desea diagnósticos precisos y código mantenible. El resolver anota referencias a símbolos; el checker consume esas referencias y anota tipos. Para cursos más cortos pueden fusionarse, pero preserve conceptualmente las responsabilidades.

## Errores conceptuales frecuentes

- Insertar símbolo al primer uso.
- Comparar tipos por string si hay tipos compuestos.
- Reportar diez errores derivados de un identificador no resuelto.

## Ejercicios de dominio

1. Formalice reglas para `if`, `while` y `return`.
2. Implemente shadowing.
3. Diseñe `ErrorType`.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
