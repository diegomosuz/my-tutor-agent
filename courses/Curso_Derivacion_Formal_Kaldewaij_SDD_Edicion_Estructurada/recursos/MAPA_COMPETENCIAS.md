# Mapa de competencias del curso

## Perfil de egreso

La persona egresada **especifica, deriva, implementa, justifica y revisa** programas cuya corrección se sustenta en transformaciones lógicas y cuya eficiencia es analizada con precisión. En software moderno, distingue lo matemáticamente demostrado de las garantías condicionadas por servicios externos y pruebas empíricas.

## Competencias transversales

- **CT1 — Formalizar:** convertir enunciados en espacio de estados, `P` y `Q` completos.
- **CT2 — Derivar:** usar leyes, `wp`, cuantificadores, guardas e invariantes.
- **CT3 — Demostrar:** establecer y preservar invariantes; justificar terminación y postcondición.
- **CT4 — Optimizar:** derivar mejoras y evaluar costos con modelo explícito.
- **CT5 — Implementar:** traducir al lenguaje objetivo sin alterar la semántica.
- **CT6 — Auditar:** encontrar supuestos, contraejemplos y evidencias incompletas.
- **CT7 — Aplicar:** integrar estas habilidades en specs SDD y trabajo con agentes.

## Matriz de resultados

| Capítulo | Competencias primarias | Evidencia principal | Criterio fundamental |
|---|---|---|---|
| 00 | CT1 | Especificación de máximo | Relación entrada–salida inequívoca |
| 01 | CT1,CT2 | Demostración algebraica | Cada igualdad justificada |
| 02 | CT2,CT3 | Programa de división anotado | Invariante, salida, terminación |
| 03 | CT1,CT2 | Expansión de rangos | Cuantificaciones correctas |
| 04 | CT2,CT3,CT4 | Tres invariantes distintos | Origen y suficiencia del invariante |
| 05 | CT3,CT4 | División/Fibonacci eficientes | Misma postcondición y menor costo |
| 06 | CT2,CT3,CT4 | Búsqueda binaria derivada | Descarte universal correcto |
| 07 | CT1,CT4 | Algoritmos de segmentos | Rangos y ventanas definidos |
| 08 | CT2,CT4 | Búsqueda por pendiente | Eliminaciones no pierden soluciones |
| 09 | CT1–CT4 | Portafolio de problemas | Elegir estrategia, no memorizar |
| 10 | CT2,CT3,CT5 | Bandera tricolor/rotación | Permutación + particiones |
| 11 | CT3,CT4 | Pruebas de sort | Orden + multiconjunto |
| 12 | CT2–CT4 | Tabla auxiliar/LCS | Recurrencias y bordes |
| 13 | CT5,CT6 | Contrato API/ML | Supuestos externos explícitos |
| 14 | CT1,CT7 | Specs por feature | Independencia y aceptación |
| 15 | CT6,CT7 | Revisión adversarial | Sin auto-certificación de LLM |
| 16 | CT7 | Skill funcional | Artefactos, disparadores, límites |
| 17 | CT3,CT6 | Matriz de pruebas | Tipo de evidencia correcto |
| 18 | CT1–CT7 | API ML + pruebas | Derivación–código–tests trazables |

## Niveles de dominio

- **Inicial:** reconoce símbolos y reproduce procedimientos con guía.
- **En desarrollo:** identifica P/Q e invariante, pero necesita apoyo para justificar transformaciones.
- **Competente:** entrega derivación completa, correcta y revisable de problemas habituales.
- **Avanzado:** encuentra contraejemplos, mejora algoritmos, maneja supuestos y guía revisiones independientes.

## Secuencia didáctica

1. **Comprensión de un problema:** discusión de dominio y especificación.
2. **Modelado:** expresiones matemáticas completas.
3. **Derivación:** cálculos comentados.
4. **Defensa:** argumentación de cada paso.
5. **Implementación:** traducción al lenguaje.
6. **Auditoría:** tests, contraejemplos y límites.
7. **Transferencia:** aplicación a otro dominio sin copiar solución.

Para considerar lograda una competencia se necesita **evidencia de desempeño**, no solo aprobar una prueba de reconocimiento de conceptos.
