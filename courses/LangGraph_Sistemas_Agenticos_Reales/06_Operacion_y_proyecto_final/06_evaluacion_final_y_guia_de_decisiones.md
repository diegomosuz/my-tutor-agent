---
id: "m06_t06"
title: "Evaluación final y guía de decisiones"
module: "Operación y proyecto final"
module_order: 6
topic_order: 6
duration_minutes: 20
level: "intermedio-avanzado"
language: "es"
prerequisites: "Proyecto final implementado y resultados registrados."
objectives: ["Evaluar un sistema por evidencias verificables.", "Elegir la capacidad más simple que cubra un comportamiento."]
---

# 6.6. Evaluación final y guía de decisiones

**Módulo 6: Operación y proyecto final · Dedicación estimada: 20 minutos**

## Qué vas a poder hacer

- Evaluar un sistema por evidencias verificables.
- Elegir la capacidad más simple que cubra un comportamiento.

**Antes de empezar:** Proyecto final implementado y resultados registrados.

## Rúbrica del proyecto

| Dimensión | Evidencia de logro | Peso orientativo |
| --- | --- | --- |
| Control del flujo | Rutas, salida y presupuesto verificables | 25% |
| Estado y recuperación | Pausa, reinicio y aislamiento por thread | 25% |
| Herramientas y evidencia | Contratos y respuesta sustentada | 20% |
| Pruebas y observabilidad | Fallos representativos y traza útil | 20% |
| Simplicidad del diseño | Cada componente tiene una razón | 10% |

Control del flujo significa que podemos explicar todas las rutas y las condiciones de salida. Una demostración feliz sin límites no alcanza. Estado y recuperación requieren una pausa real, un reinicio y aislamiento entre identidades de ejecución.

Herramientas y evidencia se evalúan por contratos y fidelidad. Una respuesta elegante sin respaldo no satisface el caso. Pruebas y observabilidad requieren escenarios que representen fallos concretos y trazas que permitan encontrar la causa.

Simplicidad significa que cada componente tiene una razón. Un diseño con una API, un grafo y una base puede ser una mejor solución que varios servicios si cumple los requerimientos con menor carga operativa.

Para una acción externa real hay condiciones obligatorias que no compensamos con puntos en otras dimensiones. La autorización debe ser válida, la aprobación debe corresponder a la propuesta y el efecto debe soportar repetición segura.

La devolución útil nombra una propiedad y su evidencia. Por ejemplo: el rechazo está cubierto por una prueba que comprueba cero llamadas al adaptador. Eso es más concreto que decir que el sistema parece robusto.

Para esta propuesta formativa, se recomienda alcanzar al menos 80 puntos sobre 100 y demostrar las rutas obligatorias. No se compensan con diseño visual una ruta de rechazo incorrecta o una pérdida de continuidad del caso. Si se conecta una acción real, autorización, correspondencia de aprobación e idempotencia son requisitos previos adicionales.

## Guía de elección

| Si necesitás… | Usá primero… |
| --- | --- |
| Una secuencia conocida | Funciones y aristas explícitas |
| Elegir una ruta por estado | Arista condicional |
| Actualizar y navegar desde un nodo | Command |
| Esperar una decisión externa | Checkpointer, interrupt y resume |
| Distribuir una cantidad variable de tareas | Send con reducer y reunión |
| Reutilizar una responsabilidad | Subgrafo con contrato acotado |
| Un ciclo estándar de herramientas | create_agent o un ciclo pequeño explícito |

Para esperar una decisión necesitamos persistencia e interrupt. Para distribuir trabajos cuyo número conocemos recién al ejecutar, Send. Para reutilizar una responsabilidad, un subgrafo con entradas y salidas claras.

Si el requerimiento coincide con el ciclo estándar de herramientas, una fábrica como create_agent puede evitar código innecesario. Si necesitamos controlar la topología, el ciclo explícito nos permite hacerlo con pocas piezas.

La memoria a largo plazo, la caché, varios agentes o una cola se agregan cuando aparece una necesidad concreta. Cada elección debe venir acompañada de una propiedad que podamos probar.

La competencia que buscamos en el curso se demuestra al leer una ejecución y explicarla: qué datos llegaron, qué nodo se habilitó, qué cambió, por qué continuó y qué pasaría al reiniciar. Ese conocimiento permite construir aplicaciones que se puedan mantener.

## Autoevaluación con situaciones

Respondé primero sin consultar las soluciones.

1. Dos ramas escriben findings. ¿Qué define si se reemplazan o combinan?
2. Un nodo guarda un correo enviado y luego interrumpe. ¿Qué puede ocurrir al reanudar?
3. Un proveedor devuelve JSON válido con una fuente inexistente. ¿Qué capa detecta el problema?
4. El mismo usuario abre dos tickets. ¿Deben compartir thread por defecto?
5. Un subgrafo mantiene conversación entre llamadas y es invocado en paralelo. ¿Qué riesgo aparece?
6. Una demo con simulador pasa todas las pruebas. ¿Qué falta para evaluar el modelo real?

### Soluciones razonadas

1. El contrato del canal y su reducer. Para contribuciones concurrentes debe existir una combinación coherente o separar campos; no se asume «último escritor».
2. El nodo reinicia y puede repetir trabajo anterior a interrupt. Separar el efecto y usar idempotencia reduce ese riesgo; un checkpoint no deshace el envío.
3. La validación de referencias contra evidencia recuperada detecta la fuente desconocida. Pydantic valida estructura; una evaluación de fidelidad analiza el contenido.
4. Normalmente son continuidades distintas. El usuario tiene acceso autorizado a varios threads; identidad de persona e identidad de ejecución no son lo mismo.
5. Si comparten namespace persistente pueden competir por el mismo estado. Elegí memoria por invocación para tareas independientes o serializá el acceso requerido.
6. Un dataset representativo, rúbrica de contenido, trazas de selección de herramientas y comparación de costo/latencia. Las pruebas del simulador cubren el control programado.

## Matriz de evidencia para la revisión

| Afirmación | Evidencia que deberías mostrar |
| --- | --- |
| «Tiene límites» | Prueba donde no se llama al modelo sin presupuesto |
| «Se recupera» | Ejecuciones en procesos distintos con el mismo caso |
| «Es trazable» | Relación entre pregunta, herramienta, fuente y resultado |
| «Es seguro para varias organizaciones» | Pruebas de aislamiento y autorización en adaptadores |
| «Es simple» | Razón funcional para cada componente y servicio |

## Plan de continuidad

Seleccioná una sola mejora y fijá antes cómo vas a medirla. Si agregás recuperación documental, medí pertinencia y fidelidad. Si agregás persistencia operativa, probá restauración y concurrencia. Si cambiás el modelo, compará sobre el mismo dataset. El conocimiento del framework se convierte en competencia cuando permite explicar y verificar esas decisiones.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Cuál es la demostración final de dominio de LangGraph?

### Respuesta razonada

Poder seguir una ejecución, explicar qué dato habilitó cada transición, identificar qué puede repetirse y elegir mecanismos proporcionales al requisito. Conocer nombres de APIs sin esas relaciones no alcanza para mantener un sistema real.

## Documentación para profundizar

- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [Workflows y agentes](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [Pruebas](https://docs.langchain.com/oss/python/langgraph/test)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../06_Operacion_y_proyecto_final/05_proyecto_final_soporte_con_evidencia_y_aprobacion.md)
