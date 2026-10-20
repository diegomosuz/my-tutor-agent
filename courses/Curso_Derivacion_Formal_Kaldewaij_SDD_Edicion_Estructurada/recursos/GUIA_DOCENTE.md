# Guía docente y planificación por competencias

## Público objetivo y prerrequisitos

Programadores con experiencia básica en funciones, ciclos, arreglos, enteros y pruebas, familiaridad con una sintaxis imperativa y disposición a trabajar con lógica de predicados. Los capítulos 13–18 son recomendables para equipos que usan Python, APIs, SDD y agentes de código; no se necesitan para dominar la parte clásica.

## Carga total sugerida: 112 horas

| Unidad | Horas |
|---|---:|
| Introducción (00) | 4 |
| 01 Cálculo de predicados | 5 |
| 02 Comandos guardados | 8 |
| 03 Cuantificaciones | 6 |
| 04 Técnicas generales | 8 |
| 05 Eficiencia | 6 |
| 06 Búsqueda | 6 |
| 07 Segmentos | 6 |
| 08 Slope search | 7 |
| 09 Mixtos | 5 |
| 10 Arreglos | 7 |
| 11 Ordenamiento | 8 |
| 12 Auxiliares | 8 |
| 13–17 Aplicaciones actuales (5×4 h) | 20 |
| 18 Laboratorio integrador | 8 |
| **TOTAL** | **112** |

## Diseño de cada sesión

- **10 %**: situación problema y explicitación de competencia.
- **20 %**: explicación formal con ejemplos de transformaciones.
- **30 %**: derivación guiada (docente pregunta «¿qué predicado debe sobrevivir?»).
- **25 %**: derivación individual o por parejas, con crítica cruzada.
- **15 %**: evaluación de evidencia, cierre y plan de mejora.

Los porcentajes son sugeridos; el objetivo es que la práctica de **escribir pruebas** ocupe más tiempo que escuchar explicaciones.

## Evaluaciones por hitos

| Hito | Capítulos | Entregable | Competencias |
|---|---|---|---|
| E1 | 00–03 | Cuaderno de equivalencias + programa con ciclo | CT1–CT3 |
| E2 | 04–06 | Derivaciones comparadas (correcta y eficiente) | CT2–CT4 |
| E3 | 07–09 | Portafolio segmentos/búsqueda/slope | CT1–CT4 |
| E4 | 10–12 | Partición, sort y auxiliar | CT2–CT5 |
| E5 | 13–17 | Especificación y skills del equipo | CT5–CT7 |
| EF | 18 + integración | API ML y dossier de verificación | CT1–CT7 |

## Método de corrección

1. Validar **especificación**: ¿dominios, casos vacíos, resultados no encontrados?
2. Validar **leyes**: ¿cada paso es equivalencia o solo implicación?
3. Validar **invariante**: ¿se inicializa, preserva y ayuda a concluir `Q`?
4. Validar **terminación**: ¿función acotada bien fundada y decreciente?
5. Validar **costos**: ¿métrica y casos adecuados?
6. Validar **transferencia**: ¿la traducción al código agrega hipótesis no declaradas?

**Técnica evaluativa:** plantear una demostración con un error de implicación y pedir que el estudiante produzca un contraejemplo concreto; esto mide comprensión mejor que repetir definiciones.

## Adaptación a modalidades

- **Autodidacta:** leer, resolver sin ver ejemplos, comparar derivación y reformular el invariante.
- **Aula:** exposición con prueba colaborativa y defensa oral breve.
- **Equipo de software:** una spec real por pareja; implementador y revisor independientes.

## Política de uso de IA

El agente puede proponer un invariante y asistir con notación, pero el estudiante o programador debe justificar cada transformación. Prohibido presentar una cadena generada por IA como prueba sin revisarla. Exigir registro de los supuestos del agente, de una posible refutación y de las correcciones incorporadas.

## Observación sobre rigor y derechos de autor

El curso cubre el mapa temático del libro, pero **no reemplaza ni reproduce integralmente** las demostraciones y ejercicios originales: usa explicaciones, derivaciones y ejemplos propios. El libro debe emplearse como fuente primaria de estudio y contraste, especialmente para demostraciones extendidas de capítulos 7–12.
