---
id: "m05_t06"
title: "Patrones de orquestación y práctica integradora"
module: "Orquestación avanzada"
module_order: 5
topic_order: 6
duration_minutes: 30
level: "intermedio-avanzado"
language: "es"
prerequisites: "Módulo 5 completo."
objectives: ["Elegir un patrón por el comportamiento requerido.", "Verificar distribución vacía, repetida y variable sin sobreingeniería."]
---

# 5.6. Patrones de orquestación y práctica integradora

**Módulo 5: Orquestación avanzada · Dedicación estimada: 30 minutos**

## Qué vas a poder hacer

- Elegir un patrón por el comportamiento requerido.
- Verificar distribución vacía, repetida y variable sin sobreingeniería.

**Antes de empezar:** Módulo 5 completo.

## Un patrón es una forma de control

| Necesidad | Patrón posible | Costo que debemos justificar |
| --- | --- | --- |
| Pasos conocidos | Cadena o workflow | Mantener contratos entre pasos |
| Tipo de consulta variable | Router | Calidad de clasificación y rutas de escape |
| Tareas independientes | Paralelismo o map-reduce | Concurrencia y reunión de resultados |
| Mejora contra un criterio | Evaluador y optimizador | Ciclos, criterio y presupuesto |
| Responsabilidades especializadas | Supervisor o handoffs | Contexto, coordinación y evaluación por rol |

Los patrones expresan formas de control. Una cadena sirve cuando los pasos son conocidos. Un router selecciona una alternativa. Map-reduce distribuye trabajos independientes. Un evaluador y optimizador repite una propuesta contra un criterio de aceptación.

El patrón evaluador necesita una salida. Si sólo pedimos mejorar otra vez, podemos entrar en ciclos sin una métrica útil. Definimos qué significa suficiente, cuántas vueltas permitimos y qué resultado entregamos si no se alcanza el criterio.

Varios agentes pueden tener sentido cuando cada responsabilidad necesita herramientas, contexto o políticas distintas. Un supervisor puede delegar subtareas y reunir resultados. En un handoff cambia quién conduce una interacción. Esas decisiones afectan memoria y autorización.

No contamos agentes por la cantidad de prompts. Dos nodos que llaman al mismo modelo con tareas distintas no necesariamente requieren identidades autónomas. Podemos mantenerlos dentro de un workflow claro.

Cada rol adicional introduce costo de contexto, latencia y nuevas superficies de evaluación. Necesitamos medir qué mejora respecto de una base más sencilla. Por ejemplo, que un especialista reduzca errores en una categoría verificable y que el coordinador no pierda la evidencia al reunir.

En nuestro asistente pequeño, una herramienta de consulta y una aprobación humana bastan. Si mañana incorporamos una investigación especializada, podríamos encapsularla como subgrafo. La decisión de convertirla en agente vendrá de la variabilidad que deba resolver, no de una preferencia por diagramas con muchos actores.

## Práctica con fuentes dinámicas

Modificá DATA en fanout.py para agregar policy con una instrucción identificada. Probá una fuente, tres fuentes, ninguna fuente y una fuente repetida. Registrá cuántas tareas esperás y qué contribuciones debe reunir el grafo.

| Entrada | Resultados esperados | Propiedad |
| --- | --- | --- |
| ["kb"] | 1 contribución | Una tarea |
| ["kb", "status", "policy"] | 3 contribuciones | Distribución dinámica |
| [] | 0 contribuciones y summary vacío | Ruta vacía explícita |
| ["kb", "kb"] | 2 contribuciones | add conserva duplicados |

La tabla hace visible el contrato que implementamos. Un elemento genera una tarea. Tres elementos generan tres. La lista vacía va directamente a collect. Un identificador repetido genera dos contribuciones porque no añadimos deduplicación.

Eso no es necesariamente un error: puede ser correcto si cada elemento representa una tarea distinta. Si representan fuentes únicas, deduplicamos antes de Send y preservamos un orden estable cuando importe.

Sorted hace estable la presentación. No cambia la ejecución ni prueba que las fuentes hayan terminado en ese orden. No confundamos una lista final ordenada con una secuencia causal.

El resultado más importante de la práctica es poder explicar dónde se resuelve cada responsabilidad. Dispatch crea trabajos. Search consulta. El reducer combina. Collect presenta. Esa separación permite cambiar una política sin esconderla en otro paso.

En el módulo final veremos cómo observar estas ejecuciones y cómo convertir los contratos que fuimos definiendo en pruebas y criterios de aceptación. Mantendremos una arquitectura de despliegue pequeña y añadiremos componentes únicamente cuando la duración o la concurrencia lo exijan.

## Solución mínima

```python
from fanout import DATA, fanout

DATA["policy"] = "PL-01: derivar incidentes de acceso sensibles"
cases = [(["kb"], 1), (["kb", "status", "policy"], 3), ([], 0), (["kb", "kb"], 2)]
for sources, expected_count in cases:
    result = fanout.invoke({"sources": sources, "results": []}, version="v2")
    assert len(result.value["results"]) == expected_count
    print(result.value["summary"])
```

La importación obtiene la fuente didáctica y el grafo. La asignación agrega una entrada al catálogo local. Cada caso declara su cantidad de contribuciones esperada. invoke inicia un estado nuevo; el assert verifica cardinalidad y print permite inspeccionar el orden de presentación.

Esta solución modifica el diccionario global únicamente como dato del laboratorio. En una aplicación concurrente, la configuración de fuentes debe tener un ciclo de vida y una política de actualización explícitos, sin mutaciones arbitrarias por solicitud.

## Diseñar un evaluador con salida

Un ciclo proponer → evaluar → corregir necesita un criterio de aceptación, un máximo de iteraciones y una salida si no mejora. Si el evaluador es otro LLM, su juicio también necesita calibración. «El segundo modelo dijo que está bien» no sustituye un conjunto de pruebas o referencias.

Un supervisor se justifica cuando coordina responsabilidades con herramientas o contexto distintos. Un handoff transfiere quién conduce la interacción. Un workflow con dos prompts puede ser suficiente cuando el plan ya está definido. No uses la cantidad de prompts como conteo de agentes.

## Entrega

Presentá la matriz de resultados y una decisión: ¿conservarías duplicados o deduplicarías fuentes? Justificala según la identidad de la tarea. Agregá un ejemplo donde el orden de llegada no debería afectar la respuesta y explicá cómo lo normalizás.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Qué evidencia justificaría reemplazar el diseño por varios agentes?

### Respuesta razonada

Una mejora medible que requiera políticas, herramientas o contextos separados, y que compense el costo de coordinación. Si el mismo comportamiento se expresa claramente con funciones y un router, ese diseño sigue siendo una base válida.

## Documentación para profundizar

- [Workflows y agentes](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [Implementación con Graph API](https://docs.langchain.com/oss/python/langgraph/use-graph-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../05_Orquestacion_avanzada/05_functional_api_y_recuperacion_de_tareas.md) · [Siguiente](../06_Operacion_y_proyecto_final/01_streaming_y_ejecucion_asincrona.md)
