# Algoritmos y derivaciones — runtime y GC

## 1. Layout de frame

Un algoritmo simple:

1. determine registros callee-saved usados;
2. asigne slots a spills/locals que requieren dirección;
3. reserve área para `ra`/`fp` si corresponde;
4. redondee el tamaño a la alineación ABI;
5. emita prologue que decrementa `sp` y salva;
6. emita epilogue simétrico.

La simetría puede verificarse automáticamente: todos los caminos de retorno deben restaurar el mismo layout.

## 2. Mark-sweep

```text
mark(o):
  if o == null or marked(o): return
  set_mark(o)
  for ref in pointer_fields(o): mark(ref)

for root in roots: mark(root)
for object in heap:
  if marked(object): clear_mark(object)
  else free(object)
```

La recursión real puede reemplazarse por stack explícito para evitar overflow del collector.

## 3. Copying collector

`forward(p)` copia un objeto de from-space a to-space la primera vez y deja forwarding pointer. Los roots se actualizan con `forward`; luego se escanea to-space actualizando campos hasta que scan pointer alcanza allocation pointer.

Invariante de Cheney: todo objeto antes de `scan` fue copiado y sus referencias ya fueron reenviadas; entre `scan` y `free` fue copiado pero aún puede contener referencias a from-space.

## 4. Generacional

Una write barrier se ejecuta cuando se escribe una referencia y mantiene un remembered set de old objects que apuntan a young. Un minor collection puede escanear roots + remembered set en vez de toda old generation.
