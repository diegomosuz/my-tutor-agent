import type { LessonPlan } from "../../../types/api";
import { gt, scene, visual } from "./helpers";

/** Golden lesson "architecture-heavy": componentes técnicos con
 * relaciones reales (nodes/edges), más una escena de código y una de
 * concept_map para diferenciarla visualmente de architecture. */
export const ARCHITECTURE_HEAVY_LESSON: LessonPlan = {
  lesson_id: "lesson-golden-architecture-heavy",
  course_id: "curso-golden",
  module_id: "modulo-golden",
  topic_id: "arquitectura-de-referencia",
  content_sha256: "golden-architecture-heavy",
  prompt_version: "lesson-v3",
  provider: "golden-fixture",
  model: "golden-fixture",
  lesson_title: gt("Arquitectura de referencia del sistema"),
  learning_objectives: [gt("Identificar los componentes principales y cómo se conectan.")],
  scenes: [
    scene({
      scene_id: "SCENE-001",
      scene_type: "opening",
      title: gt("Componentes del sistema"),
      key_points: [gt("API Gateway, servicio de negocio y base de datos.")],
      narration: [gt("Vamos a recorrer cómo se conectan las tres piezas principales del sistema.")],
      visual: visual({ visual_type: "hero" }),
    }),
    scene({
      scene_id: "SCENE-002",
      scene_type: "architecture",
      title: gt("Diagrama de arquitectura"),
      narration: [gt("El API Gateway recibe la request, la reenvía al servicio, y el servicio consulta la base de datos.")],
      visual: visual({
        visual_type: "architecture",
        nodes: [
          { id: "gateway", label: "API Gateway", description: "Punto de entrada único.", role: "component" },
          { id: "service", label: "Servicio de negocio", description: "", role: "service" },
          { id: "db", label: "Base de datos", description: "", role: "datastore" },
        ],
        edges: [
          { from_id: "gateway", to_id: "service", label: "reenvía", relation_type: "flows_to" },
          { from_id: "service", to_id: "db", label: "consulta", relation_type: "depends_on" },
        ],
      }),
    }),
    scene({
      scene_id: "SCENE-003",
      scene_type: "concept",
      title: gt("Conceptos relacionados"),
      narration: [gt("Estos conceptos aparecen juntos en el material cuando se describe esta arquitectura.")],
      visual: visual({
        visual_type: "concept_map",
        nodes: [
          { id: "escalabilidad", label: "Escalabilidad", description: "", role: "concept" },
          { id: "desacoplamiento", label: "Desacoplamiento", description: "", role: "concept" },
        ],
        edges: [{ from_id: "escalabilidad", to_id: "desacoplamiento", label: "", relation_type: "relates_to" }],
      }),
    }),
    scene({
      scene_id: "SCENE-004",
      scene_type: "example",
      title: gt("Configuración del Gateway"),
      narration: [gt("Así se ve la configuración citada en el material.")],
      visual: visual({ visual_type: "code" }),
    }),
    scene({
      scene_id: "SCENE-005",
      scene_type: "recap",
      title: gt("Resumen"),
      key_points: [gt("Gateway -> Servicio -> Base de datos.")],
      narration: [gt("Repasamos el flujo completo de una request.")],
      visual: visual({ visual_type: "bullets" }),
    }),
  ],
  recap: [gt("El API Gateway enruta al servicio de negocio, que a su vez consulta la base de datos.")],
  cached: false,
  generated_at: "2026-01-01T00:00:00Z",
};
