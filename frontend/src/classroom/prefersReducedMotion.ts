// Detección JS de `prefers-reduced-motion` (PARTE 25 de la especificación
// de Pedagogical Animations). Hasta este bloque, ningún componente
// consultaba `matchMedia` en JS: las transiciones CSS existentes
// (`classroom-stagger-item`/`classroom-scene-enter`) se desactivaban
// puramente vía `@media (prefers-reduced-motion: reduce)` en global.css,
// lo cual alcanza para animaciones 100% CSS.
//
// La animación pedagógica NO es CSS puro: un `setTimeout` encadenado en
// `usePedagogicalAnimation` decide CUÁNDO cada elemento pasa a visible.
// Ese temporizador seguiría corriendo aunque el CSS fuerce `opacity: 1` —
// el contenido terminaría viéndose bien, pero el usuario igual
// experimentaría un reveal progresivo que pidió explícitamente evitar. Por
// eso este helper existe: `usePedagogicalAnimation` lo consulta para saltar
// directo al estado final (ver PARTE 14/25), sin programar ningún timer.
//
// Sigue habiendo un respaldo CSS puro (global.css) para cualquier
// elemento que, por un motivo no previsto, quedara con una clase
// `pedagogical-hidden` aplicada — defensa en profundidad, nunca la única
// vía.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
