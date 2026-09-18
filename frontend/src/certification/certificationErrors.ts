import { ApiError } from "../api/client";

/** Traduce un error de /certification/* a un mensaje claro, sin filtrar
 * nunca detalles técnicos (el backend ya garantiza eso en su `detail`).
 * Deliberadamente independiente de `classroom/tutorErrors.ts`: la
 * práctica de certificación es una feature separada del tutor/aula (ver
 * sección 59 de la especificación de Fase 6: "no mezclar chat y
 * certification"). */
export function describeCertificationError(err: unknown): { title: string; detail: string } {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 503:
        return {
          title: "IA no configurada",
          detail:
            err.message ||
            "El backend todavía no tiene una credencial de proveedor LLM disponible para preparar preguntas nuevas.",
        };
      case 502:
        return {
          title: "Error del proveedor",
          detail: err.message || "El proveedor de IA no respondió correctamente.",
        };
      case 422:
        return {
          title: "No se pudo completar",
          detail: err.message || "La solicitud no es válida con el material disponible.",
        };
      case 404:
        return {
          title: "No encontrado",
          detail: err.message || "No se encontró el curso, el módulo, el tópico o la pregunta indicada.",
        };
      default:
        return { title: "No se pudo completar la solicitud", detail: err.message };
    }
  }
  return {
    title: "Problema de conexión",
    detail: "No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.",
  };
}
