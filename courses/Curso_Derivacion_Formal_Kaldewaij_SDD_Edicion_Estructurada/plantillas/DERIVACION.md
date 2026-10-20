# Derivación formal — SPEC-NNN

## 1. Especificación de referencia

**P:** `[predicado]`  
**Q:** `[predicado]`  
**Espacio de estados:** `[dominios]`  
**Supuestos:** `[todas las hipótesis, incluidas externas]`

## 2. Elección de estrategia

- Técnica del libro: `[conjuncts | replace constants | strengthen | tail invariant | search | ...]`.
- Por qué aplica: `[propiedad matemática que habilita la transformación]`.
- Alternativas descartadas: `[razón]`.

## 3. Derivación algebraica

```text
Objetivo inicial
≡ {ley y condiciones de aplicación}
Predicado transformado
⇒ {cuando corresponda, fortalecer}
Condición suficiente
```

No usar `≡` si la transformación solo garantiza implicación.

## 4. Invariante (si hay repetición)

$$I\equiv[\text{predicado}]$$

**Inicialización:** `[Init y cálculo wp]`.  
**Guarda:** `[B y prueba de salida]`.  
**Cuerpo:** `[operaciones derivadas, preferentemente asignaciones simultáneas]`.  
**Función acotada:** `$t=[...]$` con prueba `t≥0` y `t'<t`.

## 5. Obligaciones de prueba

| ID | Fórmula | Justificación | Estado |
|---|---|---|---|
| PO-INIT | `{P}Init{I}` | `[ley]` | Pendiente |
| PO-CONS | `{I∧B}S{I}` | `[ley]` | Pendiente |
| PO-EXIT | `I∧¬B⇒Q` | `[ley]` | Pendiente |
| PO-BOUND | `I∧B⇒t≥0` | `[ley]` | Pendiente |
| PO-DEC | `t'<t` | `[ley]` | Pendiente |
| PO-DEF | Expresiones definidas | `[dominio]` | Pendiente |

## 6. Programa derivado en comandos guardados

```text
|[ con ...; {P}
   var ...;
   ...
   {invariant:I; bound:t}
   do ... od
   {Q}
]|
```

## 7. Traducción al lenguaje y semántica

- Mapear `div`, `mod`, asignación simultánea y arreglo.
- Anotar supuestos de tipos, números y dependencias.
- Explicar toda diferencia intencional con el programa derivado.

## 8. Eficiencia

**Tiempo:** `[derivación de número de pasos]`.  
**Espacio:** `[derivación de memoria auxiliar]`.  
**Modelo de costo:** `[operaciones básicas y exclusiones]`.

## 9. Cierre

- Propiedades demostradas: `[lista]`.
- Propiedades probadas experimentalmente: `[lista]`.
- Pendientes/condicionadas: `[lista, responsable]`.
