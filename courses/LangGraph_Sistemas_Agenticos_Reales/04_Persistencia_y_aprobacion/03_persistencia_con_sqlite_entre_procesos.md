---
id: "m04_t03"
title: "Persistencia con SQLite entre procesos"
module: "Persistencia y aprobación"
module_order: 4
topic_order: 3
duration_minutes: 30
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópico 4.2."
objectives: ["Reanudar un caso desde un proceso nuevo usando el mismo backend.", "Mantener el ciclo de vida de la conexión durante la ejecución."]
---

# 4.3. Persistencia con SQLite entre procesos

**Módulo 4: Persistencia y aprobación · Dedicación estimada: 30 minutos**

## Qué vas a poder hacer

- Reanudar un caso desde un proceso nuevo usando el mismo backend.
- Mantener el ciclo de vida de la conexión durante la ejecución.

**Antes de empezar:** Tópico 4.2.

## Cambiar el alcance de la persistencia

Este bloque sustituye el saver de memoria por un archivo SQLite. La topología y los nodos son los mismos. Mientras el archivo permanezca disponible, otro proceso puede abrirlo y recuperar el thread.

El context manager mantiene abierta la conexión durante el trabajo y la cierra al salir. No debemos guardar durable y seguir invocándolo fuera del bloque con una conexión ya cerrada.

Para comprobar un reinicio real, separá definición del grafo, inicio y reanudación. Un archivo contiene los tipos, funciones y review_builder, sin invocaciones automáticas. Otro inicia el caso. Un tercero vuelve a abrir SQLite y reanuda. Los programas completos aparecen a continuación.

Conservar checkpoints no basta si cambiamos el código de forma incompatible. Renombrar un nodo pendiente, cambiar el significado de un campo o alterar el orden de interrupciones puede afectar ejecuciones existentes. En producción necesitamos una política de versiones y migraciones.

SQLite facilita el aprendizaje local. Un servicio con varios procesos y más concurrencia puede necesitar un backend como PostgreSQL, junto con sus migraciones, pool y respaldo. El cambio debe responder a la operación real.

También es necesario controlar retención. Los checkpoints pueden contener datos sensibles y crecer con el tiempo. Definimos qué conservar, por cuánto tiempo y quién puede inspeccionarlo. Ahora hagamos una prueba de reinicio deliberado.

El ejercicio usa un archivo SQLite y dos programas separados. El primero inicia un caso; el segundo reanuda. Ambos reconstruyen el mismo grafo y apuntan al mismo archivo y thread. La ruta del archivo debe resolver al mismo lugar, aunque cambies de terminal.

## Operación fundamental

```python
from langgraph.checkpoint.sqlite import SqliteSaver

cfg_disk = {"configurable": {"thread_id": "t-disk-1"}}
with SqliteSaver.from_conn_string("checkpoints.sqlite") as saver:
    durable = review_builder.compile(checkpointer=saver)
    pending = durable.invoke(
        {"ticket_id": "INC-202", "draft": "Revisar la VPN."},
        cfg_disk, version="v2", durability="sync",
    )
    print(pending.interrupts[0].value)
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos el saver del paquete SQLite instalado. |
| 3 | Elegimos un thread independiente para el ejercicio persistente. |
| 4 | Abrimos el archivo mediante un context manager que administra la conexión. |
| 5 | Compilamos el mismo constructor con el backend persistente. |
| 6 | Iniciamos un caso que quedará pendiente. |
| 7 | Pasamos el ticket y el borrador que se conservarán. |
| 8 | Fijamos configuración, formato de salida y persistencia síncrona. |
| 9 | Cerramos la invocación interrumpida. |
| 10 | Mostramos el payload antes de salir del bloque y cerrar la conexión. |

El bloque anterior muestra la API esencial. Los scripts del laboratorio añaden argumentos de línea de comandos y una comprobación para no iniciar accidentalmente un thread ya existente.

## Programa de inicio

```python
import argparse
from langgraph.checkpoint.sqlite import SqliteSaver
from review_graph import review_builder

parser = argparse.ArgumentParser()
parser.add_argument("--db", default="checkpoints.sqlite")
parser.add_argument("--thread", required=True)
args = parser.parse_args()
cfg = {"configurable": {"thread_id": args.thread}}
with SqliteSaver.from_conn_string(args.db) as saver:
    graph = review_builder.compile(checkpointer=saver)
    if graph.get_state(cfg).values:
        raise SystemExit("El thread ya existe. Reanudalo o elegí otro.")
    pending = graph.invoke(
        {"ticket_id": "INC-202", "draft": "Revisar la VPN."},
        cfg, version="v2", durability="sync",
    )
    print(pending.interrupts[0].value)
```

argparse define db y thread; parse_args obtiene los valores. cfg construye la identidad del runtime. El context manager abre el saver y lo mantiene disponible hasta terminar el bloque. get_state comprueba si el caso ya existe. compile vincula el grafo con ese backend. invoke inicia la propuesta con persistencia síncrona. La última línea imprime el payload de revisión.

## Programa de reanudación

```python
import argparse
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command
from review_graph import review_builder

parser = argparse.ArgumentParser()
parser.add_argument("--db", default="checkpoints.sqlite")
parser.add_argument("--thread", required=True)
parser.add_argument("--decision", choices=["aprobar", "rechazar"], required=True)
args = parser.parse_args()
cfg = {"configurable": {"thread_id": args.thread}}
with SqliteSaver.from_conn_string(args.db) as saver:
    graph = review_builder.compile(checkpointer=saver)
    if graph.get_state(cfg).next != ("review",):
        raise SystemExit("No existe una revisión pendiente para ese thread.")
    result = graph.invoke(
        Command(resume=args.decision == "aprobar"), cfg,
        version="v2", durability="sync",
    )
    print(result.value["status"])
```

El argumento decision admite únicamente aprobar o rechazar. La comparación con «aprobar» produce un booleano real. La comprobación next evita reanudar un thread inexistente o finalizado como si tuviera una revisión pendiente. Command entrega la decisión a interrupt y status indica la ruta final.

## Ejecución en PowerShell

Desde _laboratorio, con cursoPython definido en el módulo 2:

```powershell
& $cursoPython start_review.py --thread caso-sqlite-1
& $cursoPython resume_review.py --thread caso-sqlite-1 --decision aprobar
```

Son dos procesos independientes aunque se lancen desde la misma terminal. La primera ejecución termina mostrando el borrador. La segunda debe imprimir SIMULADO. Repetí con otro thread y decision rechazar; esperá RECHAZADO. No borres la base entre ambos pasos.

## Errores que el ejercicio hace visibles

| Observación | Explicación posible |
| --- | --- |
| No existe revisión pendiente | Thread distinto, archivo distinto o caso terminado |
| El inicio detecta un thread existente | Se intenta crear dos veces el mismo caso |
| El saver ya está cerrado | La invocación quedó fuera del bloque with |
| La versión nueva no puede continuar | Se modificó un nodo o el esquema usado por casos pendientes |

SQLite es apropiado para esta prueba local. El ejercicio no mide concurrencia intensiva ni operación distribuida. PostgreSQL o un servidor administrado pueden ser el siguiente paso cuando esas propiedades sean necesarias.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Es suficiente conservar el thread_id si el saver estaba solo en RAM?

### Respuesta razonada

No. El identificador localiza una continuidad dentro de un backend. Si ese backend desaparece, el ID no reconstruye los datos. Necesitás almacenamiento que sobreviva al proceso y una definición compatible del grafo.

## Documentación para profundizar

- [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers)
- [Interrupciones](https://docs.langchain.com/oss/python/langgraph/interrupts)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../04_Persistencia_y_aprobacion/02_interrupciones_y_aprobacion_humana.md) · [Siguiente](../04_Persistencia_y_aprobacion/04_durabilidad_idempotencia_y_recuperacion.md)
