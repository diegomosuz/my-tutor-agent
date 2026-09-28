---
id: "m01_t05"
title: "Caso conductor: asistente de soporte"
module: "Fundamentos"
module_order: 1
topic_order: 5
duration_minutes: 15
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópicos 1.1 a 1.4."
objectives: ["Traducir un caso de uso en contratos y criterios observables.", "Separar propuesta, aprobación y acción."]
---

# 1.5. Caso conductor: asistente de soporte

**Módulo 1: Fundamentos · Dedicación estimada: 15 minutos**

## Qué vas a poder hacer

- Traducir un caso de uso en contratos y criterios observables.
- Separar propuesta, aprobación y acción.

**Antes de empezar:** Tópicos 1.1 a 1.4.

## Situación y alcance

Nuestro caso será un asistente de soporte para una organización ficticia. Recibe una consulta sobre un incidente, busca información disponible y produce una propuesta de respuesta. Si no encuentra evidencia suficiente, debe reconocerlo y derivar.

Empezaremos con una regla artificial muy sencilla: detectar la palabra caído para elegir una prioridad. Es una regla didáctica, no una política real de soporte. Nos permite comprobar las rutas sin depender de un modelo. Después incorporaremos una herramienta que consulta una base de conocimiento pequeña almacenada en un diccionario de Python.

La herramienta devolverá texto y una referencia a la evidencia. En producción ese adaptador podría consultar PostgreSQL, un buscador o un sistema documental. El grafo no necesita cambiar si mantenemos un contrato estable. Esa separación facilita sustituir una fuente local por una integración real.

La salida del agente será una propuesta. Antes de simular una acción externa, una persona podrá aprobarla o rechazarla. Mantendremos esa aprobación fuera de la decisión libre del modelo. La aplicación deberá verificar la identidad y los permisos de quien reanuda la ejecución.

El criterio de éxito tampoco será solamente que el texto suene bien. Queremos comprobar que la herramienta se utilizó cuando hacía falta, que la evidencia corresponde a la pregunta, que existe una salida ante ausencia de información y que una propuesta rechazada no produce una acción.

Este caso es deliberadamente pequeño. Nos deja ver los mecanismos sin sumar una base vectorial, varios agentes o una cola desde el primer minuto. Cuando aparezca una necesidad concreta, discutiremos qué componente la resuelve y cuál es su costo operativo.

## Requerimientos del curso

| ID | Requerimiento | Evidencia de cumplimiento |
| --- | --- | --- |
| R1 | Clasificar una entrada con una regla conocida | Las rutas normal y high son reproducibles |
| R2 | Consultar evidencia mediante una herramienta | La traza contiene llamada y ToolMessage relacionados |
| R3 | Reconocer falta de información | Se deriva sin inventar una solución |
| R4 | Acotar las llamadas | calls no supera el límite de aplicación |
| R5 | Revisar una propuesta | Hay interrupción y una decisión validada |
| R6 | Sobrevivir al cierre del proceso | Un proceso nuevo reanuda el mismo thread |
| R7 | Evitar una acción rechazada | Rechazar no ejecuta el adaptador de efectos |

## Datos y fronteras

El texto de entrada pertenece al usuario. La base de conocimiento es una fuente de datos. El borrador pertenece a la ejecución. La decisión de aprobación proviene de una persona autorizada. Una futura acción de negocio pertenece a un adaptador que debe tener permisos e idempotencia.

La base local solo contiene una referencia VPN. Buscar por subcadena es una decisión didáctica, no un buscador semántico. Más adelante podrías sustituir esa función por SQL parametrizado o recuperación documental conservando el contrato de herramienta. Primero verificá que la base sencilla permite observar todas las transiciones.

## Lo que cuenta como un resultado correcto

«La VPN funciona» no es una respuesta aceptable si el sistema solo consultó una guía general. La evidencia «verificar red y credenciales» permite recomendar esa comprobación, pero no afirmar que el servicio está operativo. El contenido de una fuente limita las conclusiones que se pueden sostener.

En el proyecto final, el estado SIMULADO significa que se recorrió la ruta de aprobación. No significa que se envió un correo o se modificó un ticket real. Esa distinción permite aprender control de efectos sin mezclarlo con credenciales o integraciones ajenas al objetivo del curso.

## Actividad

Agregá un requerimiento: «si falta el número de ticket, pedirlo antes de continuar». Decidí si debe resolverlo una regla o un modelo y qué campo se agrega al estado. Propuesta de referencia: validar la presencia mediante código; usar una salida explícita de aclaración; continuar solo cuando la entrada satisfaga el contrato.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Por qué usar el mismo caso en los seis módulos?

### Respuesta razonada

Permite observar qué problema resuelve cada capacidad adicional. La evolución del mismo flujo hace visible el costo de agregar persistencia, paralelismo o autonomía, y evita aprender APIs desconectadas de una necesidad.

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../01_Fundamentos/04_superpasos_concurrencia_y_finalizacion.md) · [Siguiente](../01_Fundamentos/06_practica_justificar_una_arquitectura_simple.md)
