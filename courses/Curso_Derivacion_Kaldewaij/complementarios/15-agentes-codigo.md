# 15 · Agentes de código y derivación formal

**Módulo complementario.** **Carga:** 4 h. Referente teórico: capítulos 1–4 de Kaldewaij. Uso de Claude Code, Codex o Copilot como instrumento de ejecución; no se asume capacidad de prueba automática del LLM.

## Competencias a lograr

1. Redactar una instrucción operativa que obligue a un agente a partir de la especificación y a explicitar las pruebas, antes de editar código.
2. Organizar implementación y revisión de forma que el revisor no dependa de la narrativa del propio implementador.
3. Distinguir texto persuasivo, pruebas automatizadas y demostración matemática, etiquetando el nivel de evidencia.

**Evidencias:** dos prompts específicos de roles, una simulación de revisión con fallas formales sembradas y un registro de decisiones.

## 1. Riesgo principal

Un agente puede producir un algoritmo que pasa ejemplos pero falla para ciertos estados, o una derivación que salta una obligación matemática. No se acepta «la IA lo razonó» como justificación. El entregable debe ser **auditado por relaciones verificables**.

## 2. Agente implementador: entrada y salida

**Entradas obligatorias:** spec, restricciones de dominio, interfaz, código existente, convenciones del repositorio y criterio de formalidad.

**Salida requerida:** contrato normalizado, derivación anotada cuando aplique, código, pruebas vinculadas a obligaciones, medida de complejidad, excepciones y límites de demostración.

### Instrucción base

```text
Implementa exclusivamente la SPEC solicitada.
Antes de editar código:
1. Expresa P, Q y el espacio de estados.
2. Identifica entradas indefinidas y casos frontera.
3. Decide si hacen falta guardas, invariantes y función acotada.
4. Deriva cada operación con leyes del cálculo de predicados,
   cuantificaciones y wp siguiendo el método de Kaldewaij.
5. Declara supuestos sobre bibliotecas o sistemas externos.
6. Si surge una contradicción o laguna contractual, detente
   y registra la pregunta; no inventes la regla faltante.
Después implementa el programa más simple que satisfaga Q.
Entrega evidencias y no equipares pruebas con demostración.
```

## 3. Revisor independiente

El revisor recibe **la spec original y el diff real**, y no debe aceptar por defecto las afirmaciones del implementador. Comprobaciones:

- ¿Las precondiciones de la especificación están incluidas en las precondiciones derivadas?
- ¿Todas las ramas guardadas cumplen `Q` y cubren el dominio alcanzable?
- ¿Todos los ciclos preservan `I` y disminuyen una función acotada?
- ¿Los índices, divisiones y conversiones están definidos?
- ¿La traducción de la especificación al lenguaje preserva simultaneidad, números finitos y orden de evaluación?
- ¿La complejidad alegada corresponde al modelo de costo y a la implementación real?

## 4. Protocolo de tres resultados

Una revisión jamás se resume como «correcto» sin calificativos. Registrar:

- `PROBADO`: se proporcionó demostración cerrada y revisada dentro de los supuestos.
- `EVIDENCIADO`: tests o mediciones sustentan casos, no universalidad.
- `PENDIENTE`: la propiedad no ha sido demostrada ni verificada suficientemente.

Si una propiedad se apoya en una biblioteca, escribir `CONDICIONADO A: contrato de biblioteca X`. Esto evita que la documentación oculte un supuesto de infraestructura.

## 5. Ejemplo de revisión adversarial

El agente implementó:

```python
if p >= 0 and p <= 1:
    return {"prediction": p}
```

Posibles fallas:

1. ¿De qué tipo es `p`? Si no es numérico, puede producir error.
2. ¿Puede `p` provenir de una respuesta de otro request? Falta procedencia.
3. ¿Se invocó modelo con un request inválido? Falta propiedad de no invocación.
4. ¿El control de timeout mide la **latencia total**? No necesariamente.
5. ¿El payload de salida necesita versión o correlación? Debe constar en la spec.

No todas son fallas formales en el snippet; son **obligaciones que el fragmento no demuestra**.

## 6. Cuándo un agente debe detenerse

- La especificación exige un contrato contradictorio.
- Faltan predicados para definir una rama.
- Se pretende una garantía sobre un servicio externo sin hipótesis suficiente.
- No se puede exhibir una medida de terminación para un ciclo potencialmente no finito.
- La supuesta mejora algorítmica cambia resultados en casos frontera.

La conducta correcta es explicitar el impedimento y solicitar decisión, no producir código que lo esconda.

## 7. Actividades

1. Crea un prompt que solicite derivar búsqueda binaria sin mencionar su nombre.
2. Introduce una falla en el invariante de selección y pide a otro agente hallarla.
3. Clasifica cinco afirmaciones del agente como `PROBADO`, `EVIDENCIADO`, `PENDIENTE`.
4. Redacta criterio de merge que obligue a resolver las lagunas críticas sin exigir demostrar todo el framework HTTP.

**Criterio:** una derivación correcta debe poder revisarse **sin confiar** en el modelo que la produjo.
