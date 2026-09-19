import type { LessonPlan } from "../../../types/api";
import { gt, scene, visual } from "./helpers";

/** Golden lesson "minimal-topic": un tópico breve, 2 escenas, sin
 * checkpoint ni escenas forzadas — confirma que la clase no se alarga
 * artificialmente para un tema corto (REGLA 7 del prompt). */
export const MINIMAL_TOPIC_LESSON: LessonPlan = {
  lesson_id: "lesson-golden-minimal-topic",
  course_id: "curso-golden",
  module_id: "modulo-golden",
  topic_id: "que-es-un-pod",
  content_sha256: "golden-minimal-topic",
  prompt_version: "lesson-v3",
  provider: "golden-fixture",
  model: "golden-fixture",
  lesson_title: gt("¿Qué es un Pod?"),
  learning_objectives: [gt("Reconocer qué es un Pod en Kubernetes.")],
  scenes: [
    scene({
      scene_id: "SCENE-001",
      scene_type: "opening",
      title: gt("La unidad mínima de despliegue"),
      key_points: [gt("Un Pod agrupa uno o más contenedores.")],
      narration: [gt("Un Pod es la unidad más pequeña que se puede desplegar en Kubernetes.")],
      visual: visual({ visual_type: "hero" }),
    }),
    scene({
      scene_id: "SCENE-002",
      scene_type: "recap",
      title: gt("En resumen"),
      key_points: [gt("Un Pod es la unidad mínima de despliegue.")],
      narration: [gt("Eso es todo lo que dice el material sobre este tema puntual.")],
      visual: visual({ visual_type: "bullets" }),
    }),
  ],
  recap: [gt("Un Pod agrupa uno o más contenedores como la unidad mínima de despliegue.")],
  cached: false,
  generated_at: "2026-01-01T00:00:00Z",
};
