import { ApiError } from "../api/client";

/** Traduce un error de /tutor o /checkpoint a un mensaje claro, sin
 * filtrar nunca detalles técnicos (el backend ya garantiza eso en su
 * `detail`; acá solo categorizamos por status code para un encabezado más
 * claro, igual que `lessonErrors.ts` — Fase 3). */
export function describeTutorError(err: unknown): { title: string; detail: string } {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 503:
        return {
          title: "IA no configurada",
          detail: err.message || "El backend todavía no tiene una credencial de proveedor LLM disponible.",
        };
      case 502:
        return {
          title: "Error del proveedor",
          detail: err.message || "El proveedor de IA no respondió correctamente.",
        };
      case 422:
        return {
          title: "Respuesta inválida",
          detail: err.message || "El tutor no pudo generar una respuesta válida para esta pregunta.",
        };
      case 409:
        return {
          title: "No disponible para esta escena",
          detail: err.message || "Esta escena no tiene una comprobación de comprensión para evaluar.",
        };
      case 404:
        return { title: "No disponible", detail: err.message || "No encontrado." };
      default:
        return { title: "No se pudo completar la solicitud", detail: err.message };
    }
  }
  return {
    title: "Problema de conexión",
    detail: "No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.",
  };
}
