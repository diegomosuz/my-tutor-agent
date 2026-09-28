# Selección de instrucciones y generación local

**Módulo 08.**

## Cobertura

Cubre 8.6, 8.9–8.11.

## Idea central

Instruction selection es un problema de pattern matching y costo: cubrir operaciones de IR con instrucciones o secuencias del target.

## Tree covering

Para expresiones puras, el IR puede representarse como árbol. Reglas de target cubren patrones: `Reg <- add(Reg,Reg)` o `Reg <- add(Reg,Const12)` si existe immediate. Un selector greedy puede ser suficiente en ISA regular; dynamic programming encuentra cobertura de costo mínimo para árboles bajo un modelo de costos.

## BURS e idea de optimalidad local

Bottom-up rewrite systems etiquetan cada nodo con costos mínimos para producir distintos nonterminals de máquina. Después se reconstruye la selección. La “optimalidad” depende del modelo: no considera necesariamente presión de registros, cache o scheduling global.

## Addressing y folding

En arquitecturas con addressing modes complejos, partes del cálculo de dirección pueden plegarse en loads/stores. RISC-V mantiene addressing `base+imm`, simplificando reglas pero requiriendo instrucciones explícitas para índices más complejos.

## Formalización

Defina `cost(node, goal)` como mínimo sobre reglas aplicables `r` de `cost(r) + Σ cost(child_i, goal_i)`. Guarde también la regla elegida para reconstrucción. Este esquema es programación dinámica sobre el árbol.

## Ejemplo trabajado

Para `x + 5`, si 5 cabe en 12 bits, `addi rd,rs,5` domina a cargar 5 en un registro y ejecutar `add`. Para una constante grande, el backend debe materializarla mediante `lui/addi` o pseudo-instrucción expandida por assembler.

## Traslado a implementación

El proyecto puede comenzar con reglas directas por opcode de TAC y evolucionar a pattern matching. Mantenga tests que verifican semántica, no solo texto exacto, porque múltiples secuencias válidas pueden existir.

## Errores conceptuales frecuentes

- Suponer que menos instrucciones siempre implica menor costo.
- Olvidar rangos de inmediatos.
- Acoplar selección con asignación física prematuramente.

## Ejercicios de dominio

1. Seleccione instrucciones para comparaciones.
2. Calcule costo de dos coberturas.
3. Maneje constantes fuera de rango.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
