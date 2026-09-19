import type { LessonPlan } from "../../../types/api";
import { gt, scene, visual } from "./helpers";

/** Golden lesson "comparison-heavy": contraste explícito entre dos
 * enfoques, en modo tabla (filas reales) y en modo cards. */
export const COMPARISON_HEAVY_LESSON: LessonPlan = {
  lesson_id: "lesson-golden-comparison-heavy",
  course_id: "curso-golden",
  module_id: "modulo-golden",
  topic_id: "sistemas-tradicionales-vs-ia",
  content_sha256: "golden-comparison-heavy",
  prompt_version: "lesson-v3",
  provider: "golden-fixture",
  model: "golden-fixture",
  lesson_title: gt("Sistemas tradicionales vs. sistemas con IA"),
  learning_objectives: [gt("Distinguir el enfoque determinístico del probabilístico.")],
  scenes: [
    scene({
      scene_id: "SCENE-001",
      scene_type: "opening",
      title: gt("Dos formas de resolver un problema"),
      key_points: [gt("Reglas fijas vs. aprendizaje a partir de datos.")],
      narration: [gt("Vamos a comparar cómo cada enfoque procesa una misma entrada.")],
      visual: visual({ visual_type: "hero" }),
    }),
    scene({
      scene_id: "SCENE-002",
      scene_type: "comparison",
      title: gt("Comparación fila por fila"),
      narration: [gt("Cada fila muestra el mismo aspecto visto desde los dos enfoques.")],
      visual: visual({
        visual_type: "comparison",
        comparison: {
          column_labels: ["Sistema tradicional", "Sistema con IA"],
          rows: [
            { label: "Entradas", values: ["Reglas programadas a mano", "Datos de entrenamiento"] },
            { label: "Proceso", values: ["Lógica condicional fija", "Inferencia estadística"] },
            { label: "Resultado", values: ["Determinístico", "Probabilístico"] },
          ],
        },
      }),
    }),
    scene({
      scene_id: "SCENE-003",
      scene_type: "comparison",
      title: gt("En una frase"),
      key_points: [gt("Predecible pero rígido."), gt("Flexible pero requiere datos.")],
      narration: [gt("Resumiendo la idea central de cada enfoque en una sola frase.")],
      visual: visual({
        visual_type: "comparison",
        comparison: { column_labels: ["Tradicional", "Con IA"], rows: [] },
      }),
    }),
    scene({
      scene_id: "SCENE-004",
      scene_type: "recap",
      title: gt("Resumen"),
      key_points: [gt("La diferencia clave está en cómo se define el comportamiento del sistema.")],
      narration: [gt("Repasemos la diferencia central entre ambos enfoques.")],
      visual: visual({ visual_type: "bullets" }),
    }),
  ],
  recap: [gt("Un sistema tradicional sigue reglas fijas; uno con IA infiere a partir de datos.")],
  cached: false,
  generated_at: "2026-01-01T00:00:00Z",
};
