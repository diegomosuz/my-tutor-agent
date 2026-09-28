---
id: "m03_t06"
title: "Cuándo usar create_agent"
module: "Agente con herramientas"
module_order: 3
topic_order: 6
duration_minutes: 15
level: "intermedio-avanzado"
language: "es"
prerequisites: "Módulo 3; proveedor opcional para ejecutar esta variante."
objectives: ["Comparar una fábrica de agentes con un grafo explícito.", "Identificar qué políticas deben reconstruirse al cambiar de abstracción."]
---

# 3.6. Cuándo usar create_agent

**Módulo 3: Agente con herramientas · Dedicación estimada: 15 minutos**

## Qué vas a poder hacer

- Comparar una fábrica de agentes con un grafo explícito.
- Identificar qué políticas deben reconstruirse al cambiar de abstracción.

**Antes de empezar:** Módulo 3; proveedor opcional para ejecutar esta variante.

## Una abstracción de mayor nivel

Después de construir el ciclo manualmente, podemos apreciar cuándo sirve una abstracción de mayor nivel. create_agent proporciona la arquitectura estándar de modelo y herramientas sobre LangGraph.

El ejemplo utiliza el modelo configurado y la herramienta, pero no hereda automáticamente nuestro contador calls ni la política exacta del nodo agent. Si queremos límites o controles adicionales, debemos usar las capacidades de personalización de esa abstracción y probarlos.

¿Cuándo lo elegiría? Cuando el ciclo estándar satisface el requerimiento y sus puntos de extensión alcanzan. ¿Cuándo mantendría StateGraph explícito? Cuando la topología, las rutas de aprobación o la coordinación requieren un control que quiero ver directamente en el código.

La guía de migración de LangGraph v1 orienta las nuevas aplicaciones hacia create_agent frente al helper antiguo create_react_agent. Eso no elimina Graph API: son niveles distintos de abstracción.

El entorno del curso incluye langchain==1.4.2 para esta variante. Usa el mismo cliente ChatOpenAI y la misma herramienta lookup. Su propósito es comparar el ensamblado de un ciclo estándar, no reemplazar automáticamente las políticas del ejemplo anterior.

```python
from langchain.agents import create_agent

simple_agent = create_agent(
    model=model,
    tools=[lookup],
    system_prompt=SYSTEM,
)
answer = simple_agent.invoke({
    "messages": [{"role": "user", "content": "Ayuda con VPN"}]
})
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos la fábrica de agentes de LangChain. Requiere instalar langchain, que es una dependencia opcional de esta variante. |
| 3 | Creamos una arquitectura estándar. |
| 4 | Reutilizamos el modelo configurado, sin el bind_tools manual del ejemplo anterior. |
| 5 | Proporcionamos las herramientas disponibles. |
| 6 | Reutilizamos la política del sistema. |
| 7 | Cerramos la creación del agente. |
| 8 | Invocamos la abstracción de alto nivel con su formato habitual de entrada. |
| 9 | Proporcionamos una consulta en representación de mensajes por rol y contenido. |
| 10 | Cerramos la entrada y la llamada. |

[Archivo ejecutable: standard_agent.py](../_laboratorio/standard_agent.py)

El archivo completo importa lookup y SYSTEM desde support, crea el cliente con configured_model y muestra el mensaje final. Requiere credenciales y un modelo compatible. La ejecución usa la salida de diccionario habitual del ejemplo, por eso accede a answer["messages"] y no a answer.value.

## Qué conserva y qué cambia

| Aspecto | Se conserva conceptualmente | Hay que revisar |
| --- | --- | --- |
| Herramienta | Nombre, esquema y función | Exposición y manejo de errores |
| Conversación | Mensajes y observaciones | Estado y formato devuelto |
| Control | Herramientas disponibles | Presupuesto exacto y middleware |
| Persistencia | Identidad y checkpoints | Configuración elegida |
| Aprobación | Decisión externa autenticada | Punto de interrupción y política |

El contador calls del grafo manual no aparece por utilizar create_agent. Si ese límite es un requisito, implementalo con los mecanismos apropiados de la fábrica o conservá el grafo explícito. Una migración de abstracción debe comprobar equivalencia de comportamiento, no solo reducir líneas de código.

## Criterio de elección

Elegí create_agent cuando el ciclo estándar y sus puntos de extensión representan bien el caso. Elegí StateGraph cuando las transiciones del dominio necesitan una topología clara o una coordinación particular. Podés encapsular un agente creado por la fábrica dentro de un workflow mayor si su contrato de entrada y salida está definido.

El helper histórico create_react_agent aparece en materiales anteriores. La guía de migración de v1 orienta nuevos desarrollos hacia create_agent. Este curso mantiene el ciclo manual como instrumento de aprendizaje y como alternativa cuando el control explícito aporta claridad.

## Actividad

Compará el número de decisiones que debés explicar en ambas versiones: ¿quién elige la herramienta?, ¿quién la ejecuta?, ¿quién limita llamadas?, ¿quién autoriza? Si una respuesta desaparece al cambiar de API, identificá el punto de extensión correspondiente antes de migrar.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Menos código implica automáticamente una arquitectura más simple?

### Respuesta razonada

Solo si conserva visibles los contratos necesarios. Una fábrica reduce ensamblado repetido; un grafo explícito puede hacer más comprensible una política particular. La simplicidad se evalúa por facilidad de comprensión y mantenimiento, además de longitud.

## Documentación para profundizar

- [Agentes de LangChain](https://docs.langchain.com/oss/python/langchain/agents)
- [Migración de LangGraph v1](https://docs.langchain.com/oss/python/migrate/langgraph-v1)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../03_Agente_con_herramientas/05_practica_evidencia_trazas_y_condiciones_de_salida.md) · [Siguiente](../04_Persistencia_y_aprobacion/01_checkpoint_thread_y_memoria_compartida.md)
