# Guía de publicación del curso

## Organización del paquete

La carpeta raíz se llama LangGraph_Sistemas_Agenticos_Reales. Contiene seis carpetas numeradas con los nombres de los módulos. Dentro de cada una hay un índice 00_inicio_del_modulo.md y seis archivos de tópicos. Los prefijos numéricos fijan el orden incluso si la plataforma ordena por nombre.

Las carpetas _laboratorio y _recursos contienen materiales adjuntos, no módulos adicionales. Los documentos de la raíz son recursos generales. El archivo curso.json describe el orden, competencias, duración, identificadores y rutas; es un manifiesto de contenido para facilitar la carga, no una API ni un estándar SCORM.

## Pasos para cargar el material

1. Creá un curso con el título «LangGraph: desarrollo de sistemas agénticos reales».
2. Creá los seis módulos respetando los nombres y el orden de curso.json.
3. Cargá cada archivo de tópico como una unidad o lección. Usá su primer encabezado como título si la herramienta no lee metadatos.
4. Cargá las imágenes de _recursos y conservá sus rutas relativas o reescribí los enlaces a las URLs que la plataforma les asigne.
5. Publicá _laboratorio como un recurso descargable manteniendo todos sus archivos juntos. Sus imports suponen que están en la misma carpeta.
6. Revisá en vista de estudiante un tópico con código, uno con tabla y uno con diagrama.
7. Configurá la secuencia de avance. Cada tópico contiene prerrequisitos, actividad y respuesta razonada.

El paquete está preparado para importación de contenido Markdown. No afirma compatibilidad de importación automática con una herramienta específica que no fue indicada. Las plataformas que aceptan solo HTML requieren conversión o pegado de contenido; en ese caso se deben conservar bloques de código, tablas, imágenes y enlaces.

## Metadatos de los tópicos

Cada tópico empieza con un bloque YAML delimitado por tres guiones. Usa valores compatibles con JSON dentro de YAML. Sus campos incluyen id, title, module, module_order, topic_order, duration_minutes, level, language, prerequisites y objectives.

Si la plataforma interpreta front matter, mapeá esos campos a su catálogo. Si los muestra como texto, retirá únicamente el bloque inicial. El mismo título, objetivos y prerrequisitos aparecen en el cuerpo para que el estudiante no dependa de los metadatos.

Los identificadores como m03_t02 son estables para navegación. No renombres un tópico cambiando su ID si ya existen referencias de progreso. source_slides en curso.json permite rastrear su relación con la presentación original; no es necesario mostrarlo al estudiante.

## Markdown y recursos

| Recurso | Formato entregado | Uso |
| --- | --- | --- |
| Desarrollo | Markdown UTF-8 | Contenido de cada lección |
| Código | Bloques con lenguaje y archivos .py | Lectura y ejecución local |
| Tablas | GitHub Flavored Markdown | Comparaciones y criterios |
| Diagramas | PNG y SVG | Visualización sin servicios externos |
| Fuente de diagramas | Mermaid .mmd | Edición o renderizado nativo |
| Navegación | Enlaces relativos | Índice, anterior y siguiente |

Los tópicos incluyen el PNG como imagen estándar y un enlace a su fuente Mermaid. Así el estudiante ve el diagrama aunque su plataforma no soporte Mermaid. Para un motor con soporte nativo, podés reemplazar la imagen por el contenido .mmd dentro de un bloque de lenguaje mermaid. Evitá mostrar ambos a la vez si duplica información.

Las imágenes tienen texto alternativo y una explicación bajo el diagrama. El color acompaña la estructura; no es el único indicador de una ruta. No se incluyen scripts web, dependencias de CDN ni imágenes que deban descargarse durante la lectura.

## Modalidad y duración

La ruta autónoma ampliada suma 830 minutos orientativos: 13 horas y 50 minutos entre lectura, experimentación, prácticas y proyecto. No debe prometerse como una lectura completa de cuatro horas.

Para conservar una instancia guiada de 240 minutos basada en la presentación original, usá esta selección y dejá el resto como preparación o profundización:

| Tramo | Minutos | Trabajo central |
| --- | --- | --- |
| Fundamentos | 30 | Tópicos 1.1 a 1.4; decisión breve de 1.6 |
| Graph API | 40 | 2.2, 2.3, reducer de 2.4 y práctica 2.6 |
| Agente con herramientas | 50 | 3.1 a 3.3; casos de evidencia de 3.5 |
| Pausa | 10 | Descanso |
| Persistencia y aprobación | 40 | 4.1 a 4.3; comprobación de recuperación |
| Orquestación avanzada | 35 | 5.1 a 5.3; comparación de 5.4 y 5.5 |
| Operación y proyecto | 35 | 6.1, criterios de 6.3 y diseño de 6.5 |

La instalación se realiza antes de esa instancia guiada. El proyecto se completa fuera de ese bloque. La modalidad autónoma permite resolver todas las actividades sin esa restricción temporal.

## Actividades y respuestas

Cada tópico incluye una comprobación de comprensión con respuesta razonada. Las prácticas tienen soluciones de referencia y casos de borde. Para una evaluación sumativa, la plataforma puede colocar las soluciones en un bloque que se habilite después de responder; el Markdown las mantiene disponibles para estudio autónomo.

La rúbrica del tópico 6.6 evalúa control de flujo, estado y recuperación, herramientas y evidencia, pruebas/observabilidad y simplicidad. Si se agregan acciones reales, deben evaluarse además autorización e idempotencia. La demostración SIMULADO no constituye una integración externa certificada.

## Si el contenido alimenta un tutor de IA

Conservá la identidad completa curso/módulo/tópico y la jerarquía de encabezados al segmentar. Mantener juntos código y explicación evita respuestas que presentan fragmentos incompletos como programas autónomos. Un diagrama debe conservar su explicación y su texto alternativo.

Las respuestas razonadas pueden usarse para feedback, pero conviene pedir primero una predicción o solución al estudiante. Los hechos específicos de la implementación deben citar el tópico correspondiente. Los enlaces oficiales permiten actualizar APIs sin perder la versión base del laboratorio.

## Revisión previa a la publicación

Comprobá que abran las imágenes y archivos adjuntos, que las tablas mantengan columnas, que el código conserve sangría y que los enlaces anterior/siguiente respeten el orden. Verificá también que la plataforma no ejecute automáticamente bloques Python y que las variantes con proveedor permanezcan identificadas como opcionales.

[Volver al curso](README.md).
