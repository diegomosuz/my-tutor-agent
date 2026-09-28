# Laboratorio del curso

Todos los archivos de esta carpeta deben permanecer juntos porque los ejemplos reutilizan módulos mediante imports. Ejecutá los comandos desde esta carpeta. No hace falta instalar una base de datos externa para las prácticas obligatorias.

## Preparar Python

En PowerShell, con Python 3.11 instalado:

```powershell
py -3.11 -m venv .venv
$cursoPython = ".\.venv\Scripts\python.exe"
& $cursoPython -m pip install -r requirements.txt
& $cursoPython triage.py
& $cursoPython -m unittest -v test_course.py
```

Podés usar Python 3.12 cambiando el selector de creación del entorno. En macOS o Linux, usá python3 -m venv .venv y sustituí el comando de Python por .venv/bin/python. No se necesita activar el entorno si se invoca explícitamente su ejecutable.

requirements.txt fija las dependencias directas. requirements-lock.txt registra la resolución completa usada con Python 3.11 para las comprobaciones del curso. Para reproducir esa resolución instalá requirements-lock.txt en un entorno limpio. Los paquetes binarios se instalan para el sistema operativo correspondiente.

## Archivos

| Archivo | Propósito |
| --- | --- |
| [triage.py](triage.py) | Primer grafo, clasificación y rutas. |
| [triage_validado.py](triage_validado.py) | Solución con ruta para entrada vacía. |
| [contexto.py](contexto.py) | Inyección de tenant_id mediante Runtime. |
| [support.py](support.py) | Agente local, herramienta y simulador del protocolo. |
| [support_live.py](support_live.py) | Variante opcional que llama al proveedor. |
| [format_answer.py](format_answer.py) | Salida estructurada opcional con proveedor. |
| [standard_agent.py](standard_agent.py) | Variante create_agent con proveedor. |
| [review_graph.py](review_graph.py) | Definición importable de revisión y finalización. |
| [review_memory.py](review_memory.py) | Aprobar una revisión dentro del proceso. |
| [start_review.py](start_review.py) | Iniciar una pausa con SQLite. |
| [resume_review.py](resume_review.py) | Reanudar la pausa desde otro proceso. |
| [store_history.py](store_history.py) | Memoria compartida en RAM e inspección de snapshots. |
| [parallel.py](parallel.py) | Dos ramas estáticas con barrera. |
| [fanout.py](fanout.py) | Distribución dinámica con Send. |
| [command_flow.py](command_flow.py) | Actualizar y navegar con Command. |
| [subgraph.py](subgraph.py) | Adaptador entre contratos de padre e hijo. |
| [functional.py](functional.py) | entrypoint y task. |
| [retry_demo.py](retry_demo.py) | Reintento de un fallo transitorio simulado. |
| [cache_demo.py](cache_demo.py) | Reutilización de un cálculo mediante caché. |
| [stream_demo.py](stream_demo.py) | Eventos v2 síncronos y asíncronos. |
| [project.py](project.py) | Proyecto integrado con revisión y derivación. |
| [project_disk.py](project_disk.py) | Proyecto integrado persistido en SQLite. |
| [test_course.py](test_course.py) | 26 pruebas automatizadas sin proveedor. |

## Probar recuperación real

```powershell
& $cursoPython start_review.py --thread demo-1
& $cursoPython resume_review.py --thread demo-1 --decision rechazar
```

La primera ejecución termina después de guardar el borrador. La segunda inicia otro proceso y debe imprimir RECHAZADO. Usá un thread nuevo al iniciar cada caso. La base checkpoints.sqlite se crea en el directorio de trabajo; ambos procesos deben apuntar al mismo archivo.

## Proyecto integrado

```powershell
& $cursoPython project_disk.py start --thread proyecto-1 --question "Ayuda con VPN"
& $cursoPython project_disk.py resume --thread proyecto-1 --decision aprobar
& $cursoPython project_disk.py start --thread proyecto-2 --question "Impresora"
```

El primer caso pasa por PENDIENTE y SIMULADO. El segundo produce DERIVADO sin aprobación. SIMULADO representa control de flujo; no se envían mensajes ni se actualizan sistemas externos.

## Variantes con modelo real

support_live.py, format_answer.py y standard_agent.py requieren OPENAI_API_KEY y MODEL_NAME configurados en el entorno. No contienen credenciales y no se ejecutan al correr la suite de pruebas. Su uso realiza solicitudes reales al proveedor. Elegí un modelo accesible que soporte las capacidades correspondientes.

En support_live.py, configured_model crea el adaptador. Si usás un gateway corporativo, verificá URL, autenticación y compatibilidad de herramientas, parámetros y salida estructurada. No se presupone que cualquier endpoint compatible implemente todas esas capacidades.

## Alcance de la validación

La suite comprueba lógica, mensajes, presupuesto, aprobación, aislamiento, persistencia, ramas, subgrafos y proyecto. No mide calidad del proveedor, carga productiva ni permisos de una API que todavía no forma parte del laboratorio. El simulador implementa un guion del protocolo y no debe presentarse como un modelo de lenguaje.

[Volver al curso](../README.md).
