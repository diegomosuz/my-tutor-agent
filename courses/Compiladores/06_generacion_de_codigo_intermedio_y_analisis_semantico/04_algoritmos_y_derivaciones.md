# Algoritmos y derivaciones — semántica, IR y CFG

## 1. Resolución de nombres con pila de scopes

```text
enterScope(): scopes.push({})
exitScope():  scopes.pop()
declare(name,symbol):
    if name in scopes.top: duplicate-error
    scopes.top[name]=symbol
resolve(name):
    for scope from inner to outer:
        if name in scope: return scope[name]
    unresolved-error
```

La resolución debe anotar cada `VarRef` con identidad de símbolo. Luego renombrar variables deja de depender de strings.

## 2. Type checker por reglas

```text
check(Binary(+ ,a,b)):
    ta=check(a); tb=check(b)
    require ta==int && tb==int
    return int
```

Los statements devuelven normalmente `void`/estado, pero `return` necesita el tipo esperado de función como contexto heredado.

## 3. Construcción de basic blocks

Un líder es:
- primera instrucción;
- target de branch;
- instrucción inmediatamente posterior a un branch/return si existe.

Corte el stream en líderes y conecte según terminadores. Valide que no haya instrucciones después de un terminador dentro del mismo bloque.

## 4. Backpatching

Para una lista de saltos incompletos:

```text
makelist(i) -> [i]
merge(p1,p2) -> concatenación
backpatch(list,label):
    for i in list: instruction[i].target = label
```

En booleanos, mantenga `truelist` y `falselist`. En statements, `nextlist` modela saltos pendientes hacia la continuación.
