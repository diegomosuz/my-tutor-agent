# 17 · Verificación, evidencia y aceptación de una feature

**Módulo complementario.** **Carga:** 4 h. Distingue demostración algebraica (método del libro), pruebas de ejecución y revisión de correspondencia entre código y especificación.

## Competencias a lograr

1. Convertir cada obligación matemática en una evidencia verificable, manteniendo explícita la diferencia entre prueba formal y test.
2. Revisar correspondencia entre implementación y derivación, especialmente en guardas, asignaciones simultáneas, límites de índices y semántica numérica.
3. Definir criterios de aceptación reproducibles para agentes y revisiones de Pull Request.

**Evidencias:** matriz `PO→argumento→prueba→resultado`, contraejemplos, reporte de límites de validez.

## 1. Obligaciones del Invariance Theorem

Para:

```text
{P} Init;
{invariant: I; bound: t}
do B₀ → S₀ [] B₁ → S₁ od
{Q}
```

registrar:

| Obligación | Forma |
|---|---|
| `PO-INIT` | `{P}Init{I}` |
| `PO-CONS-0` | `{I∧B₀}S₀{I}` |
| `PO-CONS-1` | `{I∧B₁}S₁{I}` |
| `PO-EXIT` | `I∧¬B₀∧¬B₁⇒Q` |
| `PO-BOUND` | `I∧(B₀∨B₁)⇒t≥0` |
| `PO-DEC-0/1` | `t'<t` en cada rama habilitada |
| `PO-DEF` | todas las expresiones están definidas |

No basta con que un test cubra una rama; hay que probar universalmente su efecto sobre el invariante para todos los estados que satisfacen la premisa.

## 2. Ejemplo de `wp` y prueba

Programa `y:=x*x`. Postcondición `y≥0`. Para enteros matemáticos:

$$wp.(y:=x^2).(y\ge0)\equiv x^2\ge0\equiv true.$$

Así se puede demostrar universalmente. Pero en una implementación con enteros con overflow o flotantes especiales, la equivalencia necesita revisar la semántica de multiplicación. En Python, enteros arbitrariamente grandes preservan la propiedad; en `float`, `NaN` no satisface comparaciones usuales.

Un test con mil enteros **no es** la demostración matemática; es una comprobación de la traducción para muestras de valores.

## 3. Correspondencia de semántica

| Elemento de derivación | Riesgo en código | Verificación recomendada |
|---|---|---|
| Asignación simultánea | Reutilizar valor ya actualizado | Comparar con temporales/tuple assignment |
| Guardas múltiples | Convertir no determinismo en prioridad incorrecta | Analizar superposición y postcondiciones de todas las ramas |
| División entera | Truncamiento distinto en negativos | Declarar dominio y semántica `div/mod` |
| Índice `f.n` | Acceso fuera de rango | Probar `0≤n<N` antes de indexar |
| Reales | `NaN`, infinitos, error de redondeo | Restringir dominios y tolerancias justificadas |
| Recursión/ciclo | Falta de terminación | Función acotada o contrato externo |
| Tiempo `O(N)` | Costos ocultos (I/O, estructuras) | Definir modelo de costo y medir |

## 4. Jerarquía de evidencia

**Demostración:** cadena lógica auditable que establece una propiedad bajo hipótesis nombradas.

**Chequeo mecanizado:** una herramienta examina efectivamente todas las obligaciones dentro de su teoría/configuración; no todo linter o type-checker lo hace.

**Test de propiedades:** genera muchos casos y puede hallar contraejemplos; no convierte la evidencia en demostración universal salvo exhaustividad finita certificada.

**Test de ejemplo:** confirma un escenario concreto; útil para integración pero débil para corrección general.

**Medición:** muestra costo observado de una ejecución; no sustituye el análisis matemático de peor caso.

## 5. Gate de Pull Request

Bloquea si:

1. Se viola una pre/postcondición obligatoria.
2. Queda una obligación crítica sin razón explícita.
3. No se declaró dependencia externa de la que depende la garantía.
4. El algoritmo implementado no corresponde al derivado.
5. La complejidad esperada no es compatible con la implementación y los datos objetivo.

Permite continuar si la propiedad es de bajo riesgo y figura aceptada como `PENDIENTE`, con un responsable y una fecha de resolución. La decisión es de gobernanza del proyecto; no es un teorema del libro.

## 6. Laboratorio de refutación

Se entrega un candidato `l,h:=0,N; while l<h: m=(l+h)//2; if f[m]<=a:l=m; else:h=m`. Encontrar por qué puede **no terminar** con `h=l+1` y `f[l]≤a`: se calcula `m=l`, luego `l:=m` no cambia el estado. El problema no se descubre solo en tests promedio: la función `h-l` no disminuye en esa rama.

**Corrección derivada:** para una búsqueda de primera posición con `f.i>a`, usar `l:=m+1` al descartar la mitad inferior y una poscondición compatible; reconstruir `I` y `Q` antes de cambiar el código.

## 7. Ejercicios

1. Clasifica cinco afirmaciones sobre una API como demostradas, ensayadas o condicionadas.
2. Deriva un caso de no terminación de una búsqueda binaria incorrecta.
3. Muestra una refutación por `NaN` de una postcondición numérica incompleta.
4. Construye un test que detecte que una respuesta de ML proviene de otro request.
5. Define un límite de complejidad aceptable para una spec de procesamiento masivo con justificación de datos.
