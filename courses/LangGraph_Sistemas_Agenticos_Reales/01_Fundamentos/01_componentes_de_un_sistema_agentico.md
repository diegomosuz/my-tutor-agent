---
id: "m01_t01"
title: "Componentes de un sistema agéntico"
module: "Fundamentos"
module_order: 1
topic_order: 1
duration_minutes: 10
level: "intermedio-avanzado"
language: "es"
prerequisites: "Python básico: funciones, diccionarios y manejo de errores."
objectives: ["Separar las responsabilidades del modelo, las herramientas y el orquestador.", "Explicar por qué una llamada propuesta todavía no es una acción ejecutada."]
---

# 1.1. Componentes de un sistema agéntico

**Módulo 1: Fundamentos · Dedicación estimada: 10 minutos**

## Qué vas a poder hacer

- Separar las responsabilidades del modelo, las herramientas y el orquestador.
- Explicar por qué una llamada propuesta todavía no es una acción ejecutada.

**Antes de empezar:** Python básico: funciones, diccionarios y manejo de errores.

## El problema que resolvemos

Una aplicación de soporte recibe «no puedo entrar a la VPN». Para responder puede necesitar interpretar la consulta, buscar una guía, observar el estado del servicio y decidir si debe intervenir una persona. Esas responsabilidades son diferentes. Si se concentran en un prompt muy largo, quedan ocultas decisiones que deberían poder probarse.

| Componente | Responsabilidad | Ejemplo del caso |
| --- | --- | --- |
| Modelo de lenguaje | Propone texto o llamadas estructuradas | Solicitar una consulta sobre VPN |
| Herramienta | Ejecuta código con un contrato | Buscar un artículo de soporte |
| Estado | Conserva información de la ejecución | Mensajes, evidencia e intentos |
| Orquestador | Decide y ejecuta transiciones | Repetir, responder o pedir revisión |

Un modelo de lenguaje recibe un contexto y produce una salida. Esa salida puede ser texto o una solicitud estructurada de llamada a una herramienta, si la integración soporta esa capacidad. La solicitud contiene, entre otras cosas, un nombre y argumentos. El modelo propone esa llamada. La ejecución ocurre en nuestra aplicación.

Una herramienta es una capacidad expuesta mediante un contrato. Puede buscar un documento, consultar un estado o realizar una modificación. Su implementación valida entradas, aplica permisos y trata errores. El hecho de que un argumento provenga del modelo no lo convierte en confiable. Si un identificador corresponde a otro cliente, la herramienta debe rechazarlo aunque el modelo lo haya propuesto con mucha seguridad.

El estado representa la información que la ejecución necesita conservar: mensajes, resultados, decisiones y contadores. No todo debe entrar al prompt. Podemos conservar evidencia en el estado y seleccionar solamente un fragmento relevante para la siguiente llamada al modelo.

El orquestador conecta los pasos. Decide cuándo llamar al modelo, cuándo ejecutar una herramienta, cuándo terminar y cuándo esperar intervención. Parte de esas decisiones puede estar codificada y otra parte puede depender de una propuesta del modelo. LangGraph nos permite expresar esa combinación de forma explícita.

Observá la separación entre responsabilidad semántica y responsabilidad operativa. El modelo interpreta el problema. Nuestro código controla qué se puede ejecutar. Si el modelo propone una herramienta inexistente, el sistema no debería inventar su implementación. Si una herramienta falla, el resultado debe convertirse en una señal que el flujo pueda tratar. Esa frontera será visible en todos los laboratorios.

## Del texto al comportamiento

El modelo puede devolver una solicitud equivalente a «ejecutar lookup con query igual a vpn». Esa salida es un dato estructurado. La aplicación debe reconocer el nombre, validar sus argumentos y llamar a una implementación que exista. El resultado vuelve a incorporarse como observación para una decisión posterior.

Esto crea un ciclo de percepción, decisión y acción. La percepción es el contexto disponible; la decisión es una propuesta condicionada por ese contexto; la acción es una operación ejecutada por código. La autonomía aparece cuando el recorrido concreto depende de decisiones del modelo, y siempre ocurre dentro de las capacidades que el desarrollador expuso.

**Determinismo y calidad son propiedades diferentes.** Una regla exacta puede ejecutarse siempre igual y ser una mala regla de negocio. Un modelo puede variar entre ejecuciones y producir respuestas útiles. El objetivo es elegir dónde tolerar variación y dónde exigir invariantes: nunca consultar otro tenant, no ejecutar una acción rechazada, terminar al agotar el presupuesto.

## Actividad: clasificar responsabilidades

Asigná cada responsabilidad a su dueño: redactar un resumen; comprobar el permiso sobre un ticket; guardar el borrador; ejecutar la próxima etapa; limitar a tres llamadas al modelo. Después explicá qué error ocurriría si la autorización dependiera solamente del prompt.

### Devolución

La redacción corresponde al modelo. El permiso corresponde al servicio o al adaptador que accede al recurso. El borrador forma parte del estado. La siguiente etapa pertenece al orquestador. El presupuesto se impone en código antes de llamar al modelo. Un prompt puede orientar una propuesta, pero no constituye una identidad autenticada ni una autorización verificable.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Todos los nodos de un sistema agéntico deben llamar a un modelo?

### Respuesta razonada

No. Un nodo puede validar una entrada, transformar datos o consultar una fuente mediante código ordinario. Reservar el modelo para decisiones que lo necesitan reduce costo, latencia y variabilidad sin perder funcionalidad.

## Documentación para profundizar

- [Descripción de LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)
- [Herramientas](https://docs.langchain.com/oss/python/langchain/tools)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Siguiente](../01_Fundamentos/02_workflows_agentes_y_eleccion_del_framework.md)
