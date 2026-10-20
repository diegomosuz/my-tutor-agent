# Errores frecuentes y mecanismos de refutación

## Error 1 — Igualdad donde solo hay implicación

Se intenta simplificar `P⇒Q` como si fuera `P≡Q`. Contraejemplo: `x≥3⇒x≥0`, pero `x≥0` no implica `x≥3`. **Corrección:** mantener la dirección en el margen de cada paso.

## Error 2 — Invariante verdadero únicamente al terminar

Proponer `I≡r=respuestaFinal` antes de haber construido `r` no implica que sea inicializable. **Corrección:** usar constante → variable, conjunción apropiada o fortalecimiento que admita estado inicial.

## Error 3 — Invariante que no implica la postcondición al salir

`I≡0≤n≤N` es válido para un contador, pero al terminar `n=N` no dice nada sobre la suma. **Corrección:** incluir la propiedad que relaciona el acumulador con los datos.

## Error 4 — Preservación sin terminación

El ciclo `do true→skip od` preserva `true`, pero no termina. **Corrección:** exhibir función acotada que decrece en cada rama.

## Error 5 — Guardas no exhaustivas

`if x>0→r:=x [] x<0→r:=-x fi` aborta cuando `x=0`. **Corrección:** incluir igualdad o predicado cubriente, y justificarlo.

## Error 6 — Superposición confundida con `if/elif`

En comandos guardados, si varias ramas son verdaderas, cualquiera puede ejecutarse; una implementación con prioridad puede seleccionar solo la primera. Esto puede ser aceptable solo si **la especificación y la prueba** siguen siendo satisfechas.

## Error 7 — Evaluar una expresión indefinida

`f.n` en `n=N`, `a div b` en `b=0`, `min` sobre un rango vacío sin convención. **Corrección:** introducir precondiciones o separar guardas para garantizar definición.

## Error 8 — Sustitución secuencial de una asignación simultánea

`x,y := y,x` no equivale a `x:=y; y:=x`. **Corrección:** razonar con ambos valores previos en el cálculo de `wp`.

## Error 9 — Descartar candidatos por intuición

En búsqueda binaria o slope search, descartar sin usar la precondición de orden puede perder soluciones. **Corrección:** demostrar `(∀c∈D:¬Sol(c))` o la dominancia relevante.

## Error 10 — Fórmula de segmento mal delimitada

Confundir `[p,q)` con `[p,q]` cambia longitud y cuenta extremos. **Corrección:** revisar explícitamente índices incluidos; casos `p=q` y `q=N`.

## Error 11 — Confundir orden con ordenamiento

Devolver un arreglo ordenado de valores nuevos satisface `Ord` pero viola `Perm`. **Corrección:** conservar multiconjunto de entradas.

## Error 12 — Contar anidaciones como complejidad

Dos ciclos anidados no siempre implican `O(N²)`; si las fronteras se mueven monótonamente un total de `N` veces, el trabajo puede ser lineal. **Corrección:** contar actualizaciones reales de cada índice.

## Error 13 — Complejidad nominal con operandos crecientes

`O(log N)` multiplicaciones de números de `Θ(N)` bits no implican `O(log N)` trabajo en bits. **Corrección:** declarar el modelo de costo.

## Error 14 — Exactitud de modelo estadístico confundida con corrección de API

Demostrar `0≤prediction≤1` no demuestra que `prediction` esté calibrada. **Corrección:** separar contratos del software y validación estadística.

## Error 15 — Test aceptado como prueba universal

Cien mil pruebas exitosas no establecen una proposición para todo entero natural. **Corrección:** registrar la propiedad como «evidenciada» a menos que exista demostración, verificación exhaustiva finita o prueba de herramienta con su teoría.

## Error 16 — Las skills se presentan como verificadores automáticos

Una instrucción de agente puede inducir una derivación bien redactada pero falsa. **Corrección:** auditoría independiente de relaciones, hipótesis y código.
