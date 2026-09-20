import type { TutorCourseSource } from "../types/api";

/**
 * Deduplica `TutorCourseSource` por identidad de tópico
 * (`module_id` + `topic_id`), preservando el orden de PRIMERA aparición
 * (v1.4.0, Bloque 3 — "Provenance UX + Related Topic Navigation").
 *
 * Una misma respuesta del tutor puede citar varios `SourceBlock`s del
 * MISMO tópico (dos `COURSE-SRC-XXX` con igual `module_id`/`topic_id`,
 * distinto `original_source_ref`) — el alumno nunca debe ver dos items
 * "Temas relacionados" para el mismo tema. Nunca ordena alfabéticamente:
 * eso destruiría el orden de relevancia real que ya decidió el retrieval
 * determinístico del Bloque 1 (`course_retrieval.py`). Resuelto
 * enteramente en frontend — no hace falta tocar el backend para esto.
 */
export function dedupeCourseSourcesByTopic(
  sources: TutorCourseSource[]
): TutorCourseSource[] {
  const seen = new Set<string>();
  const result: TutorCourseSource[] = [];
  for (const source of sources) {
    const key = `${source.module_id}::${source.topic_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }
  return result;
}
