---
id: "m01_t06"
title: "Práctica: justificar una arquitectura simple"
module: "Fundamentos"
module_order: 1
topic_order: 6
duration_minutes: 15
level: "intermedio-avanzado"
language: "es"
prerequisites: "Módulo 1 completo."
objectives: ["Proponer una arquitectura mínima por caso.", "Defender una ampliación con una necesidad funcional o una medición."]
---

# 1.6. Práctica: justificar una arquitectura simple

**Módulo 1: Fundamentos · Dedicación estimada: 15 minutos**

## Qué vas a poder hacer

- Proponer una arquitectura mínima por caso.
- Defender una ampliación con una necesidad funcional o una medición.

**Antes de empezar:** Módulo 1 completo.

## Consigna

Prepará una tabla con cuatro columnas: requerimiento, diseño inicial, dato que debe conservarse y responsable de la decisión. Resolvé estos casos:

1. Validar un código contra un catálogo exacto.
2. Buscar en dos fuentes conocidas y redactar una respuesta.
3. Elegir herramientas según una consulta abierta.
4. Preparar una acción y esperar una aprobación que puede llegar mañana.

Dedicá cinco minutos a una solución individual y cinco a cuestionar tus propias decisiones. Usá los últimos cinco para revisar la respuesta de referencia. No hace falta programar: la evidencia es una justificación precisa.

## Solución comentada

| Caso | Solución inicial | Condición que justificaría ampliarla |
| --- | --- | --- |
| A. Catálogo exacto | Función Python | Un flujo de revisión o recuperación complejo |
| B. Dos fuentes conocidas | Workflow explícito | Selección variable de fuentes o pasos |
| C. Herramientas variables | Ciclo de agente acotado | Responsabilidades especializadas verificables |
| D. Aprobación diferida | Grafo con persistencia e interrupt | Mayor concurrencia y necesidades operativas |

Para A, una función con validación y una prueba puede resolver el problema. Para B, un workflow consulta las fuentes conocidas y luego redacta. Si esas consultas son independientes, podemos paralelizarlas. No hace falta que el modelo invente el plan cuando el plan ya está establecido.

En C aparece una justificación clara para un agente: el modelo elige herramientas a partir del contenido de la consulta y de los resultados que obtiene. Eso exige definir un presupuesto y una salida ante falta de evidencia.

En D necesitamos representar una ejecución que queda pendiente. Un grafo con persistencia e interrupciones permite conservar el estado y continuar después. La aprobación es un dato externo que el sistema debe autenticar, no una afirmación del modelo.

Estas respuestas son un punto de partida. Si una función comienza a acumular estados, reintentos, esperas y rutas difíciles de seguir, el costo de formalizar un workflow puede estar justificado. Si un agente produce decisiones erráticas sobre una regla exacta, podemos devolver esa parte al código.

Conservemos una pregunta durante el resto de la clase: ¿qué capacidad necesito ahora y cuál puedo postergar? El dominio de un framework se observa tanto al utilizar una funcionalidad como al reconocer cuándo no aporta valor. Con esa idea pasamos a la implementación del primer grafo.

## Desarrollo del caso de aprobación

El requisito «mañana» cambia la arquitectura. Una variable en memoria no alcanza si el proceso se reinicia. Necesitás una identidad de ejecución, un estado persistido, una representación de la pausa y una operación de reanudación. El servicio debe verificar quién puede aprobar y sobre qué borrador.

No necesitás varios agentes para cumplir ese requisito. Una propuesta generada por una función, un nodo de revisión y un adaptador final pueden bastar. Tampoco una cola es automáticamente necesaria: aparece si la duración del trabajo o la carga exigen separar su ejecución de la solicitud HTTP.

## Criterios de corrección

| Criterio | Logrado | Falta trabajar |
| --- | --- | --- |
| Responsabilidad | Cada decisión tiene un dueño | Se atribuye todo al modelo |
| Estado | Se indica qué debe sobrevivir | Se depende de variables globales |
| Simplicidad | Cada pieza tiene una razón | Se agregan agentes por cantidad de tareas |
| Límites | Hay salida ante falta de información | Se presupone éxito infinito |
| Recuperación | Se distingue RAM de almacenamiento | Se supone que pausar equivale a persistir |

## Errores habituales

- Elegir LangGraph porque el problema menciona IA, sin necesitar control de flujo.
- Pedirle al modelo que aplique una regla contractual exacta sin validación posterior.
- Tratar al agente como un proceso sin límite porque puede «seguir intentando».
- Confundir guardar una conversación con controlar los efectos de una operación.

## Desafío opcional

Tomá el caso de dos fuentes y agregá que una no siempre está disponible. Definí cuándo reintentar, cuándo responder con evidencia parcial y cuándo derivar. La mejora debe expresarse como una política que pueda probarse. «Que el agente lo resuelva» todavía no es una política.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Cuándo termina esta actividad?

### Respuesta razonada

Cuando podés explicar una elección, un límite y un dato persistente por cada caso. El objetivo no es dibujar la arquitectura más grande, sino demostrar que cada componente cubre un comportamiento requerido.

## Documentación para profundizar

- [Workflows y agentes](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [Descripción de LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../01_Fundamentos/05_caso_conductor_asistente_de_soporte.md) · [Siguiente](../02_Graph_API/01_entorno_reproducible_y_primer_recorrido.md)
