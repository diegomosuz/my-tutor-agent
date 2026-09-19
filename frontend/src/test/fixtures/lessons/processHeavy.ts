import type { LessonPlan } from "../../../types/api";
import { gt, scene, visual } from "./helpers";

/** Golden lesson "process-heavy": tópico técnico centrado en un
 * procedimiento de varios pasos (p.ej. un pipeline de deploy). */
export const PROCESS_HEAVY_LESSON: LessonPlan = {
  lesson_id: "lesson-golden-process-heavy",
  course_id: "curso-golden",
  module_id: "modulo-golden",
  topic_id: "pipeline-de-deploy",
  content_sha256: "golden-process-heavy",
  prompt_version: "lesson-v3",
  provider: "golden-fixture",
  model: "golden-fixture",
  lesson_title: gt("Pipeline de despliegue continuo"),
  learning_objectives: [gt("Entender las etapas del pipeline de CI/CD.")],
  scenes: [
    scene({
      scene_id: "SCENE-001",
      scene_type: "opening",
      title: gt("¿Qué es un pipeline de CI/CD?"),
      key_points: [gt("Automatiza build, test y deploy.")],
      narration: [gt("Un pipeline de integración continua automatiza cada paso desde el commit hasta producción.")],
      visual: visual({ visual_type: "hero" }),
    }),
    scene({
      scene_id: "SCENE-002",
      scene_type: "process",
      title: gt("Etapas del pipeline"),
      narration: [gt("Cada etapa depende del éxito de la anterior — si el build falla, el pipeline se detiene ahí.")],
      visual: visual({
        visual_type: "process",
        process_steps: [
          { label: "Commit", detail: "El desarrollador sube un cambio." },
          { label: "Build", detail: "Se compila el proyecto." },
          { label: "Test", detail: "Se corren los tests automatizados." },
          { label: "Deploy a staging", detail: "" },
          { label: "Deploy a producción", detail: "Solo si staging pasó." },
        ],
      }),
    }),
    scene({
      scene_id: "SCENE-003",
      scene_type: "checkpoint",
      title: gt("Comprobemos"),
      key_points: [gt("¿Qué pasa si falla el build?")],
      narration: [gt("Antes de seguir, verifiquemos que quedó clara la secuencia.")],
      visual: visual({ visual_type: "bullets" }),
      interaction: {
        interaction_type: "comprehension_check",
        question: gt("¿Qué ocurre con el pipeline si la etapa de build falla?"),
        expected_answer: gt("El pipeline se detiene ahí y no continúa a test/deploy."),
      },
    }),
    scene({
      scene_id: "SCENE-004",
      scene_type: "recap",
      title: gt("Resumen"),
      key_points: [gt("Commit -> Build -> Test -> Deploy staging -> Deploy producción.")],
      narration: [gt("Repasamos las 5 etapas del pipeline en orden.")],
      visual: visual({ visual_type: "bullets" }),
    }),
  ],
  recap: [gt("El pipeline automatiza build, test y deploy en etapas secuenciales.")],
  cached: false,
  generated_at: "2026-01-01T00:00:00Z",
};
