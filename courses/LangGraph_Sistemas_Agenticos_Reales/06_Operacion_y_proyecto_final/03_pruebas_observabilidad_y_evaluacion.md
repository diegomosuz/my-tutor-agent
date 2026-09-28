---
id: "m06_t03"
title: "Pruebas, observabilidad y evaluación"
module: "Operación y proyecto final"
module_order: 6
topic_order: 3
duration_minutes: 30
level: "intermedio-avanzado"
language: "es"
prerequisites: "Módulos 2 a 5."
objectives: ["Probar propiedades del flujo con dobles determinísticos.", "Diseñar trazas y evaluaciones que expliquen calidad y fallos."]
---

# 6.3. Pruebas, observabilidad y evaluación

**Módulo 6: Operación y proyecto final · Dedicación estimada: 30 minutos**

## Qué vas a poder hacer

- Probar propiedades del flujo con dobles determinísticos.
- Diseñar trazas y evaluaciones que expliquen calidad y fallos.

**Antes de empezar:** Módulos 2 a 5.

## Tres preguntas complementarias

Una prueba de nodo verifica una transformación. Una prueba de integración verifica rutas, protocolo y persistencia. Una evaluación de calidad pregunta si el proveedor produce resultados útiles y fieles sobre casos representativos. Ninguna reemplaza a las otras.

## Prueba de rechazo

Esta prueba valida una transición importante: el flujo debe pausar y una decisión negativa debe producir rechazo. Usa un saver propio para que el resultado no dependa de otra prueba o de una conversación anterior.

El módulo review_graph contiene definiciones y constructor, sin bloques que ejecuten casos al importarlo. Esa separación facilita reutilizar el grafo desde una aplicación o desde pruebas.

En el laboratorio finalize sólo escribe status. Si el nodo enviara una operación real, sustituiríamos el adaptador por un spy y comprobaríamos que su cantidad de llamadas es cero ante rechazo. Esa prueba sería más directa sobre el efecto que queremos impedir.

Además necesitamos pruebas de nodos puros, rutas y recuperación. Una consulta vacía, una fuente desconocida, un timeout y un reinicio con interrupt pendiente son casos distintos. Elegimos pruebas por riesgos concretos.

Para el modelo combinamos tests determinísticos del control con evaluaciones sobre un conjunto de consultas representativas. No esperamos que un assert de cadenas idénticas capture toda la calidad de una respuesta abierta.

La evaluación debería comprobar fidelidad a la evidencia, selección de herramienta, reconocimiento de límites y costo. Conviene conservar casos difíciles encontrados en uso real como regresiones.

El objetivo de una suite no es replicar cada línea de implementación. Es proteger propiedades observables que el usuario y el negocio necesitan. Esta prueba de rechazo seguirá teniendo sentido aunque refactoricemos las funciones internas.

```python
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from review_graph import review_builder

def check_rejection():
    g = review_builder.compile(checkpointer=InMemorySaver())
    cfg = {"configurable": {"thread_id": "test-reject"}}
    first = g.invoke(
        {"ticket_id": "T1", "draft": "Propuesta"},
        cfg, version="v2",
    )
    assert first.interrupts
    final = g.invoke(Command(resume=False), cfg, version="v2")
    assert final.value["status"] == "RECHAZADO"

check_rejection()
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos un saver nuevo para aislar la prueba. |
| 2 | Importamos el comando de reanudación. |
| 3 | Importamos el constructor sin invocaciones automáticas del módulo de revisión. |
| 5 | Definimos una comprobación ejecutable. |
| 6 | Creamos un grafo con un saver exclusivo para esta prueba. |
| 7 | La identidad del thread queda dentro de ese almacenamiento aislado. |
| 8 | Iniciamos una propuesta. |
| 9 | Proporcionamos datos mínimos y determinísticos. |
| 10 | Usamos la configuración de prueba y el formato v2. |
| 11 | Cerramos la invocación. |
| 12 | Comprobamos que hubo una pausa antes de finalizar. |
| 13 | Reanudamos con una decisión negativa. |
| 14 | Verificamos el contrato crítico de rechazo. |
| 16 | Ejecutamos la función. También puede convertirse en un test de pytest renombrándola con prefijo test_. |

La suite test_course.py del laboratorio añade comprobaciones de rutas, evidencia ausente, presupuesto, aislamiento de threads, persistencia entre procesos y proyecto final. Se ejecuta con unittest de la biblioteca estándar.

```powershell
& $cursoPython -m unittest -v test_course.py
```

## Diseñar aserciones sobre propiedades

No pruebes simplemente que el programa terminó. Preguntá qué comportamiento debe permanecer cierto: no llamar al modelo cuando no hay presupuesto; no habilitar una acción sin aprobación; no mezclar threads; conservar las dos contribuciones de una distribución.

Para un texto generado, una comparación literal puede ser demasiado frágil. En cambio, la presencia de una referencia recuperada es una propiedad estructural. La fidelidad semántica requiere una rúbrica y datos de evaluación, no solo comprobar una subcadena.

## Qué observar

| Pregunta | Dato que necesitamos | Uso |
| --- | --- | --- |
| ¿Qué camino tomó? | Thread, ejecución, nodo y transición | Depurar decisiones |
| ¿Dónde esperó o falló? | Latencia y errores por nodo | Priorizar correcciones |
| ¿Cuánto consumió? | Llamadas, tokens y costo del proveedor | Controlar presupuesto |
| ¿Usó evidencia pertinente? | Fuentes recuperadas y respuesta | Evaluar fidelidad |
| ¿Cuándo intervino una persona? | Motivo, decisión y versión del borrador | Auditar aprobación |

Una traza permite reconstruir una ejecución concreta. Necesitamos correlacionar thread, ejecución y nodos. Si sólo guardamos el texto final, perdemos la explicación de qué herramientas se usaron y dónde ocurrió un error.

Medimos latencia por nodo y de extremo a extremo. Un promedio puede ocultar una cola de solicitudes lentas, así que en operación suelen interesar percentiles y distribución. No inventamos umbrales universales: los definimos a partir del caso de uso y la experiencia esperada.

Para costo registramos llamadas, tokens y precios aplicables del proveedor. El contador calls del laboratorio es una señal de control, pero no reemplaza la información de facturación ni captura necesariamente reintentos internos.

La calidad requiere datos adicionales. Conservamos las fuentes recuperadas y evaluamos si la respuesta las utiliza correctamente. También verificamos cuándo el sistema reconoce una limitación. Una tasa alta de respuestas no es necesariamente buena si incluye invenciones.

LangSmith puede ayudar a inspeccionar trazas y administrar evaluaciones. También podemos comenzar con logs estructurados y una suite propia. La herramienta elegida debe permitir responder preguntas concretas sobre el comportamiento.

Minimizamos información sensible en logs. Un dump completo del estado puede incluir datos personales o credenciales si el diseño fue descuidado. La observabilidad necesita permisos y retención igual que el almacenamiento principal.

Finalmente, cada cambio de prompt, modelo o herramienta debe compararse sobre el mismo conjunto de casos. Esa comparación nos permite decidir si una mejora aparente en una demostración se sostiene en condiciones representativas.

## Ejemplo de evento de aplicación

```json
{
  "run_id": "run-123",
  "thread_id": "ticket-42",
  "node": "review",
  "event": "awaiting_approval",
  "draft_version": 3,
  "duration_ms": 18
}
```

run_id distingue una ejecución de otras invocaciones del mismo thread. node y event explican el punto del recorrido. draft_version vincula revisión con propuesta. duration_ms mide esa etapa; no debe confundirse con el tiempo completo del caso, que puede incluir horas de espera humana.

## Dataset de evaluación mínimo

Incluí preguntas conocidas, temas no cubiertos, consultas ambiguas y textos que intentan desviar instrucciones. Para cada caso definí fuentes permitidas, condición de salida y criterios de contenido. Conservá versiones del modelo, prompt, herramienta y dataset al comparar cambios.

| Métrica | Interpretación | Trampa frecuente |
| --- | --- | --- |
| Fidelidad | Afirmaciones respaldadas por fuentes | Premiar fluidez sin sustento |
| Derivación correcta | Reconocer límites cuando corresponde | Castigar cualquier derivación |
| Latencia p95 | Experiencia de casos lentos | Mirar solo la media |
| Costo por caso | Recursos consumidos para resolver | Ignorar reintentos o llamadas auxiliares |
| Recuperación | Casos pendientes continuados correctamente | Probar solo dentro del mismo proceso |

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Una mejora en un ejemplo aislado demuestra que cambió la calidad general?

### Respuesta razonada

No. Compará sobre el mismo conjunto representativo y explicá qué dimensión mejora y cuál empeora. Una traza explica una ejecución; una evaluación permite contrastar comportamiento recurrente.

## Documentación para profundizar

- [Pruebas](https://docs.langchain.com/oss/python/langgraph/test)
- [Descripción de LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../06_Operacion_y_proyecto_final/02_reintentos_cache_y_presupuesto_operativo.md) · [Siguiente](../06_Operacion_y_proyecto_final/04_seguridad_y_arquitectura_de_despliegue.md)
