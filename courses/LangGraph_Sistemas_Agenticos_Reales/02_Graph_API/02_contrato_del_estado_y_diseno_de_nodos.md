---
id: "m02_t02"
title: "Contrato del estado y diseño de nodos"
module: "Graph API"
module_order: 2
topic_order: 2
duration_minutes: 25
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópico 2.1 y fundamentos de tipos en Python."
objectives: ["Definir un estado con campos explícitos.", "Escribir nodos pequeños que devuelvan cambios parciales."]
---

# 2.2. Contrato del estado y diseño de nodos

**Módulo 2: Graph API · Dedicación estimada: 25 minutos**

## Qué vas a poder hacer

- Definir un estado con campos explícitos.
- Escribir nodos pequeños que devuelvan cambios parciales.

**Antes de empezar:** Tópico 2.1 y fundamentos de tipos en Python.

## Archivo de trabajo

[Archivo ejecutable: triage.py](../_laboratorio/triage.py). Los bloques de este tópico y del siguiente forman un solo programa. Podés estudiarlos por partes o ejecutar el archivo completo incluido. El laboratorio evita que tengas que reconstruir fragmentos para comprobar el comportamiento.

## Definir TicketState

Este es el comienzo de triage.py. Definimos qué información circula entre los nodos. En el instante inicial solamente necesitamos text. Después de clasificar aparecerá priority y al finalizar aparecerá reply.

TypedDict ayuda al análisis estático y a comprender el código. No debemos confundir esa descripción con una validación automática de cualquier entrada en tiempo de ejecución. Si recibimos datos desde una API, validamos el contrato en la frontera con una herramienta apropiada, por ejemplo Pydantic.

Usamos total=False para representar campos que se completan durante el recorrido. Eso no elimina la obligación de inicializar las entradas que un nodo va a leer. Si el primer nodo accede a text y no lo enviamos, fallará. Más adelante podríamos separar esquemas de entrada, estado interno y salida.

Mantengan el estado pequeño y serializable. Conviene guardar identificadores y resultados útiles, no conexiones abiertas ni clientes HTTP. Las dependencias de ejecución tienen otro lugar que veremos al hablar de Runtime.

La pregunta para cada campo es qué nodo lo necesita, quién lo escribe y durante cuánto tiempo debe existir. Si no tenemos una respuesta, posiblemente sea un dato que no debe formar parte del contrato compartido. Ahora repasemos cada línea.

```python
from typing import Literal, TypedDict
from langgraph.graph import StateGraph, START, END

class TicketState(TypedDict, total=False):
    text: str
    priority: Literal["normal", "high"]
    reply: str
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos Literal para expresar alternativas válidas y TypedDict para describir claves y tipos de un diccionario. |
| 2 | Importamos el constructor StateGraph y los marcadores de entrada y finalización. |
| 4 | Definimos TicketState. total=False permite que algunas claves todavía no existan cuando arranca el flujo. |
| 5 | text guarda la consulta original. Nuestra invocación debe proporcionarla. |
| 6 | priority documenta dos valores posibles. El clasificador la incorporará después. |
| 7 | reply contendrá la salida del nodo que atienda la ruta elegida. |

## Implementar las responsabilidades

Los tres nodos reciben un estado y devuelven un cambio. No mutan el diccionario recibido. Esa disciplina hace explícitas las escrituras y permite que el runtime las combine de forma controlada.

Clasificar lee text y escribe priority. Responder y escalar escriben reply. Como esas dos rutas serán alternativas, nunca deberían ejecutarse juntas para la misma decisión. Eso evita un conflicto de escritura sobre reply.

No añadimos un LLM para una condición que ya conocemos. En una aplicación real la regla podría ser más elaborada o venir de un catálogo, pero su naturaleza seguiría siendo determinística. El grafo coordina funciones ordinarias.

También distinguimos una salida de texto de una acción externa. El mensaje de derivación indica qué debería ocurrir. Crear efectivamente un incidente exigiría un adaptador con permisos, manejo de errores e idempotencia. Mantener esa diferencia visible evita atribuir capacidades que el ejemplo todavía no implementa.

Antes de continuar, identifiquen los campos que lee y escribe cada función. Esa revisión suele revelar dependencias ocultas. Las funciones pequeñas facilitan pruebas unitarias y permiten que una falla se atribuya a una responsabilidad concreta. Veamos las líneas.

```python
def classify(s: TicketState):
    high = "caído" in s["text"].lower()
    return {"priority": "high" if high else "normal"}

def answer(s: TicketState):
    return {"reply": "Consultar la guía de soporte."}

def escalate(s: TicketState):
    return {"reply": "Derivar al equipo de incidentes."}
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | classify recibe el estado actual. s es una abreviatura local de state. |
| 2 | Convertimos el texto a minúsculas y buscamos caído. La regla es simple y requiere ese acento. |
| 3 | Devolvemos solamente priority. La expresión elige high cuando la condición es verdadera y normal en otro caso. |
| 5 | answer define el trabajo de la ruta normal. Conservamos la firma del nodo aunque este ejemplo no lea s. |
| 6 | Devolvemos una actualización de reply con una recomendación fija. |
| 8 | escalate define la alternativa de prioridad alta con la misma interfaz. |
| 9 | Devolvemos una derivación textual. El laboratorio no crea incidentes en un sistema externo. |

## Tipado no equivale a validación de entrada

TypedDict describe la forma esperada para el editor y el análisis estático. No valida automáticamente que una llamada HTTP haya enviado text ni que sea una cadena. total=False permite expresar que algunos campos todavía no existen durante etapas tempranas; no autoriza leer un campo ausente.

En una API real validá el DTO de entrada con un esquema apropiado antes de invocar el grafo. Si text no existe, el acceso s["text"] del ejemplo produce KeyError. Si text es None, lower falla. Son contratos incumplidos, no razones para reintentar un proveedor.

## Estado mínimo y trazabilidad

| Campo | Cuándo nace | Quién lo modifica | Quién lo usa |
| --- | --- | --- | --- |
| text | Entrada | Normalmente nadie | classify |
| priority | Clasificación | classify | route |
| reply | Respuesta o derivación | answer o escalate | Consumidor final |

Guardar la entrada original permite explicar una clasificación. Si se necesita una versión normalizada para otras tareas, agregá un campo con un propósito claro o calculala localmente. No sobrescribas información que luego necesitás para auditoría sin una política deliberada.

## Actividad

Modificá solo el texto de respuesta de answer. Antes de ejecutar, identificá qué entradas deberían cambiar de resultado y cuáles no. Debe cambiar la respuesta de prioridad normal; la derivación de prioridad alta debe mantenerse. Si ambas rutas cambian, probablemente modificaste una responsabilidad compartida sin intención.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Por qué answer no devuelve también text y priority?

### Respuesta razonada

No los modifica. Devolver solo reply expresa la intención y evita copiar acumulados por costumbre. El runtime combina la actualización con el estado anterior.

## Documentación para profundizar

- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [Implementación con Graph API](https://docs.langchain.com/oss/python/langgraph/use-graph-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../02_Graph_API/01_entorno_reproducible_y_primer_recorrido.md) · [Siguiente](../02_Graph_API/03_construccion_rutas_condicionales_e_invocacion.md)
