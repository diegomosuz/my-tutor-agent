import type { ElementStatus } from "../usePedagogicalAnimation";

/** Mapea el estado de un elemento animado a UNA clase CSS sobria (PARTE
 * 22/43 de la especificación): nunca `display:none` (mantiene el
 * elemento en el accessibility tree, ver PARTE 26), nunca una clase
 * generada dinámicamente por contenido — siempre una de estas tres. */
export function pedagogicalStatusClass(status: ElementStatus): string {
  switch (status) {
    case "hidden":
      return "pedagogical-hidden";
    case "active":
      return "pedagogical-active";
    case "revealed":
      return "pedagogical-revealed";
  }
}
