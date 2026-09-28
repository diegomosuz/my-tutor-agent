---
id: "m04_t04"
title: "Durabilidad, idempotencia y recuperación"
module: "Persistencia y aprobación"
module_order: 4
topic_order: 4
duration_minutes: 25
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópicos 4.1 a 4.3."
objectives: ["Explicar la ventana de duplicación de un efecto externo.", "Elegir una clave estable de idempotencia y un modo de durabilidad."]
---

# 4.4. Durabilidad, idempotencia y recuperación

**Módulo 4: Persistencia y aprobación · Dedicación estimada: 25 minutos**

## Qué vas a poder hacer

- Explicar la ventana de duplicación de un efecto externo.
- Elegir una clave estable de idempotencia y un modo de durabilidad.

**Antes de empezar:** Tópicos 4.1 a 4.3.

## Un fallo entre dos sistemas

| Situación | Comportamiento a considerar | Diseño apropiado |
| --- | --- | --- |
| Reanudar un interrupt | El nodo vuelve a empezar | Trabajo previo puro o repetible |
| Falla durante una llamada externa | El receptor pudo haberla aceptado | Clave de idempotencia de negocio |
| Replay desde un checkpoint | Los pasos posteriores pueden repetirse | Efectos protegidos y versiones registradas |
| Persistencia del runtime | sync, async y exit tienen distintos compromisos | Elegir pérdida tolerable y latencia |

Supongamos que enviamos una operación a un sistema externo. El receptor la acepta, pero nuestra aplicación falla antes de guardar el resultado. Al recuperar, no sabemos por el estado local si la acción ocurrió. Repetirla puede duplicar el efecto.

Una clave de idempotencia de negocio permite que el receptor reconozca la misma intención. Por ejemplo, una combinación estable de ticket, versión de borrador y tipo de acción. Generar una clave aleatoria en cada reintento no resuelve el problema: parecerían operaciones distintas.

Separar preparación, aprobación y efecto reduce puntos ambiguos. Si controlamos una base transaccional, un patrón outbox puede registrar una intención y delegar su entrega. Aun así, el consumidor debe tratar duplicados. Elegimos ese patrón cuando el requerimiento lo justifica.

Las tareas de la Functional API pueden conservar resultados de trabajo para reutilizarlos en recuperaciones. Eso ayuda a evitar repeticiones de tareas completadas, pero no elimina por sí solo la ventana entre aceptar un efecto externo y persistir su resultado. La idempotencia sigue siendo una responsabilidad de la integración.

Los modos de durabilidad tienen distintos compromisos. sync espera la persistencia antes de avanzar al siguiente paso. async puede persistir mientras comienza el siguiente. exit guarda en los puntos de salida establecidos por el runtime y ofrece menos protección ante un cierre abrupto durante el recorrido. Los tres necesitan un backend adecuado para persistir fuera de RAM.

Finalmente, replay no deshace acciones. Explorar un checkpoint anterior puede volver a ejecutar nodos posteriores. Usamos entornos controlados o adaptadores protegidos al investigar. Preguntate siempre qué parte del mundo externo puede cambiar al reproducir una ejecución.

## La ventana ambigua, paso por paso

1. El nodo solicita al sistema externo crear una acción.
2. El sistema externo acepta la acción y confirma internamente.
3. Se corta la conexión antes de que el grafo registre el resultado.
4. La aplicación recupera el checkpoint previo y vuelve a intentar.

Un timeout en el paso 3 no permite concluir que el paso 2 no ocurrió. Si el receptor identifica la misma intención, puede devolver el resultado anterior; si cada intento parece nuevo, puede duplicar la operación.

## Diseñar la identidad de la intención

Una clave como ticket-42:respuesta:v3 conserva significado entre reintentos del mismo borrador. Si la propuesta cambia a v4, puede corresponder a una intención diferente que necesita otra aprobación. La clave debe guardarse y viajar al adaptador; generarla de nuevo al azar en cada intento anula su utilidad.

| Mecanismo | Qué aporta | Límite |
| --- | --- | --- |
| Checkpoint | Estado recuperable del recorrido | No deshace el mundo externo |
| Idempotencia del receptor | Repetición de la misma intención sin duplicar | Requiere contrato y retención de claves |
| Outbox transaccional | Registra intención junto con cambios locales | El consumidor aún debe tratar duplicados |
| Transacción de negocio | Atomicidad dentro del recurso que controla | No cubre cualquier proveedor remoto |

## Qué protege cada modo

sync reduce la ventana entre avanzar y persistir una frontera; async permite superponer trabajo y escritura; exit prioriza persistir en salidas del runtime. No conviertas esas opciones en una promesa de exactamente una vez. Primero identificá qué fallos deben recuperarse y qué efectos pueden repetirse.

Un saver en RAM sigue siendo volátil aunque se use durability="sync". La política de escritura y la permanencia del soporte son dimensiones diferentes. La recuperación también depende de que el servicio reconstruya clientes, contexto autorizado y código compatible.

## Actividad

Diseñá un adaptador ficticio enviar_respuesta(ticket_id, draft_version, texto, idempotency_key). Escribí qué devolvería al recibir dos veces la misma clave y qué debe ocurrir si la misma clave llega con otro texto. Una respuesta defendible reutiliza el resultado para la misma intención y rechaza una reutilización incoherente.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Replay revierte una acción ejecutada después del checkpoint elegido?

### Respuesta razonada

No. Vuelve a recorrer trabajo desde una frontera histórica, pero no deshace correos, pagos o actualizaciones externas. Usá adaptadores protegidos o un entorno controlado al explorar rutas alternativas.

## Documentación para profundizar

- [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers)
- [Time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel)
- [Functional API](https://docs.langchain.com/oss/python/langgraph/functional-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../04_Persistencia_y_aprobacion/03_persistencia_con_sqlite_entre_procesos.md) · [Siguiente](../04_Persistencia_y_aprobacion/05_stores_inspeccion_e_historial_de_ejecucion.md)
