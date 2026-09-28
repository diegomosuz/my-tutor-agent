---
id: "m04_t06"
title: "Práctica: reinicio, rechazo y aislamiento"
module: "Persistencia y aprobación"
module_order: 4
topic_order: 6
duration_minutes: 30
level: "intermedio-avanzado"
language: "es"
prerequisites: "Módulo 4 completo."
objectives: ["Demostrar recuperación entre procesos y separación de threads.", "Especificar pruebas de efectos que todavía no existen en el simulador."]
---

# 4.6. Práctica: reinicio, rechazo y aislamiento

**Módulo 4: Persistencia y aprobación · Dedicación estimada: 30 minutos**

## Qué vas a poder hacer

- Demostrar recuperación entre procesos y separación de threads.
- Especificar pruebas de efectos que todavía no existen en el simulador.

**Antes de empezar:** Módulo 4 completo.

## Consigna

Prepará dos casos con el mismo archivo SQLite: caso-A y caso-B. Iniciá ambos, aprobá A y rechazá B. Cerrá los procesos entre inicio y reanudación. La entrega debe mostrar que el resultado de un thread no reemplaza el del otro.

## Secuencia sugerida

```powershell
& $cursoPython start_review.py --thread caso-A
& $cursoPython start_review.py --thread caso-B
& $cursoPython resume_review.py --thread caso-A --decision aprobar
& $cursoPython resume_review.py --thread caso-B --decision rechazar
```

## Qué registrar

| Comprobación | Resultado esperado |
| --- | --- |
| Inicio A | Payload de revisión de A |
| Inicio B | Otra revisión pendiente |
| Reanudar A | SIMULADO |
| Reanudar B | RECHAZADO |
| Reanudar un ID inexistente | Rechazo del script por falta de revisión |
| Volver a iniciar A | Rechazo del script por identidad ya existente |

## Respuesta conceptual

| Pregunta | Respuesta esperada |
| --- | --- |
| ¿Por qué RAM no sobrevivió? | El saver desapareció con el proceso. |
| ¿Por qué usar el mismo thread_id? | Identifica el recorrido pendiente. |
| ¿Qué se repite al reanudar? | El comienzo del nodo interrumpido. |
| ¿La aprobación autentica a la persona? | El servicio debe verificar identidad y permisos. |
| ¿Un checkpoint evita duplicar un envío? | La integración necesita idempotencia. |

Revisemos la evidencia. Si la recuperación desde disco funcionó, demostramos que el nuevo proceso pudo reconstruir el grafo y localizar el recorrido pendiente. Eso no equivale a demostrar una recuperación general frente a cualquier falla.

El print anterior a interrupt aparece otra vez porque el nodo reinicia. Una preparación pura puede repetirse sin consecuencias. Una escritura externa no protegida sería un problema. Esta observación debe influir en cómo dividimos los nodos.

La decisión humana se conserva como un dato, pero su legitimidad requiere controles del servicio. En una implementación real registraríamos quién decidió, qué versión del borrador revisó y cuándo ocurrió. Una reanudación duplicada o tardía debería producir una respuesta controlada.

También necesitamos manejar cambios de código. Si una versión nueva elimina un nodo en el que había casos pendientes, debemos decidir si drenamos esos casos con la versión anterior o migramos su estado de manera compatible. Desplegar código y desplegar un workflow con estado persistente no tienen exactamente las mismas implicaciones.

Pensemos ahora en una operación real. Si aprobamos un mensaje y luego el proceso falla durante el envío, la repetición debe usar la misma clave de idempotencia. El checkpointer conserva el recorrido y el receptor evita repetir el efecto. Son responsabilidades complementarias.

Les dejo una prueba mental: si podemos reiniciar después de cada frontera importante y todavía explicar qué ocurrió, nuestro diseño es más fácil de operar. Si dependemos de que una función larga nunca se interrumpa, necesitamos revisar su granularidad.

Compará la ruta rechazada con la recuperación desde SQLite. El siguiente módulo ampliará la topología, pero mantendrá exactamente estos principios sobre estado y repetición.

## Una decisión inválida

Invocar Command(resume="false") no satisface el contrato del nodo review. Para comprobarlo, usá un caso fresco con InMemorySaver y esperá ValueError. No interpretes esa prueba como un procedimiento universal para corregir una decisión inválida en un thread ya persistido: el manejo de entradas erróneas debe realizarse en el servicio antes de entregar resume.

## Lo que la prueba no afirma

SIMULADO verifica una transición. El ejemplo no envía correos, no consulta un directorio corporativo y no implementa una garantía de idempotencia externa. Si reemplazás finalize por una integración, agregá una prueba con un adaptador espía: ante rechazo, su contador debe permanecer en cero.

Para recuperación de efectos, simulá un receptor que acepta la intención y luego provoca un timeout. Reintentá con la misma clave y comprobá una sola operación registrada. Esa es la evidencia relevante; solo inspeccionar el texto final no detecta un duplicado remoto.

## Extensión opcional

Cambiá la ruta del archivo de base de datos al reanudar. Explicá por qué desaparece la revisión aunque thread_id sea igual. Después restaurá la ruta correcta y comprobá que el caso continúa disponible. No borres ni sobrescribas la base original para realizar el experimento.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Cuál es la evidencia mínima para afirmar que la pausa sobrevive al proceso?

### Respuesta razonada

Que un proceso finaliza después de guardar la pausa y otro proceso reconstruye el mismo grafo, abre el mismo backend y reanuda con el mismo thread_id. Mantener un objeto vivo en una sola sesión no demuestra esa propiedad.

## Documentación para profundizar

- [Interrupciones](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers)
- [Pruebas](https://docs.langchain.com/oss/python/langgraph/test)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../04_Persistencia_y_aprobacion/05_stores_inspeccion_e_historial_de_ejecucion.md) · [Siguiente](../05_Orquestacion_avanzada/01_paralelismo_estatico_y_barreras_de_reunion.md)
