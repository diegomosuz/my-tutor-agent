# Glosario de LangGraph y sistemas agénticos

| Término | Significado en el curso |
| --- | --- |
| Agente | Sistema en el que el modelo participa en la elección de acciones dentro de herramientas, reglas y presupuestos definidos por la aplicación. |
| Workflow | Flujo cuyo recorrido general se expresa mediante reglas y transiciones programadas; puede incluir llamadas a modelos. |
| Orquestación | Coordinación de qué trabajo se habilita, qué datos recibe y cuándo termina o queda pendiente. |
| State | Datos compartidos que evoluciona la ejecución; no equivalen automáticamente al prompt. |
| Actualización parcial | Retorno de un nodo con solo los campos que produjo o modificó. |
| Nodo | Unidad de trabajo registrada en el grafo. Puede ser código determinístico, una integración o un agente. |
| Arista | Relación que habilita trabajo posterior; puede ser fija o condicional. |
| START / END | Marcadores de entrada y terminación usados al construir el grafo. |
| StateGraph | Constructor de Graph API para definir estado, nodos y conexiones antes de compilar. |
| compile | Preparación de un grafo ejecutable y vinculación de capacidades como checkpointer y caché. |
| Superpaso | Frontera de ejecución en la que nodos habilitados trabajan sobre una versión del estado y se aplican sus contribuciones. |
| Reducer | Función que combina el valor acumulado de un campo con una nueva actualización. |
| Asociatividad | Propiedad que permite reagrupar una combinación sin alterar su resultado; útil al combinar contribuciones. |
| Conmutatividad | Propiedad por la cual intercambiar el orden de operandos no altera el resultado. Concatenar listas no la cumple. |
| Overwrite | Mecanismo para reemplazar deliberadamente un campo reducido sin aplicar su combinación habitual. |
| MessagesState | Estado predefinido cuyo campo messages usa add_messages. |
| add_messages | Reducer de mensajes que incorpora nuevos elementos y reconoce identidades para actualizar mensajes existentes. |
| HumanMessage | Mensaje que representa una entrada de usuario dentro del protocolo de conversación. |
| AIMessage | Mensaje del modelo; puede contener texto, solicitudes de herramientas o ambos según la integración. |
| ToolMessage | Observación producida por una herramienta y vinculada a una solicitud mediante tool_call_id. |
| tool_calls | Solicitudes estructuradas del modelo con nombre, argumentos e identidad de llamada. |
| bind_tools | Configuración que describe herramientas al modelo; no ejecuta esas funciones ni concede permisos. |
| ToolNode | Nodo utilitario que despacha llamadas de herramientas y produce resultados para el protocolo. |
| tools_condition | Router del ciclo de herramientas que decide continuar en tools o terminar según los mensajes. |
| Context | Información y dependencias aportadas por la aplicación a una invocación, como el alcance autenticado. |
| Config | Opciones del runtime como identidad del thread, límite de superpasos y concurrencia. |
| thread_id | Identidad de continuidad de una ejecución o caso. No es una autorización. |
| Checkpointer | Componente que guarda estado y metadatos del recorrido para inspección y continuidad. |
| Checkpoint | Frontera persistida desde la cual el runtime puede inspeccionar o continuar trabajo. |
| StateSnapshot | Representación de estado persistido, configuración, nodos pendientes y metadatos. |
| Store | Almacén de datos de aplicación con alcance fuera de un único thread. |
| Namespace | Espacio de nombres que organiza claves o checkpoints; su existencia no sustituye permisos. |
| interrupt | Operación que suspende una ejecución y expone un payload para una decisión externa. |
| Command | Objeto con varios usos: actualizar/navegar desde un nodo o reanudar una interrupción, entre otros. |
| Reanudación | Continuación de trabajo pendiente. El nodo interrumpido puede reiniciar desde su comienzo. |
| Replay | Exploración de trabajo desde una configuración histórica. No revierte efectos externos. |
| Idempotencia | Contrato por el que repetir la misma intención no genera efectos de negocio duplicados. |
| Durabilidad | Protección que ofrece la estrategia y el backend de persistencia frente a fallos del proceso. |
| Send | Instrucción para programar un nodo con una entrada particular, útil en distribución dinámica. |
| Fan-out / fan-in | Distribución de trabajo en ramas y reunión posterior de sus contribuciones. |
| Subgrafo | Flujo reutilizable incorporado a otro con un contrato y una política de memoria definidos. |
| entrypoint / task | Decoradores de Functional API que definen entrada del workflow y unidades de trabajo. |
| Streaming | Entrega incremental de eventos o mensajes; observar progreso no implica confirmar un efecto. |
| RetryPolicy | Política acotada de reintentos para excepciones seleccionadas. |
| CachePolicy | Política de reutilización de resultados por equivalencia de entrada y vigencia. |
| GraphOutput v2 | Formato elegido por invoke(version="v2") en Graph API; expone value e interrupts. |
| Observabilidad | Capacidad de explicar una ejecución mediante trazas, eventos y métricas pertinentes. |
| Evaluación | Comparación de comportamiento sobre casos y criterios definidos; complementa las pruebas de lógica. |
| Fidelidad | Correspondencia entre afirmaciones de una respuesta y la evidencia que realmente las respalda. |
| Prompt injection | Contenido que intenta desviar instrucciones desde entradas o fuentes; el servicio conserva el control de permisos. |

[Volver al curso](README.md).
