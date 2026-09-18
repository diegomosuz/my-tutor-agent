import type { CourseDetail, CourseSummary, TopicResponse } from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
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
};
