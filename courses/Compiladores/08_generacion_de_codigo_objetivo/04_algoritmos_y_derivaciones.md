# Algoritmos y derivaciones — backend

## 1. Liveness worklist

Inicialice `IN/OUT` vacíos y repita hacia atrás:

```text
OUT[B] = union(IN[S] for S in succ[B])
IN[B]  = USE[B] union (OUT[B] - DEF[B])
```

Use una worklist priorizando bloques en reverse postorder inverso para acelerar convergencia.

## 2. Interference graph

Recorra instrucciones de cada bloque hacia atrás manteniendo `live`. Para una definición `d`, agregue aristas `d--l` para cada `l` vivo (salvo excepciones de move/coalescing). Luego `live = uses ∪ (live-defs)`.

## 3. Graph coloring heurístico

```text
while nodes:
  if exists node degree < K:
      push(simplify,node); remove
  else:
      choose spill_candidate; push(spill,node); remove
while stack:
  pop node
  choose color not used by colored neighbors
  if none: actual_spill
```

Después de reescribir spills, vuelva a calcular liveness e interferencia.

## 4. Encoding RISC-V R-type

Campos:

```text
31..25 funct7 | 24..20 rs2 | 19..15 rs1 | 14..12 funct3 | 11..7 rd | 6..0 opcode
```

Para codificar, mapear nombres de registros a índices y desplazar/máscarar cada campo. No confunda representación little-endian en memoria con el orden conceptual de bits de la palabra de instrucción.
