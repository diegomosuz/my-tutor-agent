---
id: "m06_t01"
title: "Streaming y ejecución asíncrona"
module: "Operación y proyecto final"
module_order: 6
topic_order: 1
duration_minutes: 20
level: "intermedio-avanzado"
language: "es"
prerequisites: "Módulos 3 y 4; async básico para la variante opcional."
objectives: ["Consumir eventos de progreso con el contrato v2.", "Separar eventos técnicos de mensajes públicos de la interfaz."]
---

# 6.1. Streaming y ejecución asíncrona

**Módulo 6: Operación y proyecto final · Dedicación estimada: 20 minutos**

## Qué vas a poder hacer

- Consumir eventos de progreso con el contrato v2.
- Separar eventos técnicos de mensajes públicos de la interfaz.

**Antes de empezar:** Módulos 3 y 4; async básico para la variante opcional.

## Mostrar progreso mientras el grafo trabaja

Streaming permite exponer progreso mientras el grafo trabaja. En updates recibimos las actualizaciones de los nodos. En values recibiríamos snapshots del estado. messages entrega fragmentos de mensajes de modelos compatibles y metadatos. custom permite publicar eventos definidos por nuestra aplicación.

En v2 el evento tiene una forma uniforme con type, ns y data. ns identifica el espacio de nombres, lo que ayuda al trabajar con subgrafos. data depende del modo seleccionado. Si pedimos varios modos, type permite distinguirlos.

Este ejemplo utiliza updates y funciona también con el modelo local porque observa el grafo. La variante guionada no implementa streaming de tokens de un proveedor. Para eso necesitamos una integración compatible y una política de exposición.

La UI no debería mostrar automáticamente todo el estado. Puede contener datos internos, argumentos de herramientas o información sensible. Convertimos los eventos técnicos en mensajes de progreso adecuados para la persona que usa el producto.

Streaming tampoco significa que una acción haya quedado confirmada. Un token puede ser provisional y una tarea puede fallar después. La interfaz debe diferenciar progreso, interrupción pendiente, finalización y error.

Para servicios asíncronos utilizamos ainvoke o astream y clientes que no bloqueen el event loop. Hacer una función async mientras dentro ejecutamos I/O bloqueante no resuelve el problema. La elección debe ser consistente a lo largo del adaptador.

```python
for part in support.stream(
    inputs,
    {"recursion_limit": 12},
    stream_mode="updates",
    version="v2",
):
    print(part["type"], part["data"])
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Iteramos sobre la ejecución progresiva del mismo grafo. |
| 2 | Reutilizamos la entrada con messages y calls. |
| 3 | Mantenemos un límite técnico de superpasos. |
| 4 | updates emite las actualizaciones producidas por nodos. |
| 5 | v2 normaliza cada evento como un objeto con type, ns y data. |
| 6 | Comenzamos el cuerpo del iterador. |
| 7 | Mostramos el tipo de evento y su contenido. En una interfaz enviaríamos una versión filtrada. |

En este fragmento support e inputs provienen del ejemplo del módulo 3. El archivo stream_demo.py incluye esos imports y una variante asíncrona. Ejecutalo desde el laboratorio.

[Archivo ejecutable: stream_demo.py](../_laboratorio/stream_demo.py)

## Modos y destinatarios

| Modo | Qué representa | Uso habitual |
| --- | --- | --- |
| updates | Cambios producidos por nodos | Progreso del workflow |
| values | Estado acumulado | Inspección controlada |
| messages | Fragmentos y metadatos del modelo | Texto progresivo con integración compatible |
| custom | Eventos propios | Progreso de una tarea larga |
| checkpoints, tasks, debug | Eventos de ejecución | Diagnóstico restringido |

El contrato de cada evento v2 tiene type, ns y data. type permite despachar por modo; ns identifica la ruta de namespaces; data conserva la forma específica del evento. Un código que trate todos los data como texto fallará o expondrá información interna.

## Variante async

```python
async def consume(graph, inputs):
    async for part in graph.astream(
        inputs, stream_mode="updates", version="v2"
    ):
        print(part["type"], part["data"])
```

async def define una corrutina. async for consume el iterador asíncrono. astream ejecuta y entrega eventos; el cuerpo procesa cada evento. Para ejecutarla fuera de un entorno que ya tenga event loop se usa asyncio.run; en un notebook se suele invocar con await. No anides asyncio.run dentro de un loop activo.

Los nodos del simulador son síncronos y pequeños; el runtime puede ejecutarlos mediante su adaptación. Un servicio con I/O intensivo debería usar clientes asíncronos y nodos async coherentes con ese modelo. Declarar async una función que bloquea con una petición síncrona no elimina el bloqueo.

## Una interfaz comprensible

| Evento interno | Mensaje público posible |
| --- | --- |
| Inicio de lookup | Consultando información de soporte |
| Actualización de draft | Preparando una propuesta |
| Interrupción | La propuesta necesita revisión |
| Estado final | Caso resuelto o derivado |
| Error tratado | No se pudo completar; se conserva el caso |

La desconexión del cliente no equivale a una cancelación garantizada del trabajo. La política del servicio debe decidir qué ocurre con una ejecución iniciada y cómo consultar su estado posteriormente. El stream es un canal de observación, no la única fuente de verdad del caso.

La documentación también ofrece event streaming mediante APIs más nuevas. Este curso mantiene stream/astream v2 para conservar un formato explícito y consistente con el laboratorio. Antes de migrar, revisá el contrato completo del consumidor.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Un token mostrado significa que una acción externa quedó confirmada?

### Respuesta razonada

No. Puede ser contenido provisional y el flujo todavía puede interrumpirse o fallar. La UI debe diferenciar progreso, revisión pendiente, finalización y error.

## Documentación para profundizar

- [Streaming](https://docs.langchain.com/oss/python/langgraph/streaming)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../05_Orquestacion_avanzada/06_patrones_de_orquestacion_y_practica_integradora.md) · [Siguiente](../06_Operacion_y_proyecto_final/02_reintentos_cache_y_presupuesto_operativo.md)
