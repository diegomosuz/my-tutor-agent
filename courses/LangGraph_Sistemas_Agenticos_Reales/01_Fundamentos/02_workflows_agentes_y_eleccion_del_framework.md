---
id: "m01_t02"
title: "Workflows, agentes y elección del framework"
module: "Fundamentos"
module_order: 1
topic_order: 2
duration_minutes: 15
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópico 1.1."
objectives: ["Distinguir un workflow con LLM de un agente.", "Elegir entre funciones, create_agent y Graph API según el control necesario."]
---

# 1.2. Workflows, agentes y elección del framework

**Módulo 1: Fundamentos · Dedicación estimada: 15 minutos**

## Qué vas a poder hacer

- Distinguir un workflow con LLM de un agente.
- Elegir entre funciones, create_agent y Graph API según el control necesario.

**Antes de empezar:** Tópico 1.1.

## Quién decide el próximo paso

Un workflow organiza una secuencia y sus alternativas mediante reglas definidas por el desarrollador. Puede ser tan sencillo como validar, consultar y responder. También puede tener bifurcaciones, ciclos y llamadas a modelos. Usar un modelo dentro de un paso no transforma automáticamente toda la aplicación en un agente.

En un agente, el modelo participa en la selección de acciones. Por ejemplo, decide buscar primero una guía de VPN, observa el resultado y luego pide información adicional. El recorrido concreto puede variar porque depende del contenido y de las observaciones. Aun así, nosotros definimos las herramientas disponibles, las condiciones de autorización y el presupuesto de ejecución.

Consideremos una clasificación de incidentes con una regla contractual exacta. Si la condición es determinística, una función ofrece una solución clara. Ahora pensemos en una consulta de soporte escrita libremente. Un modelo puede ayudar a interpretar la intención y decidir qué información buscar. Podemos combinar esas dos cosas dentro del mismo grafo.

Lo que cambia es dónde se toma cada decisión. La estructura del workflow controla las transiciones generales. El modelo puede proponer la próxima acción dentro de una parte de esa estructura. Por eso conviene dibujar los puntos de decisión y anotar quién los gobierna: una condición de negocio, el modelo o una persona.

Una pregunta útil antes de implementar es: ¿qué variabilidad del problema justifica delegar una elección al modelo? Si no podemos responderla, posiblemente estemos agregando autonomía sin una necesidad clara. La autonomía debe aportar valor medible y tener un límite verificable.

## Ubicación de las herramientas del ecosistema

| Capa | Qué aporta | Cuándo usarla |
| --- | --- | --- |
| Código Python | Funciones y lógica de negocio | Procesos simples y contratos exactos |
| LangChain | Integraciones y create_agent | Un ciclo estándar de modelo y herramientas |
| LangGraph | Estado y control de ejecución | Rutas propias, pausas, recuperación y coordinación |
| LangSmith | Trazas y evaluación, entre otras capacidades | Inspección del comportamiento y experimentos |

LangChain ofrece integraciones de modelos y herramientas y una fábrica de agentes de mayor nivel llamada create_agent. Es una opción razonable cuando necesitamos el ciclo habitual de modelo y herramientas con sus mecanismos de personalización. Esa fábrica utiliza LangGraph como base de ejecución.

LangGraph ofrece un control más explícito sobre el estado y el recorrido. Lo elegimos cuando necesitamos decidir la topología, combinar ramas, introducir pausas o expresar una política de ejecución particular. No es obligatorio usar las integraciones de LangChain: un nodo puede llamar a cualquier cliente que nosotros implementemos.

LangSmith permite observar y evaluar aplicaciones, además de otras capacidades del producto. Es útil, pero no es un requisito para aprender la librería ni para ejecutar los ejercicios locales. Podemos empezar con trazas estructuradas y pruebas propias.

En materiales antiguos encontrarán create_react_agent dentro de langgraph.prebuilt. Para desarrollos nuevos, la guía de migración orienta hacia create_agent de LangChain. En este curso construiremos el ciclo explícitamente para comprender su funcionamiento y luego compararemos la alternativa de alto nivel. Esa comparación nos ayudará a elegir la menor abstracción que resuelva el caso sin perder el control necesario.

## Una decisión técnica que puede justificarse

Antes de incorporar un framework escribí tres cosas: qué decisiones cambian entre entradas, qué información debe sobrevivir entre pasos y qué ocurre si el proceso se detiene. Un flujo de una llamada y una respuesta puede resolverse con una función. Si la ejecución necesita rutas propias, ciclos, pausas y reanudación, el estado explícito de un grafo aporta una ventaja concreta.

La complejidad operativa no desaparece por utilizar LangGraph. El framework no diseña las reglas de negocio ni autentica automáticamente al usuario. Tampoco convierte un endpoint de un modelo en una fuente confiable. Aporta mecanismos de ejecución que la aplicación debe configurar y combinar.

| Situación | Diseño inicial | Evidencia para ampliarlo |
| --- | --- | --- |
| Validar una fecha | Función y validación | Hay revisión diferida o varios estados de negocio |
| Consultar dos fuentes conocidas | Workflow con fan-out y reunión | Las fuentes deben elegirse de forma abierta |
| Explorar fuentes según hallazgos | Agente acotado | Un especialista mejora resultados medidos |
| Esperar una aprobación | Grafo con checkpoint e interrupt | El volumen exige workers o coordinación adicional |

## Actividad de transferencia

Elegí un proceso de tu trabajo y marcá cada decisión como «regla», «modelo» o «persona». Si asignaste una regla exacta al modelo, justificá la ventaja. Si asignaste todas las decisiones al modelo, identificá dónde se aplican permisos y límites.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Un workflow deja de ser workflow por incluir una llamada a un LLM?

### Respuesta razonada

No. El criterio es quién determina el recorrido. Un paso de redacción dentro de una secuencia fijada por código sigue siendo parte de un workflow. Un mismo sistema puede tener una zona agéntica y otra zona determinística.

## Documentación para profundizar

- [Workflows y agentes](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [Descripción de LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)
- [Agentes de LangChain](https://docs.langchain.com/oss/python/langchain/agents)
- [Migración de LangGraph v1](https://docs.langchain.com/oss/python/migrate/langgraph-v1)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../01_Fundamentos/01_componentes_de_un_sistema_agentico.md) · [Siguiente](../01_Fundamentos/03_estado_nodos_y_aristas.md)
