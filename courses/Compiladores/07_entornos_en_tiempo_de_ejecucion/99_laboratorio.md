# Laboratorio — Runtime y calling convention

Diseñe el frame layout de MiniC-RV para RISC-V.

1. Clasifique locals que pueden quedar en registros vs stack slots.
2. Defina prologue/epilogue.
3. Documente paso de argumentos y retorno.
4. Compile recursión y trace la pila.
5. Simule un heap pequeño y ejecute mark-sweep sobre un grafo de objetos.

### Pregunta obligatoria
¿Qué información necesitaría el GC para distinguir punteros de enteros en stack/registers?
