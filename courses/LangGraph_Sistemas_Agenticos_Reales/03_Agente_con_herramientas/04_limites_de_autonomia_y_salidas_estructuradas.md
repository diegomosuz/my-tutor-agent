---
id: "m03_t04"
title: "Límites de autonomía y salidas estructuradas"
module: "Agente con herramientas"
module_order: 3
topic_order: 4
duration_minutes: 25
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópico 3.3 y nociones de modelos Pydantic."
objectives: ["Diferenciar controles operativos, validación de formato y fidelidad.", "Definir un contrato de salida sin confundirlo con evidencia verdadera."]
---

# 3.4. Límites de autonomía y salidas estructuradas

**Módulo 3: Agente con herramientas · Dedicación estimada: 25 minutos**

## Qué vas a poder hacer

- Diferenciar controles operativos, validación de formato y fidelidad.
- Definir un contrato de salida sin confundirlo con evidencia verdadera.

**Antes de empezar:** Tópico 3.3 y nociones de modelos Pydantic.

## Un control para cada riesgo

| Control | Dónde se aplica | Qué protege |
| --- | --- | --- |
| Número de llamadas | Nodo agent antes de invocar | Costo y ciclos sin progreso |
| recursion_limit | Configuración del runtime | Recorridos que exceden superpasos |
| Timeout y reintentos | Cliente y política del nodo | Fallos transitorios y esperas |
| Permisos de herramientas | Código del adaptador | Acceso y efectos autorizados |
| Evidencia y formato | Validación y evaluación | Calidad verificable de la salida |

Pensemos en lo que todavía podría salir mal. El modelo puede repetir una consulta, usar una herramienta innecesaria o producir una respuesta sin sustento. También puede haber fallos del proveedor, latencia alta o entradas maliciosas en documentos recuperados.

Cada problema tiene un control distinto. El contador limita llamadas a nivel aplicación. recursion_limit limita superpasos. Un timeout evita esperar indefinidamente una operación. Los permisos se verifican dentro de la herramienta. La evaluación comprueba que la salida tenga evidencia pertinente.

No sumemos reintentos en todas las capas sin calcular su efecto. Si el cliente reintenta, el nodo reintenta y el servicio vuelve a enviar la petición, los intentos pueden multiplicarse. Necesitamos saber qué capa es responsable de cada recuperación.

Tampoco usemos el prompt como autorización. Un documento recuperado puede contener instrucciones para ejecutar acciones o revelar datos. Ese documento es información a analizar, no una fuente de privilegios. El adaptador debe imponer el ámbito permitido incluso si el modelo pide otra cosa.

Respecto de la salida, hay dos preguntas. ¿Terminó el flujo? ¿La respuesta es aceptable? Un agente que termina sin tool_calls puede haber inventado una explicación. Por eso las pruebas de control y las evaluaciones de calidad son complementarias.

Finalmente, definamos una salida útil ante límites. Un mensaje de derivación y una traza con la causa permiten recuperar la interacción. Un error genérico sin estado ni observación dificulta saber qué ocurrió.

## Un esquema consumible por otros componentes

Una salida estructurada facilita que otros componentes consuman la respuesta. En vez de extraer campos de un párrafo libre, definimos un contrato con answer, evidence_ids y needs_human.

Este ejemplo es una llamada independiente posterior a disponer de evidencia. No sustituye la atención de tool_calls pendientes. Si quisiéramos integrarlo al grafo, agregaríamos un nodo de formato al finalizar el ciclo y guardaríamos la salida en un campo dedicado.

Pydantic valida forma y tipos. Eso no demuestra que un identificador exista ni que la fuente respalde el texto. Debemos comparar evidence_ids con las fuentes realmente recuperadas y evaluar la relación semántica entre evidencia y conclusión.

La integración y el modelo deben soportar el mecanismo de salida estructurada. Puede haber diferencias entre un esquema nativo del proveedor y una estrategia basada en herramientas. Revisamos esas capacidades al elegir el adaptador.

Agregar un nodo de formato cuesta otra llamada y puede ser innecesario cuando el mismo modelo ya devuelve el contrato requerido. Lo presentamos separado para que se entienda la responsabilidad. En producción buscaríamos la solución más simple que mantenga controles claros.

Si el esquema falla, distinguimos un error de formato de falta de evidencia. Corregir JSON no vuelve verdadera una afirmación. Esa separación evita reintentos que sólo mejoran la apariencia de una respuesta incorrecta.

```python
from pydantic import BaseModel, Field

class SupportAnswer(BaseModel):
    answer: str
    evidence_ids: list[str] = Field(default_factory=list)
    needs_human: bool

formatter = model.with_structured_output(SupportAnswer)
typed = formatter.invoke(
    f"Usá esta evidencia y respondé sobre VPN: {KB['vpn']}"
)
assert isinstance(typed, SupportAnswer)
```

### Lectura del código

Los números corresponden a las líneas del bloque, contando las líneas en blanco.

| Línea | Qué hace y por qué está aquí |
| --- | --- |
| 1 | Importamos el modelo de validación y la definición de campos. |
| 3 | Definimos el contrato de la respuesta estructurada. |
| 4 | answer contiene el texto que mostraremos. |
| 5 | evidence_ids es una lista con un valor inicial independiente por instancia. |
| 6 | needs_human explicita si la salida requiere intervención. |
| 8 | Creamos una variante del modelo que solicita y procesa el esquema indicado, si el proveedor lo soporta. |
| 9 | Invocamos esa variante en una demostración independiente del ciclo. |
| 10 | La cadena formateada inserta el contenido real de KB-01 desde KB, junto con la petición. Así el modelo recibe la evidencia y no sólo su identificador. |
| 11 | Cerramos la invocación. |
| 12 | Comprobamos el tipo devuelto por la integración. |

Este bloque presupone model y KB definidos. El archivo format_answer.py realiza esas importaciones y construye el cliente. Ejecutarlo hace una llamada real y requiere el entorno del proveedor; no forma parte de las pruebas locales sin credenciales.

[Archivo ejecutable: format_answer.py](../_laboratorio/format_answer.py)

## Tres niveles de validación

| Nivel | Pregunta | Ejemplo de fallo |
| --- | --- | --- |
| Sintaxis y tipos | ¿La salida satisface SupportAnswer? | needs_human no puede interpretarse como booleano |
| Referencia | ¿La fuente declarada fue recuperada? | Se cita KB-99, inexistente en el contexto |
| Fidelidad | ¿La fuente respalda la conclusión? | KB-01 recomienda revisar credenciales, pero se afirma que el servidor cayó |

El tercer nivel no se resuelve solo verificando pertenencia a una lista. Puede requerir reglas del dominio, revisión humana o evaluación con ejemplos anotados. En el proyecto didáctico se verifica la presencia de la única referencia conocida; el curso señala expresamente ese límite.

## Política ante falta de evidencia

Una salida bien formada con evidence_ids vacío puede ser válida si informa que no hay sustento y solicita intervención. Una salida con una referencia inventada es incorrecta aunque su JSON sea perfecto. El flujo debe decidir qué acciones están permitidas con cada resultado.

## Actividad

Diseñá una validación de referencias que rechace identificadores no presentes en las fuentes recuperadas. Indicá qué propiedad prueba y cuál queda fuera. Solución: comparar el conjunto de ids declarados con el conjunto permitido detecta referencias desconocidas; no demuestra que el texto sea fiel a ellas.

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Una temperatura igual a cero garantiza la misma respuesta en todas las ejecuciones?

### Respuesta razonada

No debe tratarse como una garantía de determinismo extremo a extremo. La infraestructura, el modelo y la integración pueden introducir variaciones. Las pruebas de lógica usan dobles determinísticos; las evaluaciones del proveedor miden comportamiento sobre casos representativos.

## Documentación para profundizar

- [Salidas estructuradas](https://docs.langchain.com/oss/python/langchain/structured-output)
- [Integración ChatOpenAI](https://docs.langchain.com/oss/python/integrations/chat/openai)
- [Herramientas](https://docs.langchain.com/oss/python/langchain/tools)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../03_Agente_con_herramientas/03_implementacion_de_un_agente_con_presupuesto.md) · [Siguiente](../03_Agente_con_herramientas/05_practica_evidencia_trazas_y_condiciones_de_salida.md)
