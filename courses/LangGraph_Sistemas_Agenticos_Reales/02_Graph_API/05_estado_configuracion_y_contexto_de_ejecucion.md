---
id: "m02_t05"
title: "Estado, configuración y contexto de ejecución"
module: "Graph API"
module_order: 2
topic_order: 5
duration_minutes: 20
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópicos 2.2 a 2.4."
objectives: ["Ubicar cada dato en state, config o context.", "Inyectar un alcance autenticado sin convertirlo en argumento elegido por el modelo."]
---

# 2.5. Estado, configuración y contexto de ejecución

**Módulo 2: Graph API · Dedicación estimada: 20 minutos**

## Qué vas a poder hacer

- Ubicar cada dato en state, config o context.
- Inyectar un alcance autenticado sin convertirlo en argumento elegido por el modelo.

**Antes de empezar:** Tópicos 2.2 a 2.4.

## Tres canales con propósitos diferentes

| Mecanismo | Ejemplo | Responsabilidad |
| --- | --- | --- |
| State | draft, messages, calls | Datos que evoluciona el flujo |
| Config | thread_id, recursion_limit, max_concurrency | Identidad y opciones del runtime |
| Context | tenant_id y dependencias controladas | Alcance aportado por la aplicación |

El estado guarda datos que cambian durante el flujo y pueden entrar en checkpoints. El contexto proporciona dependencias o información de alcance que la aplicación suministra al invocar.

Aquí tenant_id identifica una organización. Debe venir de una autenticación realizada por la aplicación. Permitir que el modelo lo elija libremente sería un error de autorización.

Usamos una dataclass congelada para expresar que tratamos esos atributos como fijos durante la invocación. Eso no vuelve automáticamente segura cualquier dependencia interna. La aplicación sigue siendo responsable del origen y del uso de los valores.

Al reanudar una ejecución volveremos a proporcionar un contexto autorizado. No basamos los permisos actuales solamente en datos históricos del checkpoint. Separar estado y contexto permite revisar esa responsabilidad sin mezclarla con el contenido de la conversación.

## Implementación

```python
from dataclasses import dataclass
from langgraph.runtime import Runtime

@dataclass(frozen=True)
class Context:
    tenant_id: str

def scoped(s: TicketState, runtime: Runtime[Context]):
    tenant = runtime.context.tenant_id
    return {"reply": f"Consulta del tenant {tenant}"}

ctx_builder = StateGraph(TicketState, context_schema=Context)
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos dataclass para definir el contenedor de contexto. |
| 2 | Runtime entrega contexto y capacidades de ejecución al nodo. |
| 4 | frozen=True evita asignaciones accidentales a los atributos de esta instancia. |
| 5 | Definimos el tipo Context de nuestra aplicación. |
| 6 | tenant_id identifica el ámbito que la aplicación debe haber autenticado. |
| 8 | El nodo recibe el estado y un Runtime tipado. |
| 9 | Leemos la identidad desde el contexto suministrado por la aplicación. |
| 10 | La respuesta es demostrativa. Una herramienta real aplicaría ese ámbito a sus consultas. |
| 12 | Declaramos context_schema. Después de completar el grafo se pasa una instancia de Context a invoke. |

El archivo completo conecta el nodo y suministra el contexto:

```python
ctx_builder.add_node("scoped", scoped)
ctx_builder.add_edge(START, "scoped")
ctx_builder.add_edge("scoped", END)
ctx_graph = ctx_builder.compile()
r = ctx_graph.invoke({"text": "VPN"}, context=Context(tenant_id="acme"), version="v2")
print(r.value["reply"])
```

add_node registra scoped; las dos aristas forman una entrada y una salida; compile produce el ejecutable. El argumento context construye Context con tenant_id acme. La salida esperada es «Consulta del tenant acme».

[Archivo ejecutable: contexto.py](../_laboratorio/contexto.py)

## Autorización al reanudar

Un ticket puede permanecer pendiente durante horas. La autorización actual no debe inferirse solo de un dato almacenado cuando comenzó. Al reanudar, el servicio autentica otra vez y aporta el contexto adecuado. Si cambió el alcance, debe decidir si la persona todavía puede operar ese caso.

Una dataclass frozen evita reasignaciones ordinarias de atributos, pero no vuelve inmutables todos los objetos internos ni verifica el origen de los datos. Es una ayuda para expresar intención, no una barrera de seguridad.

## Esquemas de entrada y salida

StateGraph puede recibir input_schema y output_schema distintos del estado interno. Sirven para hacer explícito qué entra y qué se devuelve. Un campo interno no se convierte por eso en secreto: puede aparecer en checkpoints, logs o streaming. El control de exposición requiere una proyección y una política del servicio.

Evitá guardar conexiones, clientes o credenciales dentro del estado persistente. Son recursos del proceso. El estado debe conservar los datos necesarios para reconstruir el trabajo, mientras el ciclo de vida de la aplicación administra recursos externos.

## Actividad

Clasificá ticket_id, API key, límite de superpasos, borrador y tenant_id autenticado. Respuesta: ticket_id y borrador pueden pertenecer al estado; el límite al config; tenant_id al contexto autorizado; la API key al entorno o gestor de secretos del adaptador, sin copiarla al historial.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿El usuario puede elegir el tenant_id en el mensaje para consultar otra organización?

### Respuesta razonada

No. El servicio obtiene el alcance de una identidad autorizada y el adaptador lo aplica. La solicitud escrita por el usuario es un dato, no una credencial.

## Documentación para profundizar

- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../02_Graph_API/04_reducers_y_mensajes_con_identidad.md) · [Siguiente](../02_Graph_API/06_practica_agregar_validacion_sin_romper_el_grafo.md)
