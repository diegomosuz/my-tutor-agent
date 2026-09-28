---
id: "m06_t02"
title: "Reintentos, caché y presupuesto operativo"
module: "Operación y proyecto final"
module_order: 6
topic_order: 2
duration_minutes: 25
level: "intermedio-avanzado"
language: "es"
prerequisites: "Persistencia, nodos y contratos de error."
objectives: ["Aplicar reintentos solo a errores recuperables.", "Configurar caché diferenciándola de la persistencia de ejecución."]
---

# 6.2. Reintentos, caché y presupuesto operativo

**Módulo 6: Operación y proyecto final · Dedicación estimada: 25 minutos**

## Qué vas a poder hacer

- Aplicar reintentos solo a errores recuperables.
- Configurar caché diferenciándola de la persistencia de ejecución.

**Antes de empezar:** Persistencia, nodos y contratos de error.

## No todos los errores requieren repetir

Un error transitorio puede justificar un reintento. Un argumento inválido o una denegación de permisos normalmente requieren otra respuesta. Por eso elegimos retry_on de forma explícita.

max_attempts cuenta el primer intento. Si el cliente HTTP también reintenta, debemos calcular la combinación. Timeout significa que dejamos de esperar, no que el receptor no haya ejecutado una operación. Por eso una escritura reintentada exige idempotencia.

Para cachear consultas con permisos, la clave debe incluir todo contexto que cambie el resultado, como tenant, versión de datos o alcance autorizado. Una clave basada sólo en el texto puede filtrar información entre usuarios. El TTL debe reflejar cuánto tiempo aceptamos datos antiguos.

Nunca tratamos el almacenamiento de checkpoints como si fuera una caché de respuestas. Uno conserva la ejecución y el otro reutiliza un cálculo. Diferenciar esos propósitos ayuda a elegir retención, invalidación y métricas.

## Una política acotada

```python
from langgraph.types import RetryPolicy

retry = RetryPolicy(
    max_attempts=3,
    retry_on=TimeoutError,
)
builder.add_node(
    "fetch", fetch,
    retry_policy=retry,
)
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos la política de reintentos de nodos. |
| 3 | Construimos una política explícita. |
| 4 | Permitimos hasta tres intentos totales, incluyendo el primero. |
| 5 | Sólo reintentamos TimeoutError en este ejemplo. |
| 6 | Cerramos la definición. |
| 7 | Registramos un nodo en un constructor aún no compilado. |
| 8 | fetch es el adaptador de consulta que definimos en la aplicación. |
| 9 | Asociamos la política a ese nodo. |
| 10 | Cerramos el registro. Después se conectan aristas y se compila. |

fetch es una función propia, no un símbolo que LangGraph importe automáticamente. El archivo retry_demo.py contiene una demostración completa que falla una vez y luego devuelve éxito.

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import RetryPolicy
class RState(TypedDict):
    ok: bool
attempts = 0
def fetch(s):
    global attempts
    attempts += 1
    if attempts < 2:
        raise TimeoutError("fallo transitorio simulado")
    return {"ok": True}
builder = StateGraph(RState)
builder.add_node("fetch", fetch, retry_policy=RetryPolicy(max_attempts=3, retry_on=TimeoutError, initial_interval=0.01))
builder.add_edge(START, "fetch")
builder.add_edge("fetch", END)
r = builder.compile().invoke({"ok": False}, version="v2")
assert r.value["ok"] and attempts == 2
print("Intentos:", attempts)
```

El contador global es exclusivamente un instrumento de esta demostración. La primera ejecución incrementa attempts y lanza TimeoutError. La política permite hasta tres intentos totales, con una espera inicial breve. La segunda ejecución devuelve ok=True. El assert comprueba resultado y cantidad de intentos.

## Reintentos que se multiplican

Si una capa permite tres intentos y cada intento llama a un cliente que permite dos, una operación lógica podría generar hasta seis solicitudes. Si además el consumidor repite la petición, el número vuelve a aumentar. Definí un presupuesto global, documentá qué capa trata cada fallo y registrá los intentos efectivos.

## Cachear un cálculo reutilizable

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.cache.memory import InMemoryCache
from langgraph.types import CachePolicy

class State(TypedDict):
    text: str
    normalized: str

calls = []
def normalize(s: State):
    calls.append(s["text"])
    return {"normalized": s["text"].strip().lower()}

builder = StateGraph(State)
builder.add_node("normalize", normalize, cache_policy=CachePolicy(ttl=60))
builder.add_edge(START, "normalize")
builder.add_edge("normalize", END)
graph = builder.compile(cache=InMemoryCache())
inputs = {"text": " VPN ", "normalized": ""}
graph.invoke(inputs, version="v2")
graph.invoke(inputs, version="v2")
assert len(calls) == 1
print("Cómputos reales:", len(calls))
```

[Archivo ejecutable: cache_demo.py](../_laboratorio/cache_demo.py)

CachePolicy establece un TTL de 60 segundos para el nodo. InMemoryCache se conecta al compilar. Las dos invocaciones usan exactamente la misma entrada y la segunda reutiliza el resultado dentro de la vida de esa caché. calls mide cuántas veces se ejecutó la función de normalización, no cuántas invocaciones recibió el grafo.

Este ejemplo deliberadamente usa una función pura y no depende de identidad externa. En una consulta autorizada, una caché incorrecta puede reutilizar datos de otro tenant. La clave debe incorporar todos los determinantes del resultado, directamente en el contrato de entrada del nodo o mediante una política de clave adecuada. No presupongas que el contexto externo queda cubierto por la clave predeterminada.

## Decisión por tipo de fallo

| Situación | Respuesta inicial |
| --- | --- |
| Timeout de lectura transitorio | Reintento acotado con espera |
| Credenciales inválidas | Fallar con diagnóstico; corregir configuración |
| Entrada fuera de esquema | Rechazar o solicitar corrección |
| Sin evidencia | Derivar o aclarar; no inventar un éxito |
| Timeout de escritura | Consultar intención/idempotencia antes de duplicar |

## Actividad

Cambiá retry_demo para fallar siempre. Predecí cuántas veces se llama fetch y qué recibe el consumidor final. Después probá un ValueError: la política retry_on=TimeoutError no debe convertirlo en una secuencia de reintentos. Ejecutá el caso en un proceso nuevo para reiniciar el contador de la fixture.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Un checkpoint equivale a cachear la respuesta de una pregunta?

### Respuesta razonada

No. El checkpoint representa la continuidad de una ejecución. La caché reutiliza un cálculo por equivalencia de entrada. Sus claves, duración y criterios de invalidación responden a objetivos distintos.

## Documentación para profundizar

- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [Implementación con Graph API](https://docs.langchain.com/oss/python/langgraph/use-graph-api)
- [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../06_Operacion_y_proyecto_final/01_streaming_y_ejecucion_asincrona.md) · [Siguiente](../06_Operacion_y_proyecto_final/03_pruebas_observabilidad_y_evaluacion.md)
