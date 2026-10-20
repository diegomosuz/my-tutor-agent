# Rúbrica analítica de competencias

## Escala

| Nivel | Desempeño observable |
|---|---|
| **0 — No evidenciado** | La entrega no permite verificar la competencia. |
| **1 — Inicial** | Conceptos parcialmente correctos, con errores centrales o razonamiento incompleto. |
| **2 — En desarrollo** | Solución parcialmente justificada; necesita correcciones significativas. |
| **3 — Competente** | Demuestra corrección bajo supuestos claros; entrega revisable, completa y razonada. |
| **4 — Avanzado** | Demostración sólida, considera contraejemplos, eficiencia y límites de transferencia. |

## Dimensiones (ponderación)

| Dimensión | Peso | Nivel 3 = competente |
|---|---:|---|
| D1. Especificación formal | 20 % | P/Q, dominios, casos límite inequívocos |
| D2. Cálculo y derivación | 25 % | Transformaciones justificadas sin saltos críticos |
| D3. Corrección y terminación | 25 % | Invariante, salida y función acotada correctos |
| D4. Eficiencia y traducción | 15 % | Complejidad válida y código fiel a las operaciones |
| D5. Evidencias y comunicación | 15 % | Pruebas y supuestos bien clasificados y trazables |

## Regla de logro

**Competencia lograda:** puntuación ponderada ≥3/4 **y** D1, D2 y D3 al menos 3/4. Una entrega de código que pasa tests puede quedar «en desarrollo» si no demuestra propiedades esenciales.

## Conversión opcional a nota sobre 10

`nota = 2.5 × puntuación_ponderada`, redondeada según la política institucional. La escala de competencias es la referencia y la nota solo un indicador secundario.

## Ejemplo de evaluación

| Dimensión | Nivel | Ponderado |
|---|---:|---:|
| D1 | 4 | 0.80 |
| D2 | 3 | 0.75 |
| D3 | 3 | 0.75 |
| D4 | 2 | 0.30 |
| D5 | 3 | 0.45 |
| **Total** | | **3.05 / 4** |

Se considera competente, pero requiere mejorar la justificación de eficiencia y de la traducción. El feedback debe indicar **qué obligación está pendiente** y **cómo evidenciarla**, no limitarse a «mejorar código».
