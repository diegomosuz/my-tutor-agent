import type { LessonPlan } from "../../../types/api";
import { gt, scene, visual } from "./helpers";

/** Golden lesson "hierarchy-heavy" (v1.2.0, bloque "Visual Fidelity"):
 * una jerarquía real (raíz + 4 hijos, vía nodes/edges en patrón
 * "estrella") y una jerarquía LEGACY (sin nodes, solo key_points) para
 * probar el fallback hacia atrás — mismo caso real auditado en
 * `claude-foundations-certification` (modulo-2-anatomia: "La pila de
 * componentes" -> Rol/Contexto/Tarea/Restricciones/Formato). */
export const HIERARCHY_HEAVY_LESSON: LessonPlan = {
  lesson_id: "lesson-golden-hierarchy-heavy",
  course_id: "curso-golden",
  module_id: "modulo-golden",
  topic_id: "componentes-de-un-prompt",
  content_sha256: "golden-hierarchy-heavy",
  prompt_version: "lesson-v3.1",
  provider: "golden-fixture",
  model: "golden-fixture",
  lesson_title: gt("Componentes de un prompt eficaz"),
  learning_objectives: [gt("Reconocer los componentes que forman un prompt profesional.")],
  scenes: [
    scene({
      scene_id: "SCENE-001",
      scene_type: "opening",
      title: gt("La pila de componentes"),
      key_points: [gt("Cinco componentes sostienen casi todo el peso de un prompt.")],
      narration: [gt("Vamos a ver los componentes que conforman un prompt eficaz.")],
      visual: visual({ visual_type: "hero" }),
    }),
    scene({
      // Raíz real ("root") + 4 hijos, vía edges en patrón estrella
      // (todas las edges salen de "root" hacia cada componente) — el
      // renderer debe usar root.label como encabezado, no scene.title.
      scene_id: "SCENE-002",
      scene_type: "concept",
      title: gt("Componentes de un prompt eficaz"),
      narration: [gt("Cada componente controla una función distinta del resultado.")],
      visual: visual({
        visual_type: "hierarchy",
        nodes: [
          { id: "root", label: "Componentes de un prompt eficaz", description: "", role: "concept" },
          { id: "rol", label: "Rol", description: "A quién representa Claude.", role: "concept" },
          { id: "contexto", label: "Contexto", description: "Información de fondo necesaria.", role: "concept" },
          { id: "tarea", label: "Tarea", description: "La acción específica a realizar.", role: "concept" },
          { id: "restricciones", label: "Restricciones", description: "Los límites del resultado.", role: "concept" },
        ],
        edges: [
          { from_id: "root", to_id: "rol", label: "", relation_type: "contains" },
          { from_id: "root", to_id: "contexto", label: "", relation_type: "contains" },
          { from_id: "root", to_id: "tarea", label: "", relation_type: "contains" },
          { from_id: "root", to_id: "restricciones", label: "", relation_type: "contains" },
        ],
      }),
    }),
    scene({
      // Jerarquía LEGACY: sin nodes (LessonPlan anterior al bloque de
      // Visual Fidelity) — el renderer debe caer exactamente al
      // comportamiento previo (key_points como hijos de scene.title).
      scene_id: "SCENE-003",
      scene_type: "concept",
      title: gt("Formato de salida"),
      key_points: [
        gt("Tabla."),
        gt("Lista con viñetas."),
        gt("Memorando de tres párrafos."),
        gt("Borrador de correo electrónico."),
      ],
      narration: [gt("El formato de salida define la forma que debe adoptar el resultado.")],
      visual: visual({ visual_type: "hierarchy" }),
    }),
    scene({
      scene_id: "SCENE-004",
      scene_type: "recap",
      title: gt("Resumen"),
      key_points: [gt("Cinco componentes: rol, contexto, tarea, restricciones y formato.")],
      narration: [gt("Repasamos los componentes que sostienen un prompt eficaz.")],
      visual: visual({ visual_type: "bullets" }),
    }),
  ],
  recap: [gt("Nombrar los componentes convierte el prompting en una lista de comprobación revisable.")],
  cached: false,
  generated_at: "2026-01-01T00:00:00Z",
};
