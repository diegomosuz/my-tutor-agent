---
id: "m05_t03"
title: "Command: actualización y navegación"
module: "Orquestación avanzada"
module_order: 5
topic_order: 3
duration_minutes: 20
level: "intermedio-avanzado"
language: "es"
prerequisites: "Rutas condicionales e interrupt del módulo 4."
objectives: ["Usar Command cuando estado y destino forman una misma transición.", "Distinguir navegación interna de reanudación externa."]
---

# 5.3. Command: actualización y navegación

**Módulo 5: Orquestación avanzada · Dedicación estimada: 20 minutos**

## Qué vas a poder hacer

- Usar Command cuando estado y destino forman una misma transición.
- Distinguir navegación interna de reanudación externa.

**Antes de empezar:** Rutas condicionales e interrupt del módulo 4.

## Una transición con dos resultados

Command combina una actualización de estado y una selección de destino en el retorno de un nodo. Es útil cuando ambas decisiones pertenecen a la misma operación.

Aquí decidimos un destino a partir de approved y escribimos status. Deben existir nodos accepted y rejected en el constructor. La anotación de Literal comunica esos destinos, pero no los registra automáticamente.

No agregamos una arista fija adicional desde decide para expresar la misma exclusividad. Los destinos de Command y las aristas estáticas pueden programar trabajo adicional. Por eso revisamos todas las salidas del nodo.

Command tiene varios usos y conviene distinguirlos. El Command con resume que enviamos a invoke reanuda una interrupción. El Command con update y goto de este ejemplo es un retorno de un nodo. No usamos Command(update=...) como reemplazo habitual de la entrada de un nuevo turno.

Para cruzar desde un subgrafo al padre existe Command.PARENT en casos de navegación entre grafos. Esa capacidad exige alinear esquemas y reducers de los campos compartidos. No la necesitamos para el laboratorio y no conviene introducirla sin una responsabilidad clara.

Si la actualización y el enrutamiento pueden mantenerse como una función y una arista condicional simples, esa opción sigue siendo válida. Command aporta una forma compacta de expresar una transición que debe viajar junto con el cambio de estado.

```python
from typing import Literal
from langgraph.types import Command

def decide(s: ReviewState) -> Command[
    Literal["accepted", "rejected"]
]:
    target = "accepted" if s["approved"] else "rejected"
    return Command(
        update={"status": "DECIDIDO"},
        goto=target,
    )
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Literal expresa los destinos posibles para ayudar a tipado y visualización. |
| 2 | Command permite combinar actualización y control. |
| 4 | Declaramos un nodo que devuelve un comando. |
| 5 | Anotamos accepted y rejected como destinos válidos. |
| 6 | Cerramos la anotación de retorno. |
| 7 | Elegimos destino según el dato aprobado. |
| 8 | Construimos el comando de salida del nodo. |
| 9 | update escribe status en el estado. |
| 10 | goto programa el nodo seleccionado. |
| 11 | Cerramos el comando. |

El fragmento presupone ReviewState. El programa completo importa ese contrato, registra los tres nodos y conecta accepted y rejected con END. decide no recibe una arista fija adicional de salida.

[Archivo ejecutable: command_flow.py](../_laboratorio/command_flow.py)

## Completar el constructor

```python
def accepted(s):
    return {"status": "ACEPTADO"}

def rejected(s):
    return {"status": "RECHAZADO"}

builder = StateGraph(ReviewState)
builder.add_node("decide", decide)
builder.add_node("accepted", accepted)
builder.add_node("rejected", rejected)
builder.add_edge(START, "decide")
builder.add_edge("accepted", END)
builder.add_edge("rejected", END)
graph = builder.compile()
```

accepted y rejected escriben estados finales diferentes. add_node registra los símbolos ejecutables. La arista START inicia decide. Las dos aristas a END permiten terminar desde cualquiera de las alternativas. La anotación Command[Literal[...]] ayuda a documentar destinos, pero las funciones de destino deben existir.

## Usos que se parecen por nombre

| Uso | Dónde se entrega | Significado |
| --- | --- | --- |
| Command(update=..., goto=...) | Retorno de un nodo | Cambiar datos y seleccionar destino |
| Command(resume=...) | Entrada a invoke o stream | Continuar una interrupción pendiente |
| Command(graph=Command.PARENT, ...) | Retorno dentro de un subgrafo | Navegar al nivel padre con contratos compatibles |

Para iniciar un nuevo turno, normalmente se entrega una entrada de estado ordinaria. No conviertas Command(update=...) en sustituto universal de ese contrato. Cada uso tiene semántica específica.

## Actividad

Ejecutá command_flow.py con approved True y después False. Esperá ACEPTADO y RECHAZADO. Luego dibujá qué sucedería si agregás decide → accepted como arista estática además del Command. La ruta fija puede programar accepted aunque Command seleccione rejected. La exclusividad desaparece.

## Cuándo preferir una ruta condicional

Si el nodo produce datos y un router pequeño toma la decisión de forma clara, mantener esa separación puede facilitar pruebas. Command es útil cuando ambas partes deben viajar juntas. La API elegida debe hacer evidente la transición para quien mantendrá el sistema.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿La anotación Literal crea automáticamente accepted y rejected?

### Respuesta razonada

No. Describe los posibles destinos para tipado y representación, pero no implementa ni registra esos nodos. El constructor sigue siendo responsable de los componentes ejecutables.

## Documentación para profundizar

- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../05_Orquestacion_avanzada/02_distribucion_dinamica_con_send.md) · [Siguiente](../05_Orquestacion_avanzada/04_subgrafos_y_fronteras_de_estado.md)
