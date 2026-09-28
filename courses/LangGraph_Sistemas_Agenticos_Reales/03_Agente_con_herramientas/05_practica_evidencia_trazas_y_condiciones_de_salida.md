---
id: "m03_t05"
title: "Práctica: evidencia, trazas y condiciones de salida"
module: "Agente con herramientas"
module_order: 3
topic_order: 5
duration_minutes: 30
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópicos 3.1 a 3.4."
objectives: ["Evaluar el protocolo en casos normales y adversos.", "Separar pruebas de orquestación de evaluación del modelo real."]
---

# 3.5. Práctica: evidencia, trazas y condiciones de salida

**Módulo 3: Agente con herramientas · Dedicación estimada: 30 minutos**

## Qué vas a poder hacer

- Evaluar el protocolo en casos normales y adversos.
- Separar pruebas de orquestación de evaluación del modelo real.

**Antes de empezar:** Tópicos 3.1 a 3.4.

## Consigna

Usá support.py y probá cuatro situaciones: una pregunta VPN, una pregunta sobre impresora, una entrada con calls ya en 3 y una llamada de herramienta cuyo resultado tiene un identificador incorrecto. Para cada caso registrá secuencia de mensajes, contador, evidencia y condición de salida.

Primero trabajá con el simulador. Después, si tenés proveedor, repetí los casos semánticos y compará resultados. No exijas una redacción exacta al modelo real: verificá propiedades del contenido y del control.

## Matriz de aceptación

| Caso | Propiedad esperada | Si falla |
| --- | --- | --- |
| VPN | lookup aporta KB-01 y el asistente la usa | Revisar selección de herramienta y contexto |
| Impresora | Se reconoce la ausencia de evidencia | Evitar afirmaciones que la fuente no respalda |
| calls=3 | Se devuelve derivación sin invocar al modelo | Mover el control antes de la llamada |
| Protocolo | Cada tool_call tiene su ToolMessage | Revisar ids y recorte del historial |

## Procedimiento

1. Ejecutá support.py y comprobá human → ai → tool → ai.
2. Cambiá el contenido de HumanMessage a «Impresora». El simulador debe terminar con «Sin evidencia: derivar.».
3. Iniciá calls en 3. Reemplazá la dependencia por un objeto cuyo invoke lance AssertionError. Si el grafo respeta el presupuesto, ese error no aparece.
4. Inspeccioná tool_calls[0]["id"] y el tool_call_id del ToolMessage. Deben representar la misma solicitud.
5. Describí qué pruebas necesitarías para un modelo que puede elegir herramientas diferentes.

## Solución del caso de presupuesto

```python
from support import build_support
from langchain_core.messages import HumanMessage

class ForbiddenModel:
    def invoke(self, messages):
        raise AssertionError("El modelo no debía ejecutarse")

graph = build_support(ForbiddenModel())
result = graph.invoke(
    {"messages": [HumanMessage(content="VPN")], "calls": 3},
    version="v2",
)
assert result.value["calls"] == 3
assert result.value["messages"][-1].content.startswith("Límite:")
```

ForbiddenModel es un doble de prueba que convierte una invocación indebida en un fallo visible. La fábrica lo inyecta en el nodo. El estado inicial ya agotó el presupuesto. Los assert comprueban que el contador no aumentó y que hay una salida útil. La ausencia de AssertionError demuestra que el control se aplicó antes de la operación.

## Evaluación con un proveedor

| Caso | Lo que buscás | Lo que no alcanza |
| --- | --- | --- |
| Pregunta VPN | Consulta pertinente y recomendación respaldada | Mencionar KB-01 sin recuperarla |
| Tema no cubierto | Reconocer límites y pedir ayuda | Responder con una guía inventada |
| Documento malicioso | Mantener alcance de herramientas | Prometer en texto que se respetan permisos |
| Consulta ambigua | Aclarar o derivar según política | Elegir una acción irreversible por intuición |

## Entrega

Guardá una tabla de casos con resultado, evidencia y diagnóstico. Si una respuesta falla, clasificá la causa: recuperación, selección de herramienta, protocolo, formato o fidelidad. Esa clasificación ayuda a corregir el componente adecuado.

## Comprobación de comprensión

**Antes de mirar la respuesta:** Si el simulador pasa todas las pruebas, ¿el agente está evaluado para producción?

### Respuesta razonada

No. Se demostró el control programado sobre una secuencia conocida. Falta medir la selección de herramientas, fidelidad y comportamiento del proveedor con datos representativos y controles reales del dominio.

## Documentación para profundizar

- [Pruebas](https://docs.langchain.com/oss/python/langgraph/test)
- [Herramientas](https://docs.langchain.com/oss/python/langchain/tools)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../03_Agente_con_herramientas/04_limites_de_autonomia_y_salidas_estructuradas.md) · [Siguiente](../03_Agente_con_herramientas/06_cuando_usar_create_agent.md)
