---
id: "m03_t03"
title: "Implementación de un agente con presupuesto"
module: "Agente con herramientas"
module_order: 3
topic_order: 3
duration_minutes: 35
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópicos 3.1 y 3.2."
objectives: ["Construir el ciclo agent-tools-agent.", "Detener el recorrido antes de superar el presupuesto.", "Ejecutar la misma topología con un simulador o un proveedor."]
---

# 3.3. Implementación de un agente con presupuesto

**Módulo 3: Agente con herramientas · Dedicación estimada: 35 minutos**

## Qué vas a poder hacer

- Construir el ciclo agent-tools-agent.
- Detener el recorrido antes de superar el presupuesto.
- Ejecutar la misma topología con un simulador o un proveedor.

**Antes de empezar:** Tópicos 3.1 y 3.2.

## Control antes de la llamada

El límite se comprueba antes de llamar al modelo. Si ya hicimos tres llamadas, devolvemos una respuesta terminal sin solicitudes de herramientas. La ruta del grafo la interpretará como una salida.

Esta ubicación evita cortar una solicitud de herramienta antes de recibir su observación. Nuestro grafo permite ejecutar las herramientas solicitadas por la tercera llamada y luego vuelve a agent. En ese retorno, el contador bloquea la cuarta llamada y produce la derivación.

El límite mide llamadas al modelo, no herramientas individuales. Un modelo puede pedir varias herramientas en un mismo mensaje. En producción también limitamos cantidad de herramientas, tiempo total, costo y concurrencia. Este contador es una política pequeña y visible.

El mensaje SystemMessage se añade al contexto de cada llamada. No lo guardamos repetidamente como actualización del historial. El nodo devuelve únicamente reply y calls. El reducer de messages conserva la conversación.

Un error de red en invoke no incrementa calls porque la función no llega al return. Eso significa que este contador no es una contabilidad exacta de facturación ni de intentos internos del cliente. Para eso usaríamos métricas del proveedor y una política de presupuesto más completa.

Repasemos cada línea y verifiquemos una propiedad: ninguna ejecución de este nodo con calls igual a tres debe llamar al proveedor.

```python
def agent(s: AgentState):
    if s["calls"] >= 3:
        return {"messages": [
            AIMessage(content="Límite: derivar a una persona.")
        ]}
    reply = model_with_tools.invoke(
        [SystemMessage(content=SYSTEM), *s["messages"]]
    )
    return {
        "messages": [reply],
        "calls": s["calls"] + 1,
    }
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | El nodo recibe mensajes y el contador. |
| 2 | Comprobamos el presupuesto antes de otra llamada al proveedor. |
| 3 | Preparamos una actualización de messages para terminar de forma controlada. |
| 4 | Creamos una respuesta del asistente sin tool_calls que explica la derivación. |
| 5 | Cerramos la lista y la actualización de salida. |
| 6 | Invocamos el cliente que conoce las herramientas. |
| 7 | Anteponemos la instrucción de sistema al historial. El asterisco expande los mensajes existentes en la nueva lista. |
| 8 | Cerramos la llamada al modelo. |
| 9 | Construimos una actualización parcial del estado. |
| 10 | Devolvemos solamente el mensaje nuevo para que add_messages lo integre. |
| 11 | Incrementamos calls mediante reemplazo del contador anterior. |
| 12 | Cerramos la actualización del nodo. |

El contador representa llamadas lógicas que llegaron a devolver un resultado en este nodo. Los reintentos internos del cliente y las llamadas que fallan antes del retorno requieren métricas adicionales. Por eso calls no equivale a facturación exacta. El límite sigue siendo útil como control del ciclo normal.

## Ensamblar la topología

El ensamblado refleja el diagrama inicial. Un nodo decide, otro ejecuta y la observación vuelve al decisor. Usamos tools como nombre porque es el destino que espera la condición predefinida en esta configuración.

ToolNode puede gestionar múltiples solicitudes de herramientas. Ese comportamiento no significa que todas deban ser operaciones con efectos externos. Las lecturas independientes suelen ser una mejor primera aplicación. Si dos acciones dependen del orden o requieren una aprobación, diseñamos explícitamente ese control.

tools_condition mira la presencia de llamadas en el último mensaje. No evalúa si el texto final es verdadero, si la evidencia es suficiente o si la herramienta propuesta era necesaria. Esas propiedades requieren pruebas y políticas propias.

No añadimos una arista fija de agent a END porque la salida depende del mensaje. La condición ya expresa las dos alternativas. El retorno tools a agent permite que el modelo interprete la observación.

El grafo actual no tiene persistencia. Cada invocación recibe su historial inicial y termina en esa llamada. Incorporaremos un checkpointer después. Separar los dos mecanismos nos deja comprender primero el ciclo y luego la continuidad.

Una forma de depurar consiste en inspeccionar el historial final: HumanMessage, AIMessage con solicitud, ToolMessage y AIMessage final. Si el orden no corresponde, revisamos qué nodo produjo cada actualización.

```python
from langgraph.graph import StateGraph, START
from langgraph.prebuilt import ToolNode, tools_condition

agent_builder = StateGraph(AgentState)
agent_builder.add_node("agent", agent)
agent_builder.add_node("tools", ToolNode([lookup]))
agent_builder.add_edge(START, "agent")
agent_builder.add_conditional_edges("agent", tools_condition)
agent_builder.add_edge("tools", "agent")
support = agent_builder.compile()
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos constructor y marcador de entrada. |
| 2 | ToolNode ejecuta herramientas registradas y tools_condition revisa si el último mensaje solicita alguna. |
| 4 | Creamos un constructor con AgentState. |
| 5 | Registramos el nodo que llama al modelo. |
| 6 | Registramos el nodo tools con lookup como única capacidad. |
| 7 | Todo input nuevo comienza por agent. |
| 8 | La condición conduce a tools si hay llamadas y a END cuando no las hay. |
| 9 | Después de observar herramientas volvemos al modelo. |
| 10 | Compilamos el ciclo y lo guardamos en support. |

## Ejecutar e inspeccionar

Esta invocación usa dos límites distintos. calls implementa una política de la aplicación. recursion_limit actúa como protección técnica del recorrido. No deben interpretarse como equivalentes.

Una interacción habitual hará dos llamadas: una pide lookup y otra redacta la respuesta. El comportamiento real depende del modelo. La instrucción orienta a consultar la herramienta, pero la evaluación debe confirmar que efectivamente lo hizo.

La impresión del historial ayuda a observar mensajes, aunque una solicitud puede tener content vacío. Para inspeccionarla en detalle miramos tool_calls del AIMessage. La práctica se enfocará justamente en esa secuencia.

Si usamos la variante local, el recorrido será predecible. Si usamos el proveedor real, registramos la traza y comparamos con las propiedades esperadas. No exigimos una cadena textual idéntica cuando evaluamos calidad lingüística, pero sí verificamos condiciones como citar una fuente válida o reconocer ausencia de evidencia.

El recursion_limit podría disparar un error si añadimos más nodos o vueltas sin ajustar el presupuesto. Debe dimensionarse considerando el grafo. Aumentarlo indiscriminadamente puede ocultar un ciclo defectuoso.

Para repetir este laboratorio enviamos otra entrada con calls en cero. Cuando agreguemos persistencia tendremos que decidir explícitamente si el presupuesto pertenece a un turno, a una ejecución o a toda la conversación.

```python
from langchain_core.messages import HumanMessage

inputs = {
    "messages": [HumanMessage(content="¿Cómo reviso la VPN?")],
    "calls": 0,
}
result = support.invoke(
    inputs, {"recursion_limit": 12}, version="v2"
)
for message in result.value["messages"]:
    print(message.type, message.content)
print("Llamadas:", result.value["calls"])
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | HumanMessage representa la entrada de una persona. |
| 3 | Construimos el estado inicial. |
| 4 | La consulta entra como mensaje estructurado. |
| 5 | Inicializamos explícitamente el contador. |
| 6 | Cerramos el diccionario de entrada. |
| 7 | Invocamos el grafo compilado. |
| 8 | Fijamos un límite de superpasos y el formato GraphOutput v2. |
| 9 | Cerramos la ejecución. |
| 10 | Iteramos sobre el historial completo conservado en value. |
| 11 | Imprimimos tipo y contenido para observar la secuencia. |
| 12 | Mostramos el contador final de llamadas efectivas al modelo. |

[Archivo ejecutable: support.py](../_laboratorio/support.py)

## Alternativa local sin proveedor

El archivo support.py utiliza OfflineModel por defecto. Su método invoke inspecciona el último mensaje. Si recibe una consulta, devuelve una llamada a lookup con id c1. Si recibe un ToolMessage, produce una respuesta basada en el resultado o deriva cuando lee SIN_EVIDENCIA.

```python
class OfflineModel:
    def invoke(self, messages):
        last = messages[-1]
        if isinstance(last, ToolMessage):
            if "SIN_EVIDENCIA" in str(last.content):
                return AIMessage(content="Sin evidencia: derivar.")
            return AIMessage(content=f"Según {last.content}")
        return AIMessage(
            content="",
            tool_calls=[{
                "name": "lookup",
                "args": {"query": str(last.content)},
                "id": "c1",
                "type": "tool_call",
            }],
        )
```

La clase no es un LLM ni razona de forma abierta: implementa un guion determinístico del protocolo. last selecciona el último mensaje. isinstance reconoce una observación. Las dos primeras ramas devuelven un AIMessage final. La última construye tool_calls con nombre, argumentos, id y tipo. El mismo nodo ToolNode ejecuta la función real del laboratorio.

La repetición del identificador c1 es aceptable para estas ejecuciones independientes de un único ciclo de consulta. Un simulador para conversaciones largas o varios ciclos debería producir identificadores de llamada distintos, manteniendo la relación de cada respuesta. No reutilices este atajo como generador de identidades de producción.

## Resultado esperado con VPN

La secuencia de tipos es human, ai, tool, ai; el resultado de la herramienta contiene KB-01 y el contador vale 2. El primer AIMessage puede tener content vacío porque su salida relevante es tool_calls. Eso no indica un error de generación.

## Inyección para las pruebas

build_support acepta model_with_tools. Si no lo recibe, crea OfflineModel. La función agent queda dentro de esa fábrica y usa la dependencia inyectada. Cada prueba puede suministrar un doble que devuelva determinadas llamadas o falle si se lo invoca. Así se verifica el límite sin realizar peticiones pagas.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Por qué la comprobación calls >= 3 se ubica antes de invoke?

### Respuesta razonada

Para impedir la operación que excedería el presupuesto. Revisar después solo detectaría que el costo ya ocurrió. El contador de aplicación y recursion_limit protegen aspectos distintos y deben tener valores coherentes.

## Documentación para profundizar

- [Quickstart](https://docs.langchain.com/oss/python/langgraph/quickstart)
- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [Herramientas](https://docs.langchain.com/oss/python/langchain/tools)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../03_Agente_con_herramientas/02_diseno_de_herramientas_y_conexion_del_modelo.md) · [Siguiente](../03_Agente_con_herramientas/04_limites_de_autonomia_y_salidas_estructuradas.md)
