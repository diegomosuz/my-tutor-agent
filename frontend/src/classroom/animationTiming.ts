// Timing centralizado de Pedagogical Animations (PARTE 20 de la
// especificación): el timing pertenece a la aplicación, nunca al LLM (que
// no produce duraciones ni delays -- ver pedagogicalAnimation.ts). Un
// único lugar en vez de números mágicos dispersos en CSS/componentes.
export const ANIMATION_TIMING = {
  /** Espera antes del primer paso, tras montar la escena -- da tiempo a
   * que el layout (posiciones de DiagramCanvas) se asiente antes de
   * empezar a revelar. */
  initialDelayMs: 300,
  /** Intervalo entre pasos de la secuencia (reveal de un step/connector/
   * node/edge/group). */
  stepIntervalMs: 700,
} as const;
