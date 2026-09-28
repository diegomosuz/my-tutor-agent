---
id: "m03_t02"
title: "Diseño de herramientas y conexión del modelo"
module: "Agente con herramientas"
module_order: 3
topic_order: 2
duration_minutes: 25
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópico 3.1; entorno instalado."
objectives: ["Exponer una herramienta con nombre, descripción y esquema.", "Configurar un modelo sin confundir bind_tools con ejecución."]
---

# 3.2. Diseño de herramientas y conexión del modelo

**Módulo 3: Agente con herramientas · Dedicación estimada: 25 minutos**

## Qué vas a poder hacer

- Exponer una herramienta con nombre, descripción y esquema.
- Configurar un modelo sin confundir bind_tools con ejecución.

**Antes de empezar:** Tópico 3.1; entorno instalado.

## Una herramienta pequeña que se puede inspeccionar

La herramienta es pequeña para que podamos inspeccionarla. Su nombre, docstring y tipos describen qué puede pedir el modelo. La implementación sigue siendo Python ordinario.

La base de conocimiento tiene una entrada identificada. Ese identificador permite relacionar una respuesta con su fuente. En un sistema real añadiríamos versión, fecha o enlace según la necesidad de trazabilidad.

SIN_EVIDENCIA es una salida explícita. Evitamos devolver un texto que aparente éxito cuando no encontramos nada. El agente tendrá que reconocer esta señal y derivar o pedir aclaraciones.

El algoritmo busca claves contenidas en la consulta. Es una simplificación didáctica. No ofrece recuperación semántica ni busca en documentos. Podríamos reemplazarlo por PostgreSQL o un índice vectorial manteniendo un contrato parecido, pero primero necesitamos demostrar que esa capacidad agrega valor.

La docstring ayuda al modelo a elegir la herramienta, pero no es una barrera de seguridad. La función debe validar argumentos y limitar su alcance. Si mañana consultara una base por tenant, ese filtro se aplicaría dentro del adaptador con contexto autenticado. A continuación se explica cada línea. Ejecutá lookup.invoke con una consulta conocida.

```python
from langchain_core.tools import tool

KB = {"vpn": "KB-01: verificar red y credenciales."}

@tool
def lookup(query: str) -> str:
    """Busca instrucciones verificadas de soporte."""
    key = query.strip().lower()
    matches = [v for k, v in KB.items() if k in key]
    return "\n".join(matches) or "SIN_EVIDENCIA"
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos el decorador que expone una función como herramienta con un contrato. |
| 3 | Creamos una base local mínima con un identificador de evidencia y una instrucción. |
| 5 | Aplicamos tool para que nombre, descripción y esquema puedan presentarse al modelo. |
| 6 | lookup recibe query como cadena y devuelve una cadena. |
| 7 | La docstring describe cuándo resulta útil la herramienta y participa de su contrato descriptivo. |
| 8 | Normalizamos la consulta para comparar sin diferencias de mayúsculas o espacios externos. |
| 9 | Seleccionamos los valores cuyas claves aparecen en la consulta normalizada. |
| 10 | Unimos resultados con saltos de línea y devolvemos SIN_EVIDENCIA cuando no hay coincidencias. |

## Comprobar la herramienta antes del agente

```python
from support import lookup

assert "KB-01" in lookup.invoke({"query": "vpn"})
assert lookup.invoke({"query": "impresora"}) == "SIN_EVIDENCIA"
```

La primera importación obtiene el objeto decorado. invoke recibe los argumentos del esquema de la herramienta. Los dos assert separan recuperación conocida de falta de resultados. Si esta pieza falla aislada, agregar un agente no corrige su contrato.

## Modelo y estado

Elegimos un adaptador concreto para mostrar la integración, pero el grafo puede trabajar con otros clientes. El requisito del modelo es soportar el protocolo de herramientas que usemos.

MODEL_NAME y OPENAI_API_KEY deben estar configurados en el entorno local. Si un gateway corporativo expone una API compatible, se revisan su URL, autenticación y capacidades. La compatibilidad del endpoint no implica que todos los modelos soporten los mismos parámetros.

El estado hereda messages e incorpora calls. Inicializaremos calls en cero. Cada llamada efectiva al modelo aumentará el contador. La decisión de límite estará en código.

bind_tools describe herramientas al modelo. No les concede acceso ilimitado ni las ejecuta. El nodo de herramientas realizará la ejecución más adelante.

La instrucción del sistema pide consultar evidencia y reconocer su ausencia. Ese texto orienta el comportamiento. Las condiciones críticas, como autorización o límites, seguirán implementadas fuera del prompt.

```python
import os
from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState
from langchain_core.messages import AIMessage, SystemMessage

class AgentState(MessagesState):
    calls: int

model = ChatOpenAI(
    model=os.environ["MODEL_NAME"],
    temperature=0, timeout=20, max_retries=1,
)
model_with_tools = model.bind_tools([lookup])
SYSTEM = "Consultá lookup. Sin evidencia, indicá la limitación."
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | os permite leer configuración externa sin incrustar secretos. |
| 2 | Importamos la integración del proveedor. |
| 3 | MessagesState aporta el canal messages con su reducer. |
| 4 | Importamos mensajes del asistente y del sistema. |
| 6 | Extendemos el estado conversacional. |
| 7 | calls cuenta invocaciones del modelo dentro del presupuesto de este ejercicio. |
| 9 | Instanciamos el cliente del modelo. |
| 10 | El nombre se obtiene de MODEL_NAME y debe corresponder a un modelo que soporte herramientas. |
| 11 | Reducimos aleatoriedad y fijamos timeout y reintentos del cliente. Temperatura cero no garantiza determinismo total. |
| 12 | Cerramos la construcción. OPENAI_API_KEY se obtiene del entorno por la integración. |
| 13 | bind_tools proporciona el esquema de lookup al modelo sin ejecutar la herramienta. |
| 14 | La instrucción establece una política de evidencia que luego evaluaremos. |

En la variante ejecutable support_live.py, configured_model construye el cliente y build_support recibe el modelo con herramientas ya enlazadas. Esto evita que importar el agente simulado requiera credenciales. La inyección permite sustituir el proveedor en pruebas sin cambiar las aristas.

[Archivo ejecutable: support_live.py](../_laboratorio/support_live.py)

## Configurar la variante con proveedor

OPENAI_API_KEY debe contener una credencial válida y MODEL_NAME debe identificar un modelo accesible que soporte herramientas. Se leen del entorno; no se escriben en el Markdown ni en el repositorio. El curso no fija un nombre de modelo porque el acceso depende de tu cuenta o gateway.

Un gateway que expone chat/completions no garantiza por sí mismo compatibilidad con tool calling, streaming, salida estructurada, autenticación o todos los parámetros del cliente. Probá esas capacidades con un caso pequeño antes de incorporar el adaptador al flujo completo. Si una integración no acepta temperature, ajustá su configuración documentada.

## Contrato de producción de una herramienta

| Aspecto | Decisión concreta |
| --- | --- |
| Entrada | Tipos, campos obligatorios y límites de tamaño |
| Alcance | Recursos permitidos según identidad autenticada |
| Salida | Datos, fuente y señal explícita de ausencia |
| Errores | Diferenciar indisponibilidad de falta de evidencia |
| Efectos | Idempotencia y autorización cuando hay escritura |

La implementación por subcadenas puede coincidir con texto irrelevante. Su función es mostrar el mecanismo. Evaluar recuperación semántica es un problema adicional que requiere datos, métricas y una fuente real.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿bind_tools concede privilegios de acceso al sistema?

### Respuesta razonada

No. Publica descripciones y esquemas para que el modelo proponga llamadas. La implementación decide qué recursos puede leer o modificar, con credenciales y alcance controlados por la aplicación.

## Documentación para profundizar

- [Herramientas](https://docs.langchain.com/oss/python/langchain/tools)
- [Integración ChatOpenAI](https://docs.langchain.com/oss/python/integrations/chat/openai)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../03_Agente_con_herramientas/01_ciclo_del_agente_y_protocolo_de_herramientas.md) · [Siguiente](../03_Agente_con_herramientas/03_implementacion_de_un_agente_con_presupuesto.md)
