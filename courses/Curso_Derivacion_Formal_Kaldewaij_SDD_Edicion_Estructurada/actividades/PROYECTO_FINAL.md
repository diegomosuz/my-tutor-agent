# Proyecto final integrador por competencias

## Desafío

Diseñar, **derivar**, implementar y verificar una capacidad de software que reciba un arreglo de probabilidades de un proceso de ML (valores finitos en `[0,1]`) y obtenga dos resultados determinísticos:

1. Cantidad de predicciones que superan o igualan un umbral `T`.
2. Longitud del segmento contiguo más largo de predicciones que superan o igualan `T`.

Publicar esa capacidad como `POST /analyze-predictions` y documentarla como una spec SDD independiente. No se requiere entrenamiento de un modelo: el objetivo es demostrar corrección de **la lógica consumidora**.

## Competencias evaluadas

- Formalización de arreglos y cuantificaciones (CT1).
- Derivación de actualizaciones y fortalecimiento de invariante (CT2).
- Corrección de ciclo, salida y terminación (CT3).
- Análisis `O(N)` y memoria `O(1)` (CT4).
- Traducción a Python y contract testing (CT5).
- Evidencias y revisión adversarial (CT6).
- Artefactos de feature SDD (CT7).

## Especificación matemática mínima

Constantes: `N≥0`, `f:[0..N)→[0,1]` con números finitos, `T∈[0,1]` finito. Variables resultado `c,r`:

$$c=(\#i:0\le i<N:f.i\ge T),$$

$$r=(\max p,q:0\le p\le q\le N\land(\forall i:p\le i<q:f.i\ge T):q-p).$$

**Caso vacío:** para `N=0`, `c=r=0`. **Entradas inválidas:** debe especificarse respuesta controlada sin procesar predicciones.

## Trabajo por fases

### Fase 1 — SDD

Entregar `spec.md` con alcance, `P/Q`, dominio, modelo de error, dependencias y criterios de aceptación; `plan.md` con diseño mínimo y `tasks.md` con tareas ejecutables.

### Fase 2 — Derivación

Construir `derivation.md` desde `Q` usando reemplazo de constante `N` por `n`. Fortalecer con un valor auxiliar `s` (longitud del sufijo válido) para actualizar el máximo `r`. Probar:

- `I` se establece con valores iniciales.
- Cada caso `f.n≥T` y `f.n<T` preserva `I`.
- Al salir `n=N`, los valores son `c` y `r` esperados.
- `N-n` disminuye y es inferiormente acotado.
- La implementación realiza a lo sumo una inspección de cada elemento.

**No se proporciona aquí la actualización concreta:** derivarla es parte evaluada del proyecto.

### Fase 3 — Implementación

Construir API FastAPI en Python (o backend equivalente autorizado). Rechazar valores no finitos, booleanos y valores fuera de `[0,1]` según el contrato que se declare. Evitar bibliotecas complejas: basta un recorrido lineal.

### Fase 4 — Evidencia y revisión

Ejecutar tests: `[]`, `[0.9]`, `[0.1]`, `[0.8,0.8,0.1,0.8]` con umbrales relevantes, secuencia toda válida, toda inválida, valores exactamente iguales a `T`, y entrada con `NaN` si el transporte permite representarlo. Hacer revisión independiente basada en `spec.md` y diff.

### Fase 5 — Informe

Presentar:

- Derivación anotada completa.
- Correspondencia de cada paso formal con líneas del código.
- Matriz de obligaciones y tests.
- Complejidad demostrada y tiempo observado (con tipo de máquina y tamaño de entrada).
- Propiedades no demostradas y supuestos de biblioteca.

## Rúbrica

Usar `recursos/RUBRICA_COMPETENCIAS.md`. Requisito obligatorio de aprobación: D1, D2 y D3 al menos nivel 3; la mera ejecución de los tests no reemplaza la derivación.

## Ampliación opcional

Añadir una tercera salida: índice de comienzo del segmento más largo, con política de empate explícita (primero o último). Derivar variables auxiliares adicionales **solo si hacen falta**, manteniendo la memoria `O(1)`.
