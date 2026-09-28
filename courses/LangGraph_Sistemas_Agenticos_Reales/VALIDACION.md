# Validación y alcance del material

## Base verificada

- Python 3.11.16 en Linux para la suite de ejecución.
- LangGraph 1.2.11, langchain-core 1.6.3, langchain-openai 1.6.2, langgraph-checkpoint-sqlite 3.1.1, langchain 1.4.2 y Pydantic 2.13.5.
- 26 pruebas automatizadas completadas correctamente con unittest.
- Los 45 bloques Python de los tópicos y los 23 archivos Python del laboratorio superan la comprobación de sintaxis compatible con Python 3.11.
- Los nueve diagramas fueron revisados visualmente; se entregan en PNG, SVG y Mermaid.

requirements-lock.txt registra la resolución de dependencias del entorno Python 3.11 utilizado. Las instrucciones de PowerShell están preparadas para Windows; la suite se ejecutó en Linux. El material usa sintaxis compatible con Python 3.11 y 3.12, sin presentar esa compatibilidad como una prueba en todos los sistemas operativos.

## Comportamientos comprobados

| Área | Comprobación |
| --- | --- |
| Graph API | Clasificación normal, alta y entrada vacía |
| Mensajes | Actualización por identidad y relación tool_call_id |
| Agente | Ciclo completo, evidencia ausente y presupuesto previo a la llamada |
| Terminación | Solicitudes repetidas de herramientas se detienen al alcanzar el límite |
| Revisión | Aprobación, rechazo y tipo inválido de decisión |
| Identidad | Dos threads conservan estados y decisiones independientes |
| Persistencia | Inicio y reanudación en procesos separados sobre SQLite |
| Paralelismo | Barrera de dos ramas y contribuciones acumuladas |
| Send | Lista vacía, duplicados y fuentes variables |
| Composición | Command, subgrafos y Functional API |
| Operación | Contexto, reintento, caché y streaming sync/async |
| Proyecto | Aprobación, rechazo, derivación, límite y recuperación desde disco |

Las pruebas están en _laboratorio/test_course.py. Los ejemplos que imprimen resultados se ejecutan en procesos aislados cuando corresponde. Las bases temporales de las pruebas no se distribuyen dentro del curso.

## Límites de la verificación

No se realizaron llamadas a un proveedor LLM para medir calidad de respuestas. Las variantes support_live.py, format_answer.py y standard_agent.py requieren credenciales y capacidades del modelo elegido. El simulador conserva la forma del protocolo, pero no evalúa razonamiento, selección abierta de herramientas o fidelidad de un modelo real.

El laboratorio no implementa una API autenticada, un adaptador externo con efectos reales ni una infraestructura PostgreSQL de producción. Esas responsabilidades se desarrollan como criterios de diseño y siguientes pasos. SIMULADO comprueba una transición; no certifica una operación de negocio.

## Integridad editorial y publicación

El paquete contiene seis módulos y 36 tópicos con objetivos, prerrequisitos, desarrollo técnico y comprobación de comprensión. Los índices enlazan todos los tópicos; los vínculos a imágenes, código y navegación fueron comprobados. El manifiesto curso.json conserva el orden y permite una importación adaptada a la herramienta de cursos.

[Volver al curso](README.md).
