# Glosario de derivación de programas y su aplicación moderna

| Término | Definición operacional en el curso |
|---|---|
| Algoritmo derivado | Programa obtenido desde la especificación mediante transformaciones justificadas. |
| Anotación | Predicado intercalado entre instrucciones para expresar una obligación de corrección. |
| Arreglo | Función indexada sobre un dominio finito de enteros. |
| Arreglo auxiliar | Estado tabulado introducido para sostener invariantes o recurrencias eficientemente. |
| Asignación simultánea | Actualización de varias variables con lados derechos evaluados en el estado anterior. |
| Bloque local | Alcance donde variables auxiliares se declaran sin modificar la interfaz exterior. |
| Cálculo de predicados | Álgebra de expresiones lógicas usada para transformar especificaciones. |
| Candidato | Estado, índice o par de índices que aún puede satisfacer la especificación. |
| Comando guardado | Par `B→S`: `S` puede ejecutarse si la guarda `B` es verdadera. |
| Conjunción | `P∧Q`; exige que ambas propiedades sean ciertas. |
| Corrección parcial | Si termina, el resultado satisface `Q`; no demuestra terminación. |
| Corrección total | Toda ejecución desde `P` termina satisfaciendo `Q`. |
| Cuantificación | Combinación de valores de un rango por un operador (`Σ`, `∀`, `max`, etc.). |
| Dominancia | Relación que permite descartar candidatos sin perder la solución requerida. |
| Equivalencia | `P≡Q`: ambos predicados tienen el mismo valor en todos los estados relevantes. |
| Estado | Asignación de valores a las variables del programa. |
| Especificación | Declaración formal de espacio de estados, condiciones de entrada y resultado. |
| Evidencia | Test, cálculo, herramienta o argumento vinculado con una propiedad. |
| Existencial | `(∃i:R.i:P.i)`: existe al menos un testigo dentro del rango. |
| Fortalecimiento | Añadir un predicado para conservar información útil que permita avanzar la derivación. |
| Función acotada | Expresión entera inferiormente acotada que disminuye en cada iteración habilitada. |
| Guarda | Predicado que decide qué rama está habilitada. |
| Implicación | `P⇒Q`: si `P` vale, entonces `Q` debe valer. |
| Índice | Valor entero dentro del dominio de un arreglo. |
| Invariante | Predicado que permanece cierto antes y después de cada iteración del ciclo. |
| Invariante de cola | Invariante que expresa trabajo pendiente combinado con resultado parcial. |
| Ley de un punto | Eliminación de un cuantificador cuyo rango fija la variable a un único valor. |
| Ley de separación | Regla que aísla un elemento o partición del rango de una cuantificación. |
| Mejor caso | Costo inferior sobre entradas de un tamaño dado para un algoritmo y métrica. |
| Memoria auxiliar | Espacio adicional utilizado por variables, tablas o estructuras temporales. |
| Monotonía | Propiedad que permite afirmar un orden de valores o candidatos al mover una frontera. |
| No determinismo | Varias ramas guardadas podrían ejecutarse; la prueba cubre todas las posibles. |
| Obligación de prueba | Enunciado matemático que debe verificarse para establecer la corrección. |
| Ordenamiento | Transformación que garantiza orden y preservación de los elementos. |
| `P` | Precondición de un programa. |
| `Q` | Postcondición de un programa. |
| Predicado | Función de estados en valores booleanos. |
| Predicado más fuerte | `P` más fuerte que `Q` si `P⇒Q`. |
| Precondición más débil | `wp.S.Q`: conjunto más amplio de estados desde los cuales `S` garantiza `Q`. |
| Prueba por contraejemplo | Exhibición de un caso que refuta una afirmación universal. |
| Quicksort | Ordenamiento cuya corrección se deriva de una partición correcta y subordenamientos. |
| Rango | Predicado que restringe las variables ligadas de una cuantificación. |
| Región descartada | Parte del espacio de búsqueda demostrada irrelevante para la respuesta. |
| Repetición | `do ... od`; ejecuta una rama habilitada hasta que ninguna lo está. |
| Segmento | Intervalo de índices `[p,q)` consecutivos; longitud `q-p`. |
| Selección | `if ... fi`; elige una rama habilitada o aborta si ninguna está habilitada. |
| Slope search | Técnica de frontera bidimensional que elimina regiones por monotonía. |
| SDD | Spec-Driven Development; enfoque contemporáneo de especificación por capacidades. |
| Skill de agente | Archivo de instrucciones que describe cuándo y cómo ejecutar una tarea especializada. |
| Sustitución | Reemplazo de variables por expresiones según reglas de ámbito y estado. |
| Traducción semántica | Transformación del programa formal a un lenguaje preservando sus propiedades. |
| Universal | `(∀i:R.i:P.i)`: todas las posiciones del rango satisfacen `P`. |
| Ventana deslizante | Segmento con extremos móviles usado cuando la propiedad permite descartar comienzos. |
| `wp` | Abreviatura de *weakest precondition*, transformador central del cálculo de programas. |
