---
id: "m05_t05"
title: "Functional API y recuperación de tareas"
module: "Orquestación avanzada"
module_order: 5
topic_order: 5
duration_minutes: 20
level: "intermedio-avanzado"
language: "es"
prerequisites: "Graph API y persistencia del módulo 4."
objectives: ["Expresar un flujo con entrypoint y task.", "Diferenciar reejecución de código y reutilización de resultados persistidos."]
---

# 5.5. Functional API y recuperación de tareas

**Módulo 5: Orquestación avanzada · Dedicación estimada: 20 minutos**

## Qué vas a poder hacer

- Expresar un flujo con entrypoint y task.
- Diferenciar reejecución de código y reutilización de resultados persistidos.

**Antes de empezar:** Graph API y persistencia del módulo 4.

## Un estilo distinto sobre el runtime

La Functional API permite expresar el flujo con funciones de Python y decoradores, conservando capacidades del runtime. Puede ser cómoda cuando tenemos lógica imperativa existente y la estructura del grafo explícito no aporta suficiente claridad adicional.

entrypoint define la entrada del workflow y task delimita unidades de trabajo. Las tareas devuelven futuros y result obtiene el valor en esta variante síncrona. En código asíncrono utilizaríamos las formas correspondientes.

La salida de este ejemplo es el valor de la función, una cadena. No mezclamos automáticamente ese contrato con el GraphOutput v2 de nuestros ejemplos de StateGraph.

Al recuperar una ejecución, la función de entrada puede volver a recorrerse mientras el runtime reutiliza resultados de tareas completadas. Por eso preservamos un orden coherente y encapsulamos trabajo no determinístico o con efectos en tareas apropiadas. La idempotencia externa sigue siendo necesaria.

Graph API destaca cuando queremos ver y controlar topología y canales de estado. Functional API resulta útil para flujos expresados naturalmente como código. No es necesario combinarlas por defecto. Elegimos la que haga más claro el control y la recuperación de nuestro caso.

```python
from langgraph.func import entrypoint, task
from langgraph.checkpoint.memory import InMemorySaver

@task
def normalize(text: str):
    return text.strip()

@entrypoint(checkpointer=InMemorySaver())
def flow(text: str):
    return normalize(text).result()

value = flow.invoke(" VPN ", {
    "configurable": {"thread_id": "functional-1"}
})
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos los decoradores de la API funcional. |
| 2 | Usamos un checkpointer en memoria para el ejemplo. |
| 4 | task define una unidad de trabajo con resultados gestionados por el runtime. |
| 5 | La función recibe un texto. |
| 6 | Quitamos espacios externos mediante una operación pura. |
| 8 | entrypoint define la entrada persistente del workflow. |
| 9 | flow organiza el control mediante Python ordinario. |
| 10 | normalize devuelve un futuro de tarea y result obtiene su valor. |
| 12 | Invocamos la entrada funcional con un texto. |
| 13 | La configuración identifica el thread. |
| 14 | Cerramos la invocación, cuyo valor de dominio será VPN. |

[Archivo ejecutable: functional.py](../_laboratorio/functional.py)

## Qué sucede al ejecutar

normalize elimina espacios externos. El decorador task convierte esa función en una unidad rastreable por el runtime. flow es la entrada del workflow y recibe la cadena original. normalize(text) devuelve un futuro; result obtiene el valor en esta variante síncrona. El resultado final es VPN, una cadena ordinaria.

El InMemorySaver permite conservar información durante la vida del proceso. El thread_id vincula la ejecución con su historial. Persistencia durable entre procesos requiere otro backend y reconstruir una definición compatible del flujo, como en Graph API.

## Reejecución y tareas

El runtime puede volver a recorrer el cuerpo del entrypoint al recuperar una ejecución y reutilizar resultados de tareas completadas. Por eso debe ser posible reproducir el orden lógico de las tareas. Una llamada aleatoria o una consulta externa realizada libremente fuera de esas fronteras puede cambiar decisiones durante la recuperación.

Encapsulá operaciones no determinísticas y efectos en unidades adecuadas. Aun así, una tarea no crea una transacción atómica con un receptor remoto. Si el receptor aceptó una escritura y el proceso falló antes de persistir su resultado, se mantiene el problema de idempotencia explicado en el módulo 4.

## Comparación práctica

| Pregunta | Graph API | Functional API |
| --- | --- | --- |
| ¿Cómo se ve el control? | Nodos, aristas y canales | Flujo de funciones Python |
| ¿Cómo se expresa una unidad? | Nodo | Task |
| ¿Qué ayuda a comprender? | Topología y estado compartido | Lógica imperativa y secuencias |
| ¿Se necesita diseñar recuperación? | Sí | Sí |
| ¿Los efectos quedan automáticamente protegidos? | No | No |

## Actividad

Agregá una task que convierta el texto a mayúsculas después de normalize. Dibujá las dos dependencias y predecí el resultado para « vpn ». Después explicá qué cambiaría si la segunda tarea consultara un servicio externo en vez de transformar una cadena.

### Solución conceptual

La entrada de la segunda task debe provenir del resultado de la primera. El resultado sería VPN. Para una consulta externa hay que tratar timeout, errores y recuperación; para una escritura también idempotencia. La elección del estilo de API no elimina esas responsabilidades.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Puedo leer value.value después de flow.invoke en este ejemplo?

### Respuesta razonada

No. El valor devuelto por flow es directamente una cadena. GraphOutput v2 corresponde al contrato elegido en los ejemplos de StateGraph, no a cualquier objeto retornado por todo el ecosistema.

## Documentación para profundizar

- [Functional API](https://docs.langchain.com/oss/python/langgraph/functional-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../05_Orquestacion_avanzada/04_subgrafos_y_fronteras_de_estado.md) · [Siguiente](../05_Orquestacion_avanzada/06_patrones_de_orquestacion_y_practica_integradora.md)
