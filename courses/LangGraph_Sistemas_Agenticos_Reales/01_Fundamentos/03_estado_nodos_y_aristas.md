---
id: "m01_t03"
title: "Estado, nodos y aristas"
module: "Fundamentos"
module_order: 1
topic_order: 3
duration_minutes: 15
level: "intermedio-avanzado"
language: "es"
prerequisites: "Tópicos 1.1 y 1.2."
objectives: ["Recorrer un grafo indicando lecturas, escrituras y transiciones.", "Distinguir estado acumulado de actualización parcial."]
---

# 1.3. Estado, nodos y aristas

**Módulo 1: Fundamentos · Dedicación estimada: 15 minutos**

## Qué vas a poder hacer

- Recorrer un grafo indicando lecturas, escrituras y transiciones.
- Distinguir estado acumulado de actualización parcial.

**Antes de empezar:** Tópicos 1.1 y 1.2.

## Un contrato compartido

![Flujo que clasifica una consulta y elige responder o escalar.](../_recursos/flujo_basico.png)

La condición selecciona una sola ruta. START y END son marcadores; classify, answer y escalate son funciones registradas.

[Diagrama editable en Mermaid](../_recursos/flujo_basico.mmd).

El estado es el contrato de intercambio. Imaginemos que contiene el texto original, la prioridad y la respuesta. Clasificar puede devolver solamente la prioridad. No necesita reconstruir todo el diccionario. El runtime incorpora esa actualización según la regla de combinación asociada a cada campo.

Un nodo es una función que realiza trabajo. Puede contener una regla, una consulta a base de datos o una llamada al modelo. Un nodo tampoco equivale necesariamente a un agente. Es una unidad de ejecución que elegimos para delimitar responsabilidades y puntos de recuperación.

Las aristas determinan qué trabajo se habilita después. Una arista fija conecta dos nodos. Una arista condicional usa una función de enrutamiento que mira el estado y elige uno o varios destinos. START y END son marcadores del grafo, no funciones de negocio que debamos implementar.

Sigamos una ejecución con el texto servicio caído. El estado entra con ese texto. Clasificar devuelve prioridad alta. El enrutador lee esa prioridad y selecciona escalar. Escalar devuelve un mensaje que indica derivación. En cada paso debemos poder señalar qué campo se leyó y qué campo cambió.

Esta forma de pensar evita ocultar el estado en variables globales. Si un paso depende de un dato, ese dato debe estar en el contrato apropiado o llegar mediante una dependencia explícita. Cuando dibujes un flujo, acompañá cada nodo con sus lecturas y escrituras.

## Seguir los datos paso a paso

| Momento | Estado relevante | Actualización del nodo |
| --- | --- | --- |
| Entrada | text = Servicio caído | Aún no hay prioridad |
| Después de classify | text y priority = high | Solo priority |
| Después de escalate | text, priority y reply | Solo reply |
| Final | Los valores acumulados | No se ejecutan más nodos |

El nodo devuelve una propuesta de modificación del estado. El runtime decide cómo aplicarla según el canal y su reducer. Este modelo evita que la lógica dependa del orden accidental en que se mutan diccionarios compartidos. Una actualización que no menciona text deja ese campo intacto.

**No confundas estado con prompt.** El estado puede incluir contadores, evidencia, decisiones humanas y referencias de auditoría que el modelo no necesita leer. El prompt es una proyección de esa información preparada para una llamada específica. Tener un dato en el estado no exige enviarlo al proveedor.

## Elegir el tamaño de un nodo

Un nodo demasiado grande mezcla validación, consulta, decisión y efectos. Eso complica la recuperación porque el trabajo anterior a un fallo puede repetirse. Fragmentar cada línea en un nodo también dificulta comprender el flujo. Una frontera útil agrupa una responsabilidad coherente y produce una actualización que vale la pena inspeccionar o recuperar.

Una función de normalización pequeña puede permanecer dentro de un nodo. Una operación externa cuyo resultado debe persistirse suele merecer una frontera explícita. La decisión depende del costo de repetición y del contrato de negocio, no de un número fijo de líneas.

## Actividad

Para un nodo que consulta un catálogo, escribí: campos que lee, campos que devuelve, posibles errores y destinos posteriores. Una respuesta adecuada podría leer query, devolver evidence y confidence de recuperación, y enviar el flujo a redactar o derivar. No hace falta agregar confidence si no existe una forma concreta de calcularla.

## Comprobación de comprensión

**Antes de mirar la respuesta:** Si classify devuelve solo priority, ¿desaparece text?

### Respuesta razonada

No. El retorno es una actualización parcial. El runtime conserva los campos no actualizados. En cambio, reemplazar manualmente todo el estado fuera del contrato puede perder información o duplicar acumulados.

## Documentación para profundizar

- [Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../01_Fundamentos/02_workflows_agentes_y_eleccion_del_framework.md) · [Siguiente](../01_Fundamentos/04_superpasos_concurrencia_y_finalizacion.md)
