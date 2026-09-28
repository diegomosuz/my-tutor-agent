---
id: "m05_t02"
title: "Distribución dinámica con Send"
module: "Orquestación avanzada"
module_order: 5
topic_order: 2
duration_minutes: 25
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópico 5.1 y reducers."
objectives: ["Crear tareas cuyo número se conoce durante la ejecución.", "Diseñar entradas de trabajador y resultados acumulados."]
---

# 5.2. Distribución dinámica con Send

**Módulo 5: Orquestación avanzada · Dedicación estimada: 25 minutos**

## Qué vas a poder hacer

- Crear tareas cuyo número se conoce durante la ejecución.
- Diseñar entradas de trabajador y resultados acumulados.

**Antes de empezar:** Tópico 5.1 y reducers.

## Cuando no conocemos la cantidad de ramas

Este archivo se llama fanout.py y es independiente de los anteriores. sources indica qué fuentes debemos consultar. Puede contener una, dos o ninguna. results acumula resultados y summary expresa la reunión final.

Las fuentes locales permiten observar el paralelismo sin variabilidad de red. Consultar DATA no es recuperación semántica ni una API real. En producción search sería un adaptador que consulta la fuente solicitada, con su timeout y permisos.

La cantidad de trabajos depende de sources. No queremos construir un nodo diferente para cada elemento. Send nos permitirá dirigir varias tareas al mismo nodo search, cada una con su propio identificador de fuente.

La entrada particular de un trabajador puede ser distinta del estado global. El trabajador sólo necesita el dato correspondiente a su tarea y devuelve una actualización compatible con el canal de resultados del padre.

El reducer concatena listas. Por eso cada trabajador devolverá una lista de un elemento. Si dos fuentes generan el mismo texto, add no lo deduplicará. La identidad de fuente permanecerá en el resultado para evitar confundir observaciones.

summary usa reemplazo porque lo escribirá un único nodo al reunir. No todo campo debe acumular. Diseñamos una regla de escritura para cada responsabilidad.

```python
from operator import add
from typing import Annotated, TypedDict
from langgraph.types import Send
from langgraph.graph import StateGraph, START, END

class FanState(TypedDict, total=False):
    sources: list[str]
    results: Annotated[list[str], add]
    summary: str

DATA = {
    "kb": "KB-01: revisar VPN",
    "status": "ST-01: servicio operativo",
}
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | add combinará las listas de resultados. |
| 2 | Annotated permite asociar el reducer y TypedDict define el contrato. |
| 3 | Send representa un trabajo dirigido a un nodo con una entrada particular. |
| 4 | Importamos los elementos de construcción del grafo. |
| 6 | El estado principal admite campos que aparecen durante el recorrido. |
| 7 | sources contiene los identificadores de fuentes a consultar. |
| 8 | results acumula contribuciones de todas las tareas. |
| 9 | summary contendrá la representación final ordenada. |
| 11 | Definimos fuentes locales de demostración. |
| 12 | kb aporta un dato de conocimiento identificado. |
| 13 | status aporta un dato de estado del servicio identificado. |
| 14 | Cerramos el diccionario de datos. |

## Distribuir, trabajar y reunir

La función dispatch transforma una lista de fuentes en trabajos. Cada Send lleva un destino y un diccionario de entrada. Dos tareas pueden ejecutar la misma función search con distintos datos.

El caso vacío está tratado explícitamente. Si no hay fuentes, devolvemos collect como destino. Así evitamos depender de que una lista vacía de tareas produzca incidentalmente la salida que queríamos.

search recibe un pequeño diccionario con source. La consulta a DATA puede reemplazarse por un cliente externo sin cambiar la idea del mecanismo. El resultado incluye el identificador de origen y el dato.

Cada trabajador escribe results. El reducer agrega esas contribuciones. Después collect ordena y une. Ese orden alfabético es una decisión de presentación, no una afirmación de que las fuentes se ejecutaron en ese orden.

La separación entre distribución, trabajo y reunión es el patrón map-reduce. La parte map crea tareas independientes y la parte reduce obtiene una vista agregada. No implica que las tareas sean agentes. Podrían ser consultas SQL, cálculos o llamadas a un modelo.

Para grandes listas necesitamos límites. Crear miles de tareas sin controlar la concurrencia puede saturar conexiones o cuotas. También debemos pensar en cancelación y en qué hacer con resultados parciales. El ejemplo mantiene el tamaño pequeño para mostrar la semántica.

Repasen las líneas y anticipen el resultado para sources vacío y para una fuente desconocida. Ambas situaciones deberían terminar de manera definida.

```python
def dispatch(s: FanState):
    return [
        Send("search", {"source": source})
        for source in s["sources"]
    ] or "collect"

def search(job: dict):
    source = job["source"]
    text = DATA.get(source, "SIN_EVIDENCIA")
    return {"results": [f"{source}: {text}"]}

def collect(s: FanState):
    return {"summary": " / ".join(sorted(s.get("results", [])))}
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | dispatch decide cuántos trabajos crear a partir del estado principal. |
| 2 | Comenzamos una lista de tareas. |
| 3 | Cada Send dirige un diccionario particular al nodo search. |
| 4 | Creamos una tarea por cada identificador recibido. |
| 5 | Si no hay fuentes, dirigimos el flujo a collect para terminar con un resultado vacío. |
| 7 | search recibe la entrada específica de una tarea, no necesita todo FanState. |
| 8 | Leemos su identificador de fuente. |
| 9 | Consultamos el dato local y expresamos la ausencia explícitamente. |
| 10 | Devolvemos una sola contribución al canal results. |
| 12 | collect recibe los resultados combinados del padre. |
| 13 | Ordenamos antes de unir para obtener una presentación estable incluso si cambia el orden de finalización. |

## Construcción e invocación

El patrón conecta las tareas dinámicas a una reunión. En esta topología, todas las tareas search pertenecen a la misma etapa y aportan al mismo reducer. El nodo collect observa el resultado combinado.

max_concurrency limita cuántas tareas pueden ejecutarse simultáneamente dentro de este runtime. No sustituye un control global de cuota si tenemos muchas ejecuciones o varios procesos. El servicio puede necesitar además un límite compartido.

La salida esperada incluye kb con KB-01 y status con ST-01, en el orden definido por sorted. El número de resultados debe ser dos. Si recibimos una tercera fuente, no necesitamos registrar un tercer nodo: dispatch crea otro Send.

Cuando adaptemos este diseño a fuentes reales, debemos definir si una fuente fallida invalida todo el resultado o si aceptamos un informe parcial. Esa es una decisión de negocio que el código debe representar, por ejemplo con resultados que incluyan status y error por fuente.

No devolvemos desde collect otra copia de results porque su reducer la concatenaría de nuevo. Sólo escribimos summary. Es un ejemplo concreto de por qué conviene pensar qué significa cada actualización.

Ahora comparen este grafo con uno de dos ramas fijas. El resultado puede ser parecido, pero la necesidad de Send aparece cuando el conjunto de trabajos es dato de ejecución. Si siempre tenemos exactamente dos fuentes, la topología fija puede ser suficiente y más sencilla.

```python
fan_builder = StateGraph(FanState)
fan_builder.add_node("search", search)
fan_builder.add_node("collect", collect)
fan_builder.add_conditional_edges(START, dispatch)
fan_builder.add_edge("search", "collect")
fan_builder.add_edge("collect", END)
fanout = fan_builder.compile()

result = fanout.invoke(
    {"sources": ["kb", "status"], "results": []},
    {"max_concurrency": 2}, version="v2",
)
print(result.value["summary"])
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Creamos el constructor del estado global. |
| 2 | Registramos el trabajador que ejecutarán las tareas Send. |
| 3 | Registramos la reunión final. |
| 4 | dispatch decide dinámicamente el trabajo desde START. |
| 5 | Cada tarea search conduce a la etapa de reunión de este patrón. |
| 6 | collect finaliza el flujo. |
| 7 | Compilamos la aplicación. |
| 9 | Iniciamos la ejecución. |
| 10 | Pedimos dos fuentes e inicializamos el acumulador vacío. |
| 11 | Limitamos la concurrencia del runtime a dos y elegimos GraphOutput v2. |
| 12 | Cerramos la invocación. |
| 13 | Leemos el resumen agregado. |

[Archivo ejecutable: fanout.py](../_laboratorio/fanout.py)

## Lo que viaja en Send

Cada Send identifica el nodo de destino y una entrada particular para esa tarea. El trabajador recibe source, no necesita todo el estado del padre. Su retorno escribe una contribución compatible con results. El reducer del estado principal define cómo incorporar esas contribuciones.

La alternativa or "collect" es esencial para el caso vacío. Sin trabajadores, todavía queremos un resultado final válido. No deberíamos dejar que una entrada de cero fuentes se convierta accidentalmente en un recorrido sin la reunión esperada.

## Casos de borde

| sources | Qué ocurre |
| --- | --- |
| [kb] | Una tarea y una contribución |
| [kb, status] | Dos tareas de la misma oleada y una reunión |
| [] | Se selecciona directamente collect |
| [kb, kb] | Dos tareas; add conserva ambos resultados |
| [unknown] | Una contribución con SIN_EVIDENCIA |

El ejemplo tiene una única etapa de trabajador antes de la reunión. Si cada rama desarrolla varias etapas de distinta profundidad, revisá la topología de sincronización; no extrapoles una barrera simple sin analizar qué nodos deben haber terminado.

## Identidad y deduplicación

Si repetidos significa «misma fuente una sola vez», deduplicá sources antes de crear tareas preservando el orden deseado. Si repetidos significa «dos búsquedas distintas», agregá task_id y query a cada entrada. Un reducer de listas no puede decidir esa semántica de negocio por vos.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Send convierte cada trabajo en un agente autónomo?

### Respuesta razonada

No. El destino puede ser una función determinística. Send distribuye unidades de trabajo; la autonomía depende de si un modelo decide acciones dentro de ellas.

## Documentación para profundizar

- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [Implementación con Graph API](https://docs.langchain.com/oss/python/langgraph/use-graph-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../05_Orquestacion_avanzada/01_paralelismo_estatico_y_barreras_de_reunion.md) · [Siguiente](../05_Orquestacion_avanzada/03_command_actualizacion_y_navegacion.md)
