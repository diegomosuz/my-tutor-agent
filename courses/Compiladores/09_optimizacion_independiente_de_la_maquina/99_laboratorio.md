# Laboratorio — Optimizador -O1

Implemente un pipeline mínimo:
1. unreachable block elimination;
2. constant propagation/folding;
3. copy propagation;
4. dead code elimination;
5. local value numbering;
6. LICM opcional.

Cada pase debe exponer `changed: bool`. Use pruebas de equivalencia ejecutando IR antes/después o comparando la salida RISC-V.

### Métrica
Reporte instrucciones IR, bloques y assembly antes/después. No considere una reducción de instrucciones como prueba suficiente de corrección.
