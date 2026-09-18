import { ApiError } from "../api/client";

/**
 * Traduce un error de `POST .../lesson` a un mensaje claro para el
 * alumno, sin filtrar nunca detalles técnicos (stack traces, prompts,
 * Grounding Packet, respuesta cruda del proveedor) — el backend ya
 * garantiza eso en el `detail` del error HTTP; acá solo categorizamos
 * por status code para un encabezado más claro.
 */
export function describeLessonError(err: unknown): { title: string; detail: string } {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 503:
        return {
          title: "IA no configurada",
          detail:
            err.message ||
            "El backend todavía no tiene una credencial de proveedor LLM disponible.",
        };
      case 502:
        return {
          title: "Error del proveedor",
          detail: err.message || "El proveedor de IA no respondió correctamente.",
        };
      case 422:
        return {
          title: "LessonPlan inválida",
          detail:
            err.message ||
            "La IA generó una clase que no pudo validarse contra el material del tópico.",
        };
      case 404:
        return { title: "Tópico no disponible", detail: err.message || "No encontrado." };
      default:
        return { title: "No se pudo generar la clase", detail: err.message };
    }
  }
  return {
    title: "Problema de conexión",
    detail: "No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.",
  };
}
