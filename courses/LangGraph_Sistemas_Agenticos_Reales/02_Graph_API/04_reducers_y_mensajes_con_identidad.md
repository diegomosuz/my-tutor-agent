---
id: "m02_t04"
title: "Reducers y mensajes con identidad"
module: "Graph API"
module_order: 2
topic_order: 4
duration_minutes: 20
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópicos 2.2 y 2.3."
objectives: ["Elegir una regla de combinación por campo.", "Actualizar mensajes sin perder las relaciones del protocolo."]
---

# 2.4. Reducers y mensajes con identidad

**Módulo 2: Graph API · Dedicación estimada: 20 minutos**

## Qué vas a poder hacer

- Elegir una regla de combinación por campo.
- Actualizar mensajes sin perder las relaciones del protocolo.

**Antes de empezar:** Tópicos 2.2 y 2.3.

## Cómo se incorpora una actualización

Cada clave tiene una regla para aplicar actualizaciones. Sin un reducer explícito, una actualización normal reemplaza el valor anterior. Con un reducer definimos cómo combinar el acumulado y la nueva contribución.

Si findings contiene A y un nodo devuelve B dentro de una lista, obtenemos A y B. Si otro devuelve una lista vacía, el acumulado permanece. Una lista vacía no borra un campo que concatena. Para reemplazar deliberadamente un campo reducido existe Overwrite.

En paralelismo, los reducers resuelven cómo juntar contribuciones a una misma clave. Deben comportarse de forma coherente al agrupar actualizaciones. La asociatividad resulta útil y, cuando el orden no debe importar, necesitamos una operación conmutativa o una normalización posterior.

Concatenar no elimina duplicados. Si un nodo devuelve toda la lista anterior junto al nuevo elemento, puede duplicar información. Por eso devolveremos solamente su contribución.

No usemos operator.add por costumbre para todos los campos. Un contador puede reemplazarse o sumarse según el contrato. Una lista de mensajes requiere semántica de identidad. El reducer expresa el significado de una actualización. Si dos nodos escriben un campo sin reducer en el mismo paso, no asumimos que gana el último: rediseñamos la escritura o definimos una combinación válida.

```python
from operator import add
from typing import Annotated, TypedDict

class SearchState(TypedDict):
    query: str
    findings: Annotated[list[str], add]
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos add, que aplicada a listas concatena. |
| 2 | Annotated permite asociar un reducer al tipo y TypedDict define el esquema. |
| 4 | Declaramos un estado independiente para búsquedas. |
| 5 | query utiliza la regla de reemplazo y no admite varias escrituras concurrentes sin un diseño adicional. |
| 6 | findings incorpora add como reducer y acumula contribuciones. |

## Calcular el reducer a mano

| Acumulado | Nueva contribución | Resultado con add |
| --- | --- | --- |
| [A] | [B] | [A, B] |
| [A] | [] | [A] |
| [A] | [A, B] | [A, A, B] |

La última fila explica por qué un nodo devuelve su contribución, no el historial completo. Para limpiar deliberadamente un campo reducido existe Overwrite; utilizar una lista vacía no tiene esa semántica. Evitá múltiples sobrescrituras concurrentes sobre la misma clave: no resuelven el desacuerdo de los escritores.

La asociatividad permite reagrupar combinaciones sin cambiar su significado. La concatenación es asociativa, pero no conmutativa: A seguido de B no es lo mismo que B seguido de A. Si el orden de ejecución no debe determinar la respuesta, conservá identificadores y aplicá un orden explícito en la reunión.

## Los mensajes necesitan otra semántica

En una conversación puede hacer falta actualizar un mensaje sin duplicarlo. add_messages reconoce identificadores y combina mensajes con esa semántica.

MessagesState ya incluye messages con ese reducer. Podemos extenderlo con otros campos como el número de llamadas al modelo. Será la base de nuestro agente.

Ambas versiones del ejemplo tienen el mismo id y el resultado conserva una con contenido corregido. Con identificadores distintos normalmente incorporaríamos mensajes distintos. El id identifica el mensaje dentro del historial. No sustituye una clave de idempotencia de una operación externa.

Cuando un nodo genera una respuesta, devolverá solamente la respuesta nueva dentro de una lista. El reducer la integrará. Devolver nuevamente todo el historial puede introducir duplicaciones y hace menos clara la intención de la actualización.

También debemos conservar las relaciones del protocolo. Una solicitud de herramienta y su respuesta se vinculan mediante tool_call_id. Recortar mensajes sin preservar esas parejas puede volver inválida la conversación para el proveedor.

El estado no es exactamente la ventana de contexto enviada al modelo. Podemos persistir un historial y preparar una vista acotada para cada llamada. Esa selección importa cuando crecen el costo, la latencia y la cantidad de información irrelevante. La memoria útil requiere una política de selección además de almacenamiento.

```python
from langgraph.graph import MessagesState
from langchain_core.messages import AIMessage
from langgraph.graph.message import add_messages

first = [AIMessage(content="Borrador", id="a1")]
edit = [AIMessage(content="Corregido", id="a1")]
merged = add_messages(first, edit)
assert len(merged) == 1
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | MessagesState ya contiene messages con el reducer add_messages. |
| 2 | AIMessage representa una salida del asistente. |
| 3 | Importamos el reducer para demostrar su comportamiento. |
| 5 | Creamos una primera versión con id a1. |
| 6 | Creamos otra versión con el mismo id y contenido nuevo. |
| 7 | El reducer actualiza el mensaje existente porque reconoce su identidad. |
| 8 | Comprobamos que quedó un solo mensaje. |

## Tres identidades diferentes

| Identificador | Qué identifica | Qué no garantiza |
| --- | --- | --- |
| message.id | Un mensaje en el historial | Que una operación externa sea única |
| tool_call_id | Una solicitud de herramienta | Que el argumento esté autorizado |
| thread_id | Una continuidad de ejecución | Que quien conoce el ID pueda acceder |

## Práctica breve

Cambiá el id del segundo AIMessage por a2 y predecí la longitud de merged. Después devolvé a1 y verificá el contenido final. Con a2 hay dos mensajes; con a1 se reemplaza el mensaje de esa identidad. El ejercicio demuestra por qué una lista acumulativa genérica no cubre todos los contratos.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Puedo recortar el historial eliminando solo los ToolMessage para ahorrar tokens?

### Respuesta razonada

No de manera indiscriminada. Podés dejar solicitudes de herramientas sin su observación y romper el protocolo. Definí una política de contexto que preserve pares válidos o resuma intercambios completados sin dejar llamadas pendientes.

## Documentación para profundizar

- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [Implementación con Graph API](https://docs.langchain.com/oss/python/langgraph/use-graph-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../02_Graph_API/03_construccion_rutas_condicionales_e_invocacion.md) · [Siguiente](../02_Graph_API/05_estado_configuracion_y_contexto_de_ejecucion.md)
