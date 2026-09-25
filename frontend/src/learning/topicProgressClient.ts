// Cliente delgado de progreso curricular server-side (v1.7.0, Bloque 2).
// Ver docs/SERVER_SIDE_PROFILE_V1_7.md seccion "Bloque 2".
//
// `markTopicStartedServer`/`markTopicCompletedServer` son "best effort":
// nunca lanzan hacia el llamador (mismo criterio que ya regia
// `learningProgressStore.ts` con localStorage: "es una conveniencia,
// nunca debe romper el aula"). Un fallo de red aca nunca bloquea ni
// rompe la clase: simplemente esa actualizacion puntual no queda
// reflejada server-side hasta el proximo evento (abrir el topico de nuevo
// ya reintenta "start", completar de nuevo reintenta "complete" -- ambas
// acciones son idempotentes, asi que un reintento futuro converge solo).
import { api } from "../api/client";

export function markTopicStartedServer(courseId: string, moduleId: string, topicId: string): void {
  api.markTopicProgress(courseId, moduleId, topicId, { action: "start" }).catch(() => {
    // Best-effort: ver docstring del modulo.
  });
}

export function markTopicCompletedServer(courseId: string, moduleId: string, topicId: string): void {
  api.markTopicProgress(courseId, moduleId, topicId, { action: "complete" }).catch(() => {
    // Best-effort: ver docstring del modulo.
  });
}

/** A diferencia de mark started/completed, el reset es una accion
 * explicita del alumno (boton + confirm en SettingsPage): aca SI
 * propaga el error para que la UI pueda informarlo, nunca lo swallowea. */
export function resetCourseProgressServer(courseId: string): Promise<void> {
  return api.resetCourseProgressServer(courseId);
}
