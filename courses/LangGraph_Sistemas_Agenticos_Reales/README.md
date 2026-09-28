# LangGraph: desarrollo de sistemas agénticos reales

Curso técnico en español · 6 módulos · 36 tópicos · Python · Fundamentos a nivel intermedio y avanzado.

## Competencia general

Diseñar, implementar, probar y explicar sistemas agénticos con LangGraph que tengan estado explícito, herramientas acotadas, condiciones de salida y una estrategia de recuperación. El principio de diseño es mantener la solución simple y justificar cada capacidad con un comportamiento verificable.

## Para quién está preparado

Para desarrolladores y arquitectos que conocen Python, funciones, diccionarios, anotaciones de tipos y excepciones. No requiere experiencia previa con frameworks agénticos. Las primeras unidades construyen el modelo conceptual antes de introducir las APIs.

## Recorrido

| Módulo | Enfoque | Dedicación autónoma |
| --- | --- | --- |
| [1. Fundamentos](01_Fundamentos/00_inicio_del_modulo.md) | Distinguir modelo, herramienta, workflow y agente. | 80 min |
| [2. Graph API](02_Graph_API/00_inicio_del_modulo.md) | Construir, compilar e invocar un grafo. | 125 min |
| [3. Agente con herramientas](03_Agente_con_herramientas/00_inicio_del_modulo.md) | Implementar el protocolo de tool calling. | 150 min |
| [4. Persistencia y aprobación](04_Persistencia_y_aprobacion/00_inicio_del_modulo.md) | Separar checkpoint, memoria y datos de negocio. | 155 min |
| [5. Orquestación avanzada](05_Orquestacion_avanzada/00_inicio_del_modulo.md) | Combinar ramas con reducers y barreras. | 140 min |
| [6. Operación y proyecto final](06_Operacion_y_proyecto_final/00_inicio_del_modulo.md) | Observar, probar y evaluar comportamiento. | 180 min |

La dedicación sugerida suma **830 minutos (13 h 50 min)**. Incluye lectura, predicción, ejecución y actividades. Es una estimación pedagógica; la experiencia previa y las extensiones pueden cambiarla. Esta es la ampliación para estudio autónomo de la clase guiada original de cuatro horas, no una transcripción de diapositivas. La guía de publicación incluye una ruta compacta de 240 minutos.

## Cómo aprender con el material

1. Leé qué vas a poder hacer y verificá los prerrequisitos.
2. Dibujá o predecí una ejecución antes de copiar código.
3. Estudiá el ejemplo y su explicación técnica.
4. Ejecutá el archivo del laboratorio indicado.
5. Resolvé la actividad antes de mirar la respuesta razonada.
6. Guardá evidencia de resultados y límites del diseño.

El caso conductor es un asistente de soporte. Evoluciona desde una clasificación determinística hacia herramientas, persistencia, revisión humana y un proyecto integrado. Los ejemplos locales simulan el modelo y los efectos externos. Las variantes con proveedor están identificadas y requieren credenciales propias.

## Empezar

Abrí el [módulo de fundamentos](01_Fundamentos/00_inicio_del_modulo.md). Para preparar el entorno, consultá el [primer tópico de Graph API](02_Graph_API/01_entorno_reproducible_y_primer_recorrido.md) y el [laboratorio](_laboratorio/README.md). No es necesario instalar un modelo local, una base vectorial ni Docker para las prácticas obligatorias.

## Recursos de apoyo

- [Glosario](GLOSARIO.md): términos y relaciones fundamentales.
- [Referencias oficiales](REFERENCIAS.md): documentación organizada por capacidad.
- [Guía de publicación](GUIA_DE_PUBLICACION.md): organización, metadatos y recursos.
- [Validación del material](VALIDACION.md): alcance de las comprobaciones realizadas.
- [Laboratorio ejecutable](_laboratorio/README.md): archivos, comandos y resultados.

## Convenciones técnicas

Los ejemplos Graph API usan LangGraph 1.2.11 y seleccionan explícitamente GraphOutput v2 cuando corresponde. Streaming usa stream/astream con formato v2. El paquete instalado y la versión del formato de respuesta son conceptos diferentes. Functional API y la variante create_agent explicitan sus propios contratos de salida.

Las APIs de herramientas y proveedores cambian con el tiempo. El curso fija una base verificable; consultá la documentación y repetí las pruebas antes de actualizar. No se afirma que un simulador mida la calidad de un modelo real.
