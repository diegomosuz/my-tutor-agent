---
id: "m04_t05"
title: "Stores, inspección e historial de ejecución"
module: "Persistencia y aprobación"
module_order: 4
topic_order: 5
duration_minutes: 25
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópicos 4.1 y 4.2."
objectives: ["Guardar información compartida con namespaces explícitos.", "Inspeccionar snapshots sin confundirlos con el estado activo de una función."]
---

# 4.5. Stores, inspección e historial de ejecución

**Módulo 4: Persistencia y aprobación · Dedicación estimada: 25 minutos**

## Qué vas a poder hacer

- Guardar información compartida con namespaces explícitos.
- Inspeccionar snapshots sin confundirlos con el estado activo de una función.

**Antes de empezar:** Tópicos 4.1 y 4.2.

## Memoria por thread y memoria entre threads

El checkpointer conserva una ejecución. Un Store guarda elementos que la aplicación decide compartir entre ejecuciones. Una preferencia de idioma puede pertenecer a un usuario y sobrevivir a varios tickets; el borrador pendiente pertenece a un ticket particular. Esa diferencia de alcance determina el mecanismo.

El namespace debe derivarse de identidad autorizada. El ejemplo usa tenant, usuario y categoría. La segmentación ayuda a organizar datos, pero no implementa por sí sola un permiso: el servicio debe impedir consultas a namespaces ajenos.

## Demostración completa

```python
from langgraph.store.memory import InMemoryStore
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from review_graph import review_builder

store = InMemoryStore()
namespace = ("acme", "user-1", "preferences")
store.put(namespace, "language", {"value": "es"})
assert store.get(namespace, "language").value == {"value": "es"}
assert store.get(("other", "user-1", "preferences"), "language") is None

graph = review_builder.compile(checkpointer=InMemorySaver())
cfg = {"configurable": {"thread_id": "history-1"}}
graph.invoke({"ticket_id": "T1", "draft": "Revisar VPN"}, cfg, version="v2")
pending = graph.get_state(cfg)
assert pending.next == ("review",)
graph.invoke(Command(resume=False), cfg, version="v2")
for snapshot in graph.get_state_history(cfg):
    print(snapshot.next, snapshot.values)
```

[Archivo ejecutable: store_history.py](../_laboratorio/store_history.py)

## Lectura del programa

InMemoryStore crea un almacén volátil. namespace es una tupla que ubica la preferencia. put escribe una clave con un valor estructurado; get devuelve un Item, cuyo atributo value contiene el dato. La consulta bajo otro tenant no encuentra el elemento. Esto demuestra separación de claves, no una autenticación completa.

Después se compila el grafo de revisión con InMemorySaver. invoke crea una pausa; get_state permite comprobar next. Command(resume=False) finaliza por rechazo. get_state_history devuelve snapshots, que se pueden inspeccionar para relacionar valores y nodos pendientes. El historial se devuelve desde los checkpoints más recientes; no presupongas que el primer elemento es la entrada original.

## Inspección, edición y replay

| Operación | Pregunta que responde | Precaución |
| --- | --- | --- |
| get_state(config) | ¿Qué hay guardado ahora? | Usar el thread autorizado |
| get_state_history(config) | ¿Cómo evolucionó? | Puede haber varias fronteras internas |
| update_state(config, values) | ¿Qué nueva actualización quiero registrar? | Aplica reducers y crea una nueva frontera |
| invoke(None, snapshot.config) | ¿Cómo continuar desde esa configuración? | Puede volver a ejecutar nodos posteriores |

update_state no debe entenderse como «editar un registro viejo en el lugar». Se utiliza la configuración del checkpoint y se genera una nueva actualización. as_node puede ser relevante para indicar qué nodo representa esa actualización y, por lo tanto, qué trabajo habilitar después. Probá este mecanismo con adaptadores sin efectos antes de usarlo en operaciones reales.

## Evolución del código

Un caso interrumpido puede referirse a un nodo que todavía debe ejecutarse. Renombrarlo o eliminarlo puede impedir continuar. Cambiar el esquema de estado o el significado de un campo exige una estrategia de compatibilidad, migración o cierre controlado de casos pendientes.

La misma precaución aplica a modelos y prompts: una nueva versión puede generar resultados distintos para una ejecución recuperada. Registrá la versión del código y los contratos relevantes para explicar ese comportamiento.

## Actividad

Ejecutá store_history.py y ubicá el snapshot donde next contiene review. Identificá si el borrador ya existía antes de la decisión. Después explicá qué persistencia se perdería al cerrar el proceso: en este archivo, tanto Store como saver son de memoria.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Es necesario usar Store para comunicar dos nodos del mismo grafo?

### Respuesta razonada

Normalmente el estado es el contrato más directo. Store se justifica cuando el dato tiene alcance o vida propios fuera de ese recorrido. Usarlo como una variable global encubierta dificulta entender dependencias.

## Documentación para profundizar

- [Stores](https://docs.langchain.com/oss/python/langgraph/stores)
- [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers)
- [Time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../04_Persistencia_y_aprobacion/04_durabilidad_idempotencia_y_recuperacion.md) · [Siguiente](../04_Persistencia_y_aprobacion/06_practica_reinicio_rechazo_y_aislamiento.md)
