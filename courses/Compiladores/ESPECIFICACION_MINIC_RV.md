# Especificación de referencia de MiniC-RV

MiniC-RV es el lenguaje de trabajo del curso. La especificación está deliberadamente acotada: suficiente para cubrir un compilador real de principio a fin, pero pequeña para que el estudiante pueda comprender cada fase.

## 1. Modelo léxico

### Keywords

`int`, `bool`, `void`, `if`, `else`, `while`, `return`, `true`, `false`.

### Identificadores

```text
[A-Za-z_][A-Za-z0-9_]*
```

Son sensibles a mayúsculas/minúsculas. Las keywords no pueden usarse como identificadores.

### Literales

- enteros decimales con signo expresado sintácticamente mediante unary minus;
- booleanos `true` y `false`.

El lexer reconoce `-` como operador; `-42` se parsea como `UnaryMinus(IntLiteral(42))`. Esto evita duplicar reglas léxicas y preserva la distinción entre resta y negación.

### Operadores

```text
=  ||  &&  ==  !=  <  <=  >  >=  +  -  *  /  %  !
```

### Delimitadores

`(){}[],;`

### Comentarios

- `// ...` hasta fin de línea;
- `/* ... */` no anidados en la versión base.

## 2. Gramática EBNF de referencia

```ebnf
program       = { functionDecl } EOF ;
functionDecl  = type IDENT "(" [ params ] ")" block ;
params        = param { "," param } ;
param         = type IDENT ;

type          = "int" | "bool" | "void" ;
block         = "{" { declaration | statement } "}" ;
declaration   = type IDENT [ "=" expression ] ";" ;

statement     = block
              | "if" "(" expression ")" statement [ "else" statement ]
              | "while" "(" expression ")" statement
              | "return" [ expression ] ";"
              | expression ";" ;

expression    = assignment ;
assignment    = logicalOr [ "=" assignment ] ;
logicalOr     = logicalAnd { "||" logicalAnd } ;
logicalAnd    = equality { "&&" equality } ;
equality      = comparison { ("==" | "!=") comparison } ;
comparison    = term { ("<" | "<=" | ">" | ">=") term } ;
term          = factor { ("+" | "-") factor } ;
factor        = unary { ("*" | "/" | "%") unary } ;
unary         = ("!" | "-") unary | call ;
call          = primary { "(" [ arguments ] ")" } ;
arguments     = expression { "," expression } ;
primary       = INT_LITERAL | "true" | "false" | IDENT | "(" expression ")" ;
```

## 3. Precedencia y asociatividad

De mayor a menor precedencia: llamadas, unary, multiplicativos, aditivos, comparaciones, igualdad, `&&`, `||`, asignación. La asignación es asociativa a la derecha; los operadores aritméticos binarios son asociativos sintácticamente a la izquierda.

## 4. Scope y binding

MiniC-RV usa **scope léxico**. Cada función y bloque introduce un scope. Se permite shadowing entre scopes diferentes; se prohíbe duplicar una declaración en el mismo scope. Toda referencia debe resolver exactamente a una declaración visible.

Las funciones pertenecen al scope global en la versión base. Las declaraciones se conocen después de su punto de aparición dentro del bloque; las funciones globales pueden resolverse en dos pasadas para permitir recursión mutua.

## 5. Tipos

- `int`: entero con signo lógico de 64 bits para el backend RV64;
- `bool`: `true`/`false`;
- `void`: solo para retorno de función.

No existen conversiones implícitas entre `int` y `bool` en la versión base. Esto evita que el parser o backend tengan que inferir coerciones no documentadas.

### Reglas principales

- `+ - * / %`: `int × int -> int`.
- `< <= > >=`: `int × int -> bool`.
- `== !=`: operandos del mismo tipo no `void`, resultado `bool`.
- `&& || !`: booleanos.
- condición de `if`/`while`: `bool`.
- asignación: ambos lados del mismo tipo; el lado izquierdo debe ser asignable.
- llamada: aridad y tipos deben coincidir con la firma.
- `return`: compatible con el tipo declarado de la función.

## 6. Semántica de evaluación

- operandos se evalúan de izquierda a derecha;
- `&&` y `||` usan short-circuit;
- una asignación devuelve el valor asignado solo si el curso decide habilitar expresiones de asignación; la implementación base puede restringirla a statement para simplificar;
- división por cero es error de runtime o trap del target; el optimizador no puede eliminar una división potencialmente ejecutada sin justificarlo.

## 7. Enteros y overflow

Para hacer reproducible el backend, la versión base adopta aritmética modular de 64 bits para suma/resta/multiplicación. Comparaciones son signed. El curso puede cambiar esta decisión por “overflow undefined” como extensión, pero entonces debe revisar qué optimizaciones algebraicas se vuelven válidas.

## 8. Runtime y ABI

- target base: RV64I; extensión `M` opcional;
- argumentos enteros/booleanos: registros `a0-a7` y stack para excedentes;
- retorno escalar: `a0`;
- `sp` debe respetar la alineación requerida por la ABI elegida;
- el proyecto documentará qué registros considera caller/callee saved.

## 9. Diagnósticos

Todo token/nodo conserva un `SourceSpan`:

```text
SourceSpan(file, start_offset, end_offset, start_line, start_col, end_line, end_col)
```

Un diagnóstico contiene código, severidad, mensaje, span primario y spans secundarios opcionales. Ejemplo:

```text
E0302: tipos incompatibles en return
  --> demo.mc:7:12
   |
 7 |     return flag;
   |            ^^^^ se esperaba int, se obtuvo bool
   |
 2 | int f(bool flag) {
   | --- función declarada con retorno int
```

## 10. Extensiones opcionales

Arrays, punteros, strings, `for`, `break/continue`, structs, closures y heap pueden incorporarse después del compilador base. Cada extensión debe modificar explícitamente léxico, gramática, AST, reglas semánticas, IR, runtime y backend donde corresponda.
