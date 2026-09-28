# Laboratorio — Resolver, tipos, TAC y CFG

## Fase 1 — nombres
Implemente pila de scopes, shadowing, símbolos de variables/funciones y diagnósticos de duplicación/no resolución.

## Fase 2 — tipos
Implemente `int`, `bool`, `void`, firmas y reglas de expresiones/statements. Use `ErrorType` para recuperación.

## Fase 3 — IR
Baje el typed AST a TAC y luego forme bloques básicos con terminador obligatorio.

## Fase 4 — CFG
Genere DOT del CFG. Verifique reachability y que cada target exista.

## Golden test
Archive source, AST, typed AST y TAC del mismo programa para visualizar la pérdida controlada de información entre niveles.
