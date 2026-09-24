import type {
  AiStatusResponse,
  CertificationPracticeResult,
  CertificationPrepareRequest,
  CertificationPrepareResponse,
  CheckpointEvaluationBody,
  CheckpointRequest,
  CourseDetail,
  CourseDiagnosticsResponse,
  CourseSummary,
  EvaluateSimulationRequest,
  GroundingResponse,
  LessonPlan,
  QuestionEvaluation,
  ReadyResponse,
  SystemStatusResponse,
  TopicResponse,
  TutorReplyBody,
  TutorRequest,
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/** Bug real de v1.6.1, dos intentos hasta llegar acá (ver
 * `docs/RICH_MARKDOWN_RENDERING_V1_6_1.md` para el detalle completo):
 *
 * 1. Codificar segmento a segmento (preservando "/" literales) no
 *    alcanza: un browser real (WHATWG URL Standard, no solo RFC 3986)
 *    aplica "remove_dot_segments" sobre el PATH de la URL antes de
 *    enviar el request, y ese algoritmo reconoce un segmento como "."/
 *    ".." incluso si sus puntos vienen percent-encoded (`%2E`/`%2e`) --
 *    confirmado en runtime real: `new URL(".../assets/%2E%2E/foo.png")`
 *    sigue colapsando a `.../foo.png`, perdiendo el segmento `assets`
 *    que precede al `..`.
 * 2. La única codificación que sobrevive intacta es tratar TODO
 *    `assetPath` (incluidos los "/" internos) como UN ÚNICO segmento de
 *    URL: `encodeURIComponent` sobre el string completo. Como el
 *    resultado nunca contiene un "/" literal, "remove_dot_segments"
 *    nunca lo reconoce como segmento "."/".." (el chequeo es sobre el
 *    segmento completo, no un prefijo) sin importar cuántos `../` tenga
 *    `assetPath` al principio. El backend ya sabe decodificar esto:
 *    Starlette hace `unquote()` del parámetro `{asset_path:path}` antes
 *    de que `resolve_topic_asset` lo use, reconstruyendo los "/"
 *    internos correctamente (mismo mecanismo ya cubierto por
 *    `test_encoded_traversal_returns_404` en el backend, que usa
 *    exactamente este patrón). La seguridad real nunca dependió de que
 *    el string de la URL contuviera o no "..": `resolve_topic_asset`
 *    valida con `Path.resolve()` + `is_relative_to(course_root)` sobre
 *    la ruta REAL en disco. */
export function getTopicAssetUrl(
  courseId: string,
  moduleId: string,
  topicId: string,
  assetPath: string
): string {
  const encodedPath = encodeURIComponent(assetPath);
  return `${API_BASE_URL}/api/courses/${courseId}/modules/${moduleId}/topics/${topicId}/assets/${encodedPath}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options?: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal }
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options?.method ?? "GET",
    headers: options?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore, keep statusText
    }
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getCourses: () => request<CourseSummary[]>("/api/courses"),
  getCourse: (courseId: string) => request<CourseDetail>(`/api/courses/${courseId}`),
  getTopic: (courseId: string, moduleId: string, topicId: string) =>
    request<TopicResponse>(
      `/api/courses/${courseId}/modules/${moduleId}/topics/${topicId}`
    ),
  // Herramienta de inspección/desarrollo (ver panel "Información de
  // grounding" en ClassroomPage, visible solo en modo desarrollo).
  getTopicGrounding: (courseId: string, moduleId: string, topicId: string) =>
    request<GroundingResponse>(
      `/api/courses/${courseId}/modules/${moduleId}/topics/${topicId}/grounding`
    ),
  // Fase 3: estado no sensible del proveedor LLM configurado en el backend.
  getAiStatus: () => request<AiStatusResponse>("/api/ai/status"),
  // Fase 3: genera (o recupera de cache) la LessonPlan de un tópico. Nunca
  // se envía desde acá ninguna credencial, prompt ni ruta de filesystem:
  // solo course/module/topic (ya en la URL) y force_regenerate.
  generateLesson: (
    courseId: string,
    moduleId: string,
    topicId: string,
    forceRegenerate = false
  ) =>
    request<LessonPlan>(
      `/api/courses/${courseId}/modules/${moduleId}/topics/${topicId}/lesson`,
      { method: "POST", body: { force_regenerate: forceRegenerate } }
    ),
  // Fase 5: tutor interactivo grounded. `signal` permite cancelar la
  // solicitud (AbortController) al cambiar de tópico o desmontar el aula.
  askTutor: (
    courseId: string,
    moduleId: string,
    topicId: string,
    body: TutorRequest,
    signal?: AbortSignal
  ) =>
    request<TutorReplyBody>(
      `/api/courses/${courseId}/modules/${moduleId}/topics/${topicId}/tutor`,
      { method: "POST", body, signal }
    ),
  // Fase 5: evaluación grounded de un checkpoint de comprensión.
  evaluateCheckpoint: (
    courseId: string,
    moduleId: string,
    topicId: string,
    body: CheckpointRequest,
    signal?: AbortSignal
  ) =>
    request<CheckpointEvaluationBody>(
      `/api/courses/${courseId}/modules/${moduleId}/topics/${topicId}/checkpoint`,
      { method: "POST", body, signal }
    ),
  // Fase 6: práctica/simulacro de certificación grounded. `prepare` NUNCA
  // devuelve el answer key (ver ExamQuestionView); solo se llama al
  // pulsar "Preparar práctica", nunca automáticamente.
  prepareCertification: (
    courseId: string,
    body: CertificationPrepareRequest,
    signal?: AbortSignal
  ) =>
    request<CertificationPrepareResponse>(`/api/courses/${courseId}/certification/prepare`, {
      method: "POST",
      body,
      signal,
    }),
  evaluateCertificationQuestion: (
    courseId: string,
    body: { bank_id: string; question_id: string; selected_option_ids: string[] },
    signal?: AbortSignal
  ) =>
    request<QuestionEvaluation>(`/api/courses/${courseId}/certification/evaluate-question`, {
      method: "POST",
      body,
      signal,
    }),
  evaluateCertificationSimulation: (
    courseId: string,
    body: EvaluateSimulationRequest,
    signal?: AbortSignal
  ) =>
    request<CertificationPracticeResult>(`/api/courses/${courseId}/certification/evaluate`, {
      method: "POST",
      body,
      signal,
    }),
  // Fase 7: estado del sistema (nunca expone secretos/paths completos).
  getSystemStatus: () => request<SystemStatusResponse>("/api/system/status"),
  getCourseDiagnostics: () => request<CourseDiagnosticsResponse>("/api/system/course-diagnostics"),
  getReady: () => request<ReadyResponse>("/api/ready"),
  // Fase 7: síntesis de voz neural opcional. Nunca envía API key/model/
  // voice/instructions — eso es configuración exclusiva del backend.
  // Devuelve un Blob (audio/mpeg), no JSON: no puede pasar por `request`.
  synthesizeSpeech: async (text: string, speed = 1.0, signal?: AbortSignal): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/api/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speed }),
      signal,
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body.detail ?? detail;
      } catch {
        // ignore, keep statusText
      }
      throw new ApiError(response.status, detail);
    }
    return response.blob();
  },
};
