# Máquina objetivo, direcciones, bloques básicos y flow graphs

**Módulo 08.**

## Cobertura

Cubre 8.1–8.5.

## Idea central

La generación de código transforma operaciones virtuales en instrucciones concretas bajo restricciones de una ISA y ABI.

## Modelo de máquina objetivo

La ISA define operaciones, registros, tamaños, formatos e addressing. El compilador necesita además costos aproximados y restricciones. RISC-V separa operaciones aritméticas de loads/stores, por lo que un valor en memoria debe cargarse a registro antes de sumarse. Esta regularidad hace visibles las responsabilidades de instruction selection y register allocation.

## Bloques básicos

Un bloque básico es una secuencia maximal con una sola entrada y salida controlada por su terminador: si se ejecuta la primera instrucción, se ejecutan todas hasta el final sin saltos internos. Los líderes se identifican por entrada de función, targets de saltos y la instrucción posterior a un salto. Los bloques forman nodos del CFG.

## DAG de bloque y optimización local

Dentro de un bloque sin branches es posible modelar dependencias con DAG y eliminar subexpresiones comunes, copias o código muerto local. Pero loads/stores y aliasing introducen dependencias de memoria que impiden tratar expresiones aparentemente iguales como idénticas sin análisis adicional.

## Ejemplo trabajado

IR: `t1=a+b; t2=t1*8; x=t2`. Si `a` y `b` ya están en registros, RISC-V puede usar `add` seguido de shift `slli` por 3 en vez de multiplicación general. Esa decisión es selección de instrucciones, no optimización algebraica del parser.

## Traslado a implementación

Cree una descripción central del target: registros allocatable, clases, caller/callee saved, tamaño de palabra y helpers de encoding. No codifique estas reglas dispersas en cada visitor.

## Errores conceptuales frecuentes

- Asumir memoria-a-memoria en una ISA load/store.
- Tratar pseudo-instrucciones como encoding real.
- Ignorar ABI.

## Ejercicios de dominio

1. Identifique líderes.
2. Construya CFG.
3. Proponga dos selecciones para multiplicar por 8.

## Preguntas de control

- ¿Qué representación entra a esta fase?
- ¿Qué representación sale?
- ¿Qué invariantes deben cumplirse?
- ¿Qué errores se detectan aquí y cuáles pertenecen a otra fase?
- ¿Cómo demostraría que una transformación preserva la semántica?
