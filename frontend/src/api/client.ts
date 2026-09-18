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

/** URL absoluta y segura de un asset (imagen) relativo de un tópico (Fase
 * 7, sección 13): nunca construye una ruta de filesystem, solo delega en
 * el endpoint contextual del backend. `assetPath` se codifica segmento a
 * segmento para preservar "/" internos del path relativo. */
export function getTopicAssetUrl(
  courseId: string,
  moduleId: string,
  topicId: string,
  assetPath: string
): string {
  const encodedPath = assetPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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
