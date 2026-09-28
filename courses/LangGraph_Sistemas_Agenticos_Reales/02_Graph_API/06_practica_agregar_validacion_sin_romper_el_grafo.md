---
id: "m02_t06"
title: "Práctica: agregar validación sin romper el grafo"
module: "Graph API"
module_order: 2
topic_order: 6
duration_minutes: 25
level: "intermedio-avanzado"
language: "es"
prerequisites: "Módulo 2 completo."
objectives: ["Introducir una tercera ruta y actualizar su contrato completo.", "Demostrar que las rutas anteriores siguen funcionando."]
---

# 2.6. Práctica: agregar validación sin romper el grafo

**Módulo 2: Graph API · Dedicación estimada: 25 minutos**

## Qué vas a poder hacer

- Introducir una tercera ruta y actualizar su contrato completo.
- Demostrar que las rutas anteriores siguen funcionando.

**Antes de empezar:** Módulo 2 completo.

## Objetivo y entrega

Extendé triage para que una consulta vacía o formada por espacios devuelva «Falta la consulta». Mantené las rutas normal y high. La entrega es el archivo modificado y tres comprobaciones que demuestren esas propiedades.

Antes de consultar la solución, enumerá los lugares que deben cambiar: tipo de priority, implementación de classify, registro del nuevo nodo, mapa de rutas y conexión de salida. Esta lista es parte del ejercicio: un grafo funciona cuando sus contratos coinciden.

## Pistas progresivas

1. strip permite distinguir espacios de contenido.
2. El nuevo valor lógico puede ser invalid.
3. reject debe estar registrado antes de compile.
4. La nueva ruta debe terminar, y las anteriores deben conservar sus destinos.

## Solución: funciones

```python
def classify(s: TicketState):
    text = s["text"].strip().lower()
    if not text:
        return {"priority": "invalid"}
    return {"priority": "high" if "caído" in text else "normal"}

def reject(s: TicketState):
    return {"reply": "Falta la consulta"}
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Reemplazamos classify antes de registrar los nodos. |
| 2 | Quitamos espacios en los extremos y normalizamos mayúsculas. |
| 3 | Detectamos la cadena vacía. |
| 4 | Devolvemos invalid de manera temprana. |
| 5 | Conservamos la política para entradas válidas. |
| 7 | Definimos reject con la interfaz habitual. |
| 8 | Devolvemos la explicación del dato faltante. |

## Solución: cambios en el constructor

```python
priority: Literal["normal", "high", "invalid"]

builder.add_node("reject", reject)
builder.add_conditional_edges(
    "classify", route,
    {"normal": "answer", "high": "escalate", "invalid": "reject"},
)
builder.add_edge("reject", END)
```

Este bloque muestra los cambios dentro del contrato y del constructor; no es un programa autónomo. Sustituí la definición y el mapa anteriores, no agregues una segunda llamada de enrutamiento desde classify. El archivo completo ya aplica los cambios en el orden correcto.

[Archivo ejecutable: triage_validado.py](../_laboratorio/triage_validado.py)

## Comprobaciones mínimas

```python
from triage_validado import triage

assert triage.invoke({"text": "VPN"}, version="v2").value["priority"] == "normal"
assert triage.invoke({"text": "Servicio caído"}, version="v2").value["priority"] == "high"
assert triage.invoke({"text": "  "}, version="v2").value["reply"] == "Falta la consulta"
```

La importación obtiene el grafo actualizado. Cada assert invoca una entrada y compara una propiedad del estado final. Las dos primeras protegen comportamiento existente; la tercera verifica el requisito nuevo. Estas pruebas cubren cadenas válidas: no reemplazan la validación de tipos de una API.

## Errores que conviene reconocer

| Error | Causa probable | Corrección |
| --- | --- | --- |
| invalid no tiene destino | Mapa incompleto | Agregar la etiqueta y el nodo |
| Falta reject | Nombre no registrado | Registrar antes de compilar |
| Se ejecutan dos respuestas | Arista fija y condicional superpuestas | Mantener una selección exclusiva |
| La entrada vacía sigue en normal | Se usa el grafo anterior | Reconstruir y compilar el diseño actualizado |

## Extensión razonada

La palabra «caído» es una regla didáctica. Si el requerimiento pide identificar semánticamente incidentes críticos, primero prepará ejemplos etiquetados y una métrica. Sustituir classify por un LLM mantiene la topología, pero introduce latencia, errores y variabilidad que requieren evaluación. La interfaz estable facilita ese cambio; no garantiza su calidad.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿La práctica está resuelta cuando la entrada vacía funciona una vez?

### Respuesta razonada

Todavía falta verificar que normal y high sigan funcionando y que la nueva ruta termine. Una modificación correcta satisface el requisito nuevo sin romper los contratos que permanecen vigentes.

## Documentación para profundizar

- [Implementación con Graph API](https://docs.langchain.com/oss/python/langgraph/use-graph-api)
- [Pruebas](https://docs.langchain.com/oss/python/langgraph/test)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../02_Graph_API/05_estado_configuracion_y_contexto_de_ejecucion.md) · [Siguiente](../03_Agente_con_herramientas/01_ciclo_del_agente_y_protocolo_de_herramientas.md)
